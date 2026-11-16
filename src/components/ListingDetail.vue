<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import {
  ArrowRightIcon,
  Building2Icon,
  CalendarIcon,
  HandIcon,
  Trash2Icon,
  CheckIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LaptopIcon,
  MailIcon,
  MapPinIcon,
  SparklesIcon,
  StarIcon,
  ThumbsUpIcon,
  TriangleAlertIcon,
  WalletIcon,
} from '@lucide/vue';
import type { Listing, Status } from '../../shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { bestEmail, EMAIL_KIND_LABEL, formatDate, looksCzech, mailto, PLACE_LABEL } from '../format';
import { highlight } from '../search';
import { companyById, db, deleteListing, filters, latestAdded, patchListing, setState, statusOf } from '../store';
import CompanyAvatar from './CompanyAvatar.vue';
import FitBadge from './FitBadge.vue';
import NextStep from './NextStep.vue';
import SalaryRange from './SalaryRange.vue';
import StatusButtons from './StatusButtons.vue';
import Timeline from './Timeline.vue';

const props = defineProps<{ listing: Listing; full?: boolean; showKeys?: boolean }>();

const company = computed(() => companyById.value.get(props.listing.companyId));
const state = computed(() => db.state[props.listing.id]);
const status = computed(() => statusOf(props.listing));
const email = computed(() => bestEmail(company.value));
const czech = computed(() => looksCzech(props.listing.text || props.listing.strengths));

const fail = (e: unknown) => toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });

async function save(patch: Parameters<typeof setState>[1]): Promise<boolean> {
  try {
    await setState(props.listing.id, patch);
    return true;
  } catch (e) {
    fail(e);
    return false;
  }
}
const setStatus = (s: Status) => void save({ status: s });

const note = ref('');
const noteSaved = ref(false);
watch(() => [props.listing.id, state.value?.note] as const, () => { note.value = state.value?.note ?? ''; }, { immediate: true });
async function saveNote() {
  if (note.value === (state.value?.note ?? '')) return;
  if (await save({ note: note.value })) {
    noteSaved.value = true;
    setTimeout(() => (noteSaved.value = false), 1800);
  }
}

async function patch(p: Parameters<typeof patchListing>[1]) {
  try {
    await patchListing(props.listing.id, p);
  } catch (e) {
    fail(e);
  }
}

function draft(lang: 'cs' | 'en'): string {
  const t = lang === 'cs' ? db.settings.introCs : db.settings.introEn;
  return email.value ? mailto(email.value.address, t.subject, t.body, props.listing) : '#';
}

const router = useRouter();
async function remove() {
  if (!confirm(`Smazat „${props.listing.title}“ i s historií?`)) return;
  try {
    await deleteListing(props.listing.id);
    toast.success('Pozice smazána');
    void router.push('/pozice');
  } catch (e) {
    toast.error('Smazání selhalo', { description: e instanceof Error ? e.message : String(e) });
  }
}

const PREVIEW = 1400;
const text = computed(() => {
  const t = props.listing.text;
  return props.full || t.length <= PREVIEW ? t : `${t.slice(0, PREVIEW)}…`;
});
const parts = computed(() => highlight(text.value, filters.query));
const hot = new Set(['React', 'TypeScript', 'Next.js', '.NET', 'Vue', 'MUI']);

const meta = computed(() =>
  [
    { icon: MapPinIcon, text: [PLACE_LABEL[props.listing.place], props.listing.location].filter(Boolean).join(' · ') },
    { icon: LaptopIcon, text: props.listing.mode },
    { icon: FileTextIcon, text: props.listing.contract },
    { icon: Building2Icon, text: `firma ${company.value?.size ?? 'neznámá'}` },
  ].filter((m) => m.text && m.text !== 'neuvedeno'),
);
</script>

<template>
  <article class="stagger-children flex flex-col gap-6">
    <!-- Header -->
    <header class="flex gap-4">
      <CompanyAvatar :name="listing.company" size="lg" class="hidden sm:inline-flex" />
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <div class="flex flex-wrap items-center gap-2">
          <RouterLink :to="`/firmy/${listing.companyId}`" class="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
            {{ listing.company }}
          </RouterLink>
          <Badge v-if="latestAdded.has(listing.id)" class="bg-info-soft text-info"><SparklesIcon /> nové</Badge>
          <Badge v-if="listing.recommended" class="bg-success-soft text-success"><StarIcon /> doporučeno</Badge>
          <Badge v-if="listing.manual" variant="outline" class="text-muted-foreground"><HandIcon /> přidáno ručně</Badge>
        </div>
        <h1 class="text-2xl font-semibold tracking-tight text-balance">{{ listing.title }}</h1>
        <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <li v-for="(m, i) in meta" :key="i" class="inline-flex items-center gap-1.5">
            <component :is="m.icon" class="size-3.5" />{{ m.text }}
          </li>
        </ul>
      </div>
    </header>

    <!-- Actions -->
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-2">
        <Button v-if="listing.url" as="a" :href="listing.url" target="_blank" rel="noopener noreferrer">
          <ExternalLinkIcon /> Otevřít inzerát
          <Kbd v-if="showKeys" class="ml-1 h-4 min-w-4 bg-primary-foreground/20 text-[10px] text-primary-foreground">o</Kbd>
        </Button>
        <Button v-if="!full" as-child variant="outline">
          <RouterLink :to="`/pozice/${listing.id}`">
            <FileTextIcon /> Celý text
            <Kbd v-if="showKeys" class="ml-1 h-4 min-w-4 text-[10px]">↵</Kbd>
          </RouterLink>
        </Button>
        <template v-if="email">
          <Button as="a" variant="outline" :href="draft(czech ? 'cs' : 'en')">
            <MailIcon /> E-mail {{ czech ? 'česky' : 'anglicky' }}
            <Kbd v-if="showKeys" class="ml-1 h-4 min-w-4 text-[10px]">e</Kbd>
          </Button>
          <Button as="a" variant="ghost" :href="draft(czech ? 'en' : 'cs')">{{ czech ? 'anglicky' : 'česky' }}</Button>
        </template>
      </div>
      <StatusButtons :status="status" :show-keys="showKeys" @set="setStatus" />
    </div>

    <NextStep :id="listing.id" />

    <!-- Key facts -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <section class="rounded-2xl border bg-card shadow-soft p-3.5">
        <h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><WalletIcon class="size-3.5" /> Odhad mzdy</h3>
        <SalaryRange :company="company" :posted="listing.salaryPosted" class="text-sm" />
        <p v-if="!listing.salaryPosted && company?.salary?.note" class="mt-1 text-xs text-muted-foreground">{{ company.salary.note }}</p>
        <p v-if="listing.salaryPosted && company?.salary" class="mt-1 text-xs text-muted-foreground">
          Odhad pro firmu: <SalaryRange :company="company" />
        </p>
      </section>

      <section class="rounded-2xl border bg-card shadow-soft p-3.5">
        <h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><MailIcon class="size-3.5" /> Kontakt</h3>
        <template v-if="company?.emails.length">
          <p v-for="e in company.emails" :key="e.address" class="flex min-w-0 flex-col text-sm">
            <a :href="`mailto:${e.address}`" class="truncate font-medium text-primary hover:underline underline-offset-4">{{ e.address }}</a>
            <span class="text-xs text-muted-foreground">{{ EMAIL_KIND_LABEL[e.kind] }}<template v-if="e.note"> · {{ e.note }}</template></span>
          </p>
          <p class="mt-1 text-[11px] text-muted-foreground">Životopis přilož ručně.</p>
        </template>
        <p v-else class="text-sm text-muted-foreground">Jen formulář u inzerátu.</p>
      </section>

      <section class="rounded-2xl border bg-card shadow-soft p-3.5">
        <Label :for="`contacted-${listing.id}`" class="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CalendarIcon class="size-3.5" /> Odesláno
        </Label>
        <Input
          :id="`contacted-${listing.id}`"
          type="date"
          class="h-8"
          :model-value="state?.contactedAt ?? ''"
          @change="save({ contactedAt: ($event.target as HTMLInputElement).value })"
        />
      </section>

      <section class="rounded-2xl border bg-card shadow-soft p-3.5">
        <h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><StarIcon class="size-3.5" /> Shoda</h3>
        <div class="flex items-center gap-3">
          <Select :model-value="listing.fit" @update:model-value="(v) => patch({ fit: Number(v) })">
            <SelectTrigger size="sm" aria-label="Shoda 1–5" class="w-16"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="n in 5" :key="n" :value="n">{{ n }}</SelectItem>
            </SelectContent>
          </Select>
          <Label class="flex items-center gap-2 text-sm font-normal">
            <Checkbox :model-value="listing.recommended" @update:model-value="(v) => patch({ recommended: v === true })" />
            doporučeno
          </Label>
        </div>
        <p v-if="listing.fitSource === 'auto'" class="mt-1.5 text-[11px] text-muted-foreground">Automatický odhad podle klíčových slov.</p>
      </section>
    </div>

    <!-- Note -->
    <section class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <Label :for="`note-${listing.id}`" class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Poznámka</Label>
        <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition-opacity" leave-active-class="transition-opacity duration-500">
          <span v-if="noteSaved" class="inline-flex items-center gap-1 text-xs text-success"><CheckIcon class="size-3.5" /> Uloženo</span>
        </Transition>
      </div>
      <Textarea :id="`note-${listing.id}`" v-model="note" rows="2" placeholder="Vlastní poznámka… (ukládá se při opuštění pole)" class="min-h-16 bg-card" @blur="saveNote" />
    </section>

    <Timeline :id="listing.id" />

    <!-- Assessment -->
    <div v-if="listing.strengths || listing.weaknesses" class="grid gap-3 md:grid-cols-2">
      <section v-if="listing.strengths" class="rounded-xl border border-success/20 bg-success-soft/50 p-4">
        <h3 class="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-success"><ThumbsUpIcon class="size-4" /> Silné stránky</h3>
        <p class="text-sm leading-relaxed">{{ listing.strengths }}</p>
      </section>
      <section v-if="listing.weaknesses" class="rounded-xl border border-warning/20 bg-warning-soft/50 p-4">
        <h3 class="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-warning"><TriangleAlertIcon class="size-4" /> Slabé stránky</h3>
        <p class="text-sm leading-relaxed">{{ listing.weaknesses }}</p>
      </section>
    </div>

    <!-- Stack -->
    <section class="flex flex-col gap-2">
      <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Stack</h3>
      <div v-if="listing.tags.length" class="flex flex-wrap gap-1.5">
        <Badge
          v-for="t in listing.tags"
          :key="t"
          :variant="hot.has(t) ? 'default' : 'outline'"
          :class="hot.has(t) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
        >{{ t }}</Badge>
      </div>
      <p class="text-sm">{{ listing.stack }}</p>
      <p v-if="listing.vue" class="flex items-start gap-2 text-sm">
        <Badge class="bg-success-soft text-success">Vue</Badge>
        <span class="text-muted-foreground">{{ listing.vue }}</span>
      </p>
    </section>

    <section v-if="listing.benefits" class="flex flex-col gap-2">
      <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Benefity</h3>
      <p class="text-sm">{{ listing.benefits }}</p>
    </section>

    <!-- Posting text -->
    <section class="flex flex-col gap-2">
      <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Text inzerátu</h3>
      <div class="rounded-2xl border bg-card shadow-soft p-5">
        <p v-if="!listing.text" class="text-sm text-muted-foreground">Text se nepodařilo načíst. Otevři inzerát.</p>
        <p v-else class="text-sm leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]"><template v-for="(p, i) in parts" :key="i"><mark v-if="p.hit">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template></p>
        <Button v-if="!full && listing.text.length > PREVIEW" as-child variant="link" class="mt-2 px-0">
          <RouterLink :to="`/pozice/${listing.id}`">Celý text <ArrowRightIcon /></RouterLink>
        </Button>
      </div>
    </section>

    <footer class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1.5"><FitBadge :fit="listing.fit" :auto="listing.fitSource === 'auto'" size="sm" /> shoda</span>
      <span>Poprvé viděno {{ formatDate(listing.firstSeen) }}</span>
      <span v-if="!listing.manual">Ověřeno {{ formatDate(listing.lastChecked) }}</span>
      <span v-if="!listing.open" class="text-destructive">Uzavřeno {{ formatDate(listing.closedAt ?? '') }}</span>
      <span>Zdroj {{ listing.source }}</span>
      <Button v-if="listing.manual" variant="ghost" size="sm" class="ml-auto text-muted-foreground hover:text-destructive" @click="remove">
        <Trash2Icon /> Smazat
      </Button>
    </footer>
  </article>
</template>
