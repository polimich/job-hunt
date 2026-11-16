<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CalendarCheckIcon, ChartColumnIcon, HandshakeIcon, MessagesSquareIcon, SendIcon } from '@lucide/vue';
import { SOURCE_LABELS, type Status } from '../../shared/types';
import { statusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';
import StatTile from '../components/StatTile.vue';
import { days } from '../format';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import PageHeader from '../components/PageHeader.vue';
import { computeStats } from '../stats';
import { db, todayIso } from '../store';

const stats = computed(() => computeStats(db.listings, db.state, todayIso.value));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '–');

const tiles = computed(() => [
  { label: 'Odesláno', value: stats.value.applied, icon: SendIcon, color: 'applied' as Status, hint: `${stats.value.pending} čeká na odpověď` },
  {
    label: 'Míra odpovědí',
    value: pct(stats.value.answered, stats.value.applied),
    icon: MessagesSquareIcon,
    color: 'talking' as Status,
    hint: `${stats.value.answered} z ${stats.value.applied}${stats.value.medianReplyDays !== null ? ` · odpověď za ~${days(stats.value.medianReplyDays)}` : ''}`,
  },
  { label: 'Pohovory', value: stats.value.interviews, icon: CalendarCheckIcon, color: 'interview' as Status, hint: `${pct(stats.value.interviews, stats.value.applied)} z odeslaných` },
  { label: 'Nabídky', value: stats.value.offers, icon: HandshakeIcon, color: 'offer' as Status, hint: `${stats.value.rejected} zamítli · ${stats.value.ghosted} bez odpovědi` },
]);
/** Funnel rows coloured like their stage. */
const FUNNEL_STATUS: Status[] = ['interested', 'applied', 'talking', 'interview', 'offer'];
// Bars grow in from zero once the page is on screen.
const grown = ref(false);
onMounted(() => requestAnimationFrame(() => (grown.value = true)));

const funnelMax = computed(() => Math.max(1, ...stats.value.funnel.map((f) => f.n)));
const weekMax = computed(() => Math.max(1, ...stats.value.weeks.map((w) => w.n)));
const weekLabel = (iso: string) => `${Number(iso.slice(8))}. ${Number(iso.slice(5, 7))}.`;
const SOURCE_LABEL: Record<string, string> = SOURCE_LABELS;
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6 lg:px-10">
    <PageHeader title="Přehled" description="Jak hledání jde: kolik odesíláš, kolik se ozve, kde to funguje." />

    <Empty v-if="!stats.applied && !stats.funnel[0]!.n" class="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><ChartColumnIcon /></EmptyMedia>
        <EmptyTitle>Zatím není co počítat</EmptyTitle>
        <EmptyDescription>Čísla se objeví, jakmile začneš označovat pozice a odesílat přihlášky.</EmptyDescription>
      </EmptyHeader>
    </Empty>

    <template v-else>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile v-for="t in tiles" :key="t.label" :label="t.label" :value="t.value" :icon="t.icon" :color="t.color" :hint="t.hint" />
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Funnel -->
        <section class="rounded-2xl border bg-card p-5 shadow-soft">
          <h2 class="text-lg font-bold">Kam se pozice dostaly</h2>
          <p class="mb-4 text-xs text-muted-foreground">Nejdál dosažený krok, včetně těch, které už skončily.</p>
          <ul class="flex flex-col gap-2.5">
            <li v-for="(f, i) in stats.funnel" :key="f.label" class="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-sm" :title="`${f.label}: ${f.n}`">
              <span class="text-muted-foreground">{{ f.label }}</span>
              <span class="h-6 overflow-hidden rounded-full bg-muted/70">
                <span
                  :class="cn('block h-full rounded-full transition-[width] duration-300', statusMeta(FUNNEL_STATUS[i]!).dot)"
                  :style="{ width: grown ? `${Math.max((f.n / funnelMax) * 100, f.n ? 6 : 0)}%` : '0%' }"
                />
              </span>
              <span class="w-16 text-right tabular-nums">
                {{ f.n }}
                <span v-if="i > 1 && stats.funnel[1]!.n" class="text-xs text-muted-foreground">{{ pct(f.n, stats.funnel[1]!.n) }}</span>
              </span>
            </li>
          </ul>
        </section>

        <!-- Weekly -->
        <section class="rounded-2xl border bg-card p-5 shadow-soft">
          <h2 class="text-lg font-bold">Odesláno po týdnech</h2>
          <p class="mb-4 text-xs text-muted-foreground">Posledních 8 týdnů, podle data odeslání.</p>
          <div class="flex h-40 items-end gap-2 border-b">
            <div v-for="w in stats.weeks" :key="w.start" class="group relative flex h-full flex-1 flex-col items-center justify-end" :title="`Týden od ${weekLabel(w.start)}: ${w.n}`">
              <span v-if="w.n" class="mb-1 text-xs tabular-nums text-muted-foreground">{{ w.n }}</span>
              <span
                class="w-full max-w-9 rounded-t-xl bg-primary transition-[height,filter] duration-300 group-hover:brightness-110"
                :style="{ height: grown ? `${(w.n / weekMax) * 80}%` : '0%' }"
              />
            </div>
          </div>
          <div class="mt-1.5 flex gap-2">
            <span v-for="w in stats.weeks" :key="w.start" class="flex-1 text-center text-[10px] tabular-nums text-muted-foreground">{{ weekLabel(w.start) }}</span>
          </div>
        </section>
      </div>

      <!-- By source -->
      <section v-if="stats.bySource.length" class="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 class="text-lg font-bold">Podle zdroje</h2>
        <p class="mb-3 text-xs text-muted-foreground">Odkud přišly pozice, na které jsi odeslal(a) přihlášku, a kolik z nich odpovědělo.</p>
        <table class="w-full text-sm">
          <thead class="text-left text-xs text-muted-foreground">
            <tr><th class="py-1.5 font-medium">Zdroj</th><th class="py-1.5 text-right font-medium">Odesláno</th><th class="py-1.5 text-right font-medium">Odpověděli</th><th class="py-1.5 text-right font-medium">Míra</th><th class="hidden py-1.5 text-right font-medium sm:table-cell">Odpověď za</th></tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="r in stats.bySource" :key="r.source">
              <td class="py-2">{{ SOURCE_LABEL[r.source] ?? r.source }}</td>
              <td class="py-2 text-right tabular-nums">{{ r.applied }}</td>
              <td class="py-2 text-right tabular-nums">{{ r.answered }}</td>
              <td class="py-2 text-right tabular-nums">{{ pct(r.answered, r.applied) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <!-- By document -->
      <section v-if="stats.byDoc.length" class="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 class="text-lg font-bold">Podle verze CV</h2>
        <p class="mb-3 text-xs text-muted-foreground">Které dokumenty jsi posílal(a) a kolik firem se pak ozvalo.</p>
        <table class="w-full text-sm">
          <thead class="text-left text-xs text-muted-foreground">
            <tr><th class="py-1.5 font-medium">Dokument</th><th class="py-1.5 text-right font-medium">Odesláno</th><th class="py-1.5 text-right font-medium">Odpověděli</th><th class="py-1.5 text-right font-medium">Míra</th></tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="r in stats.byDoc" :key="r.docId">
              <td class="py-2">{{ db.docs.find((d) => d.id === r.docId)?.label ?? 'smazaný dokument' }}</td>
              <td class="py-2 text-right tabular-nums">{{ r.applied }}</td>
              <td class="py-2 text-right tabular-nums">{{ r.answered }}</td>
              <td class="py-2 text-right tabular-nums">{{ pct(r.answered, r.applied) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
