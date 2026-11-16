<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import {
  BellRingIcon,
  ChevronDownIcon,
  HeartIcon,
  InboxIcon,
  LanguagesIcon,
  SendIcon,
  Building2Icon,
  CalendarIcon,
  HandIcon,
  HeartHandshakeIcon,
  Trash2Icon,
  CheckIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LaptopIcon,
  MailIcon,
  MapPinIcon,
  PaperclipIcon,
  SparklesIcon,
  StarIcon,
  ThumbsUpIcon,
  TriangleAlertIcon,
  WalletIcon,
} from '@lucide/vue';
import type { EmailTemplateKind, Listing, Status } from '../../shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { bestEmail, EMAIL_KIND_LABEL, formatDate, looksCzech, PLACE_LABEL } from '../format';
import { highlight } from '../search';
import { skillMatch } from '../../shared/pipeline';
import { companyById, contactsOf, db, deleteListing, filters, latestAdded, patchListing, setState, statusOf } from '../store';
import CompanyAvatar from './CompanyAvatar.vue';
import ContactsCard from './ContactsCard.vue';
import LabelsEditor from './LabelsEditor.vue';
import RatingStars from './RatingStars.vue';
import FitBadge from './FitBadge.vue';
import NextStep from './NextStep.vue';
import OfferCard from './OfferCard.vue';
import TasksCard from './TasksCard.vue';
import SalaryRange from './SalaryRange.vue';
import StatusButtons from './StatusButtons.vue';
import Timeline from './Timeline.vue';
import ComposeDialog from './ComposeDialog.vue';
import PasteMailDialog from './PasteMailDialog.vue';

const props = defineProps<{ listing: Listing }>();

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
function toggleDoc(id: string) {
  const ids = state.value?.docIds ?? [];
  void save({ docIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
}

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

// E-mails go to a person I know there first, then the company's best address.
const recipient = computed(() => {
  const person = contactsOf(props.listing.companyId).find((c) => c.email);
  return person ? { address: person.email, name: person.name } : { address: email.value?.address ?? '', name: '' };
});

const lang = ref<'cs' | 'en'>('cs');
watch(czech, (v) => (lang.value = v ? 'cs' : 'en'), { immediate: true });

const MAILS: { kind: EmailTemplateKind; label: string; icon: Component }[] = [
  { kind: 'intro', label: 'Úvodní e-mail', icon: SendIcon },
  { kind: 'followUp', label: 'Připomenutí', icon: BellRingIcon },
  { kind: 'thankYou', label: 'Poděkování po pohovoru', icon: HeartIcon },
  { kind: 'decline', label: 'Odmítnutí nabídky', icon: HandIcon },
];
// One compose dialog serves the E-mail menu and the `e` shortcut in the list.
const composeOpen = ref(false);
const composeKind = ref<EmailTemplateKind>('intro');
function compose(kind: EmailTemplateKind) {
  composeKind.value = kind;
  composeOpen.value = true;
}
const pasteOpen = ref(false);
defineExpose({ compose });

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

const parts = computed(() => highlight(props.listing.text, filters.query));
// A listing I have not acted on yet shows only the ad, not the tracking blocks.
const tracked = computed(() => status.value !== 'new');
const match = computed(() => skillMatch(props.listing.tags, db.settings.skills ?? []));

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
  <article class="flex flex-col gap-6">
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
        <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <RatingStars :model-value="state?.rating ?? 0" @update:model-value="(v) => save({ rating: v })" />
          <LabelsEditor :model-value="state?.labels ?? []" @update:model-value="(v) => save({ labels: v })" />
        </div>
      </div>
    </header>

    <!-- Actions -->
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-2">
        <Button v-if="listing.url" as="a" :href="listing.url" target="_blank" rel="noopener noreferrer">
          <ExternalLinkIcon /> Otevřít inzerát
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline">
              <MailIcon /> E-mail
              <ChevronDownIcon class="opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-64">
            <DropdownMenuLabel class="truncate font-normal text-muted-foreground">
              Komu: {{ recipient.address || 'adresu doplníš v poště' }}{{ recipient.name ? ` (${recipient.name})` : '' }}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem v-for="m in MAILS" :key="m.kind" @select="compose(m.kind)">
              <component :is="m.icon" /> {{ m.label }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="pasteOpen = true"><InboxIcon /> Vložit přijatý e-mail…</DropdownMenuItem>
            <DropdownMenuItem @select.prevent="lang = lang === 'cs' ? 'en' : 'cs'">
              <LanguagesIcon /> Jazyk: {{ lang === 'cs' ? 'česky' : 'anglicky' }} <span class="ml-auto text-xs text-muted-foreground">přepnout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <StatusButtons :status="status" @set="setStatus" />
    </div>

    <OfferCard v-if="state?.offer || status === 'offer' || status === 'accepted'" :id="listing.id" />

    <NextStep v-if="tracked" :id="listing.id" />

    <TasksCard v-if="tracked" :listing-id="listing.id" />

    <!-- Key facts -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <section class="rounded-2xl border bg-card p-3.5">
        <h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><WalletIcon class="size-3.5" /> Odhad mzdy</h3>
        <SalaryRange :company="company" :posted="listing.salaryPosted" class="text-sm" />
        <p v-if="!listing.salaryPosted && company?.salary?.note" class="mt-1 text-xs text-muted-foreground">{{ company.salary.note }}</p>
        <p v-if="listing.salaryPosted && company?.salary" class="mt-1 text-xs text-muted-foreground">
          Odhad pro firmu: <SalaryRange :company="company" />
        </p>
      </section>

      <section class="rounded-2xl border bg-card p-3.5">
        <h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><MailIcon class="size-3.5" /> Kontakt</h3>
        <template v-if="company?.emails.length">
          <p v-for="e in company.emails" :key="e.address" class="flex min-w-0 flex-col text-sm">
            <a :href="`mailto:${e.address}`" class="truncate font-medium text-primary hover:underline underline-offset-4">{{ e.address }}</a>
            <span class="text-xs text-muted-foreground">{{ EMAIL_KIND_LABEL[e.kind] }}<template v-if="e.note"> · {{ e.note }}</template></span>
          </p>
        </template>
        <p v-else class="text-sm text-muted-foreground">Jen formulář u inzerátu.</p>
      </section>

      <section v-if="tracked" class="rounded-2xl border bg-card p-3.5">
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
        <p class="mt-3 mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><PaperclipIcon class="size-3.5" /> Odesláno s</p>
        <div v-if="db.docs.length" class="flex flex-wrap gap-1.5">
          <button
            v-for="d in db.docs"
            :key="d.id"
            type="button"
            :aria-pressed="state?.docIds?.includes(d.id) ?? false"
            :class="cn(
              'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors',
              state?.docIds?.includes(d.id) ? 'border-(--st-applied-dot)/40 bg-(--st-applied-bg) text-(--st-applied-fg)' : 'text-muted-foreground hover:border-foreground/20 hover:text-foreground',
            )"
            @click="toggleDoc(d.id)"
          >
            <CheckIcon v-if="state?.docIds?.includes(d.id)" class="size-3 animate-pop" /><FileTextIcon v-else class="size-3" /> {{ d.label }}
          </button>
        </div>
        <RouterLink v-else to="/nastaveni#dokumenty" class="text-xs text-primary hover:underline underline-offset-4">Nahraj CV v Nastavení →</RouterLink>
      </section>

      <section class="rounded-2xl border bg-card p-3.5">
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

    <!-- People -->
    <div v-if="tracked" class="flex flex-col gap-3">
      <ContactsCard :company-id="listing.companyId" :company-name="listing.company" />
      <div class="flex max-w-md flex-col gap-1.5">
        <Label :for="`ref-${listing.id}`" class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><HeartHandshakeIcon class="size-3.5" /> Doporučil(a) mě</Label>
        <Input
          :id="`ref-${listing.id}`"
          :model-value="state?.referredBy ?? ''"
          :list="`ref-list-${listing.id}`"
          placeholder="Jméno, pokud jde o doporučení"
          class="h-8"
          @change="save({ referredBy: ($event.target as HTMLInputElement).value })"
        />
        <datalist :id="`ref-list-${listing.id}`">
          <option v-for="c in contactsOf(listing.companyId)" :key="c.id" :value="c.name" />
        </datalist>
      </div>
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

    <Timeline v-if="tracked" :id="listing.id" :company-id="listing.companyId" />

    <!-- Assessment -->
    <div v-if="listing.strengths || listing.weaknesses" class="grid gap-3 md:grid-cols-2">
      <section v-if="listing.strengths" class="rounded-2xl border border-success/20 bg-success-soft/50 p-4">
        <h3 class="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-success"><ThumbsUpIcon class="size-4" /> Silné stránky</h3>
        <p class="text-sm leading-relaxed">{{ listing.strengths }}</p>
      </section>
      <section v-if="listing.weaknesses" class="rounded-2xl border border-warning/20 bg-warning-soft/50 p-4">
        <h3 class="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-warning"><TriangleAlertIcon class="size-4" /> Slabé stránky</h3>
        <p class="text-sm leading-relaxed">{{ listing.weaknesses }}</p>
      </section>
    </div>

    <!-- Stack -->
    <section class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Stack</h3>
        <span
          v-if="match.percent !== null"
          :class="cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold',
            match.percent >= 70 ? 'bg-(--st-interview-bg) text-(--st-interview-fg)' : match.percent >= 40 ? 'bg-(--st-interested-bg) text-(--st-interested-fg)' : 'bg-muted text-muted-foreground',
          )"
          :title="match.missing.length ? `Chybí: ${match.missing.join(', ')}` : 'Umíš všechno ze stacku'"
        >
          <SparklesIcon class="size-3.5" /> Umíš {{ match.percent }} % stacku
        </span>
      </div>
      <div v-if="listing.tags.length" class="flex flex-wrap gap-1.5">
        <Badge
          v-for="t in match.have"
          :key="t"
          class="bg-(--st-interview-bg) text-(--st-interview-fg)"
        ><CheckIcon /> {{ t }}</Badge>
        <Badge v-for="t in match.missing" :key="t" variant="outline" class="border-dashed text-muted-foreground">{{ t }}</Badge>
      </div>
      <p v-if="!listing.tags.length && listing.stack" class="text-sm">{{ listing.stack }}</p>
    </section>

    <section v-if="listing.benefits" class="flex flex-col gap-2">
      <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Benefity</h3>
      <p class="text-sm">{{ listing.benefits }}</p>
    </section>

    <!-- Posting text -->
    <section class="flex flex-col gap-2">
      <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Text inzerátu</h3>
      <div class="rounded-2xl border bg-card p-5">
        <p v-if="!listing.text" class="text-sm text-muted-foreground">Text se nepodařilo načíst. Otevři inzerát.</p>
        <p v-else class="text-sm leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]"><template v-for="(p, i) in parts" :key="i"><mark v-if="p.hit">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template></p>
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
    <ComposeDialog v-model:open="composeOpen" :listing="listing" :kind="composeKind" :lang="lang" />
    <PasteMailDialog v-model:open="pasteOpen" :listing="listing" />
  </article>
</template>
