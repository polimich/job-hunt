<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { RefreshCwIcon, SparklesIcon, TriangleAlertIcon } from '@lucide/vue';
import type { Listing, ListingSummary } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { api, db } from '../store';
import { formatDate } from '../format';

const props = defineProps<{ listing: Listing }>();

const summary = computed(() => db.summaries[props.listing.id]);
const error = ref<string | null>(null);
const busy = ref(false);
const queued = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

type Fetched = { summary: ListingSummary | null; error: string | null };
const apply = (r: Fetched) => {
  if (r.summary) db.summaries[props.listing.id] = r.summary;
  error.value = r.error;
};

/** Without a summary yet, ask the server; while its queue runs, look again every few seconds. */
async function check() {
  if (summary.value) return stop();
  const [r, st] = await Promise.all([
    api<Fetched>(`/listings/${encodeURIComponent(props.listing.id)}/summary`),
    api<{ running: boolean; pending: number; blocked?: string }>('/summaries/status'),
  ]).catch(() => [null, null] as const);
  if (!r || !st) return stop();
  apply(r);
  queued.value = !r.summary && !r.error && st.running && !st.blocked;
  if (st.blocked && !r.summary) error.value = st.blocked;
  if (!queued.value) stop();
  else if (!timer) timer = setInterval(() => void check(), 5000);
}
function stop() {
  clearInterval(timer);
  timer = undefined;
  queued.value = false;
}
watch(() => props.listing.id, () => {
  stop();
  error.value = null;
  void check();
}, { immediate: true });
onUnmounted(stop);

async function generate() {
  busy.value = true;
  try {
    apply(await api<Fetched>(`/listings/${encodeURIComponent(props.listing.id)}/summary`, { method: 'POST' }));
    if (error.value) toast.error('Shrnutí se nepovedlo', { description: error.value });
  } catch (e) {
    toast.error('Shrnutí se nepovedlo', { description: e instanceof Error ? e.message : String(e) });
  } finally {
    busy.value = false;
  }
}

const missing = (v: string) => !v || /^neuvedeno/i.test(v);
const rows = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return [
    { label: 'Mzda', value: s.salary },
    { label: 'Práce', value: s.workMode },
    { label: 'Jazyky', value: s.languages },
    { label: 'Smlouva', value: s.contract },
    { label: 'Výběr', value: s.hiring },
    { label: 'Benefity', value: s.benefits.join(' · ') },
  ];
});
// Facts the ad leaves out go on one line, so the card stays short.
const known = computed(() => rows.value.filter((r) => !missing(r.value)));
const unknown = computed(() => rows.value.filter((r) => missing(r.value)).map((r) => r.label.toLowerCase()));
</script>

<template>
  <section class="flex flex-col gap-4 rounded-2xl border bg-card p-5">
    <header class="flex items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <SparklesIcon class="size-3.5" /> Shrnutí
      </h3>
      <Button v-if="summary" variant="ghost" size="sm" class="text-muted-foreground" :disabled="busy" title="Shrnout znovu (asi 10 s)" @click="generate">
        <RefreshCwIcon :class="busy && 'animate-spin'" /> {{ busy ? 'Shrnuji…' : 'Přegenerovat' }}
      </Button>
    </header>

    <template v-if="summary">
      <p class="text-base font-medium leading-snug">{{ summary.oneLine }}</p>

      <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
        <dt class="text-muted-foreground">Firma</dt>
        <dd>{{ summary.company }}<span v-if="!missing(summary.companyType)" class="text-muted-foreground"> · {{ summary.companyType }}</span></dd>
        <dt class="text-muted-foreground">Náplň</dt>
        <dd>{{ summary.role }}</dd>
        <template v-if="summary.mustHave.length">
          <dt class="text-muted-foreground">Požadavky</dt>
          <dd><ul class="list-disc space-y-0.5 pl-4"><li v-for="x in summary.mustHave" :key="x">{{ x }}</li></ul></dd>
        </template>
        <template v-if="summary.niceToHave.length">
          <dt class="text-muted-foreground">Výhodou</dt>
          <dd class="text-muted-foreground">{{ summary.niceToHave.join(' · ') }}</dd>
        </template>
        <template v-if="summary.stack.length">
          <dt class="text-muted-foreground">Stack</dt>
          <dd class="flex flex-wrap gap-1">
            <span v-for="t in summary.stack" :key="t" class="rounded-md bg-muted px-1.5 py-0.5 text-xs">{{ t }}</span>
          </dd>
        </template>
        <template v-for="r in known" :key="r.label">
          <dt class="text-muted-foreground">{{ r.label }}</dt>
          <dd>{{ r.value }}</dd>
        </template>
        <template v-if="unknown.length">
          <dt class="text-muted-foreground">Neuvedeno</dt>
          <dd class="text-muted-foreground">{{ unknown.join(', ') }}</dd>
        </template>
      </dl>

      <div class="flex flex-col gap-3 rounded-xl bg-muted/50 p-4 text-sm">
        <p class="text-xs text-muted-foreground">Názor AI vůči tvému profilu</p>
        <p v-if="summary.fit.matches.length"><span class="font-medium text-success">Sedí:</span> {{ summary.fit.matches.join(', ') }}</p>
        <p v-if="summary.fit.missing.length"><span class="font-medium text-warning">Chybí:</span> {{ summary.fit.missing.join(', ') }}</p>
        <p v-if="!missing(summary.fit.seniority)"><span class="font-medium">Úroveň:</span> {{ summary.fit.seniority }}</p>
        <div v-if="summary.redFlags.length">
          <p class="flex items-center gap-1.5 font-medium text-destructive"><TriangleAlertIcon class="size-3.5" /> Na co si dát pozor</p>
          <ul class="mt-1 list-disc space-y-0.5 pl-5"><li v-for="x in summary.redFlags" :key="x">{{ x }}</li></ul>
        </div>
        <div v-if="summary.questions.length">
          <p class="font-medium">Zeptej se na pohovoru</p>
          <ol class="mt-1 list-decimal space-y-0.5 pl-5"><li v-for="x in summary.questions" :key="x">{{ x }}</li></ol>
        </div>
      </div>

      <p class="text-xs text-muted-foreground">Shrnuto AI ({{ summary.model }}) {{ formatDate(summary.createdAt.slice(0, 10)) }}. Může se plést, ověř v textu níže.</p>
    </template>

    <div v-else class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span v-if="busy || queued" class="inline-flex items-center gap-2"><RefreshCwIcon class="size-4 animate-spin" /> Shrnutí se připravuje…</span>
      <template v-else>
        <span v-if="error" class="flex-1">Shrnutí se nepovedlo: {{ error }}</span>
        <span v-else-if="!listing.text" class="flex-1">Bez textu inzerátu není co shrnout.</span>
        <span v-else class="flex-1">Shrnutí zatím není.</span>
        <Button v-if="listing.text" variant="outline" size="sm" @click="generate"><SparklesIcon /> Shrnout</Button>
      </template>
    </div>
  </section>
</template>
