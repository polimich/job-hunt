<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowUpDownIcon,
  KeyboardIcon,
  ListFilterIcon,
  MailIcon,
  SearchIcon,
  SearchXIcon,
  StarIcon,
  XIcon,
} from '@lucide/vue';
import { type Listing, type Status } from '../../shared/types';
import CompanyAvatar from '../components/CompanyAvatar.vue';
import FilterChip from '../components/FilterChip.vue';
import RatingStars from '../components/RatingStars.vue';
import FitBadge from '../components/FitBadge.vue';
import ListingDetail from '../components/ListingDetail.vue';
import SalaryRange from '../components/SalaryRange.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { STATUS_META, statusMeta } from '@/lib/status';
import { ENDINGS } from '../../shared/pipeline';
import { cn } from '@/lib/utils';
import { DEFAULT_FILTERS, type Filters } from '../filters';
import { bestEmail, looksCzech, mailto, PLACE_LABEL } from '../format';
import { allLabels, allTags, companyById, contactsOf, db, filters, latestAdded, setState, statusCounts, statusOf, visible } from '../store';
import { selectedId } from '../selection';
import { toast } from 'vue-sonner';

const router = useRouter();
const searchBox = ref<HTMLInputElement>();
const listEl = ref<HTMLElement>();
const showHelp = ref(false);
const moreFilters = ref(false);

const selected = computed<Listing | undefined>(() => visible.value.find((l) => l.id === selectedId.value) ?? visible.value[0]);
watch(selected, (l) => { if (l) selectedId.value = l.id; }, { immediate: true });

const places: Listing['place'][] = ['brno', 'remote', 'praha'];
function toggle<T>(list: T[], value: T) {
  const i = list.indexOf(value);
  if (i >= 0) list.splice(i, 1);
  else list.push(value);
}
function reset() {
  Object.assign(filters, structuredClone(DEFAULT_FILTERS));
}
const activeExtra = computed(
  () =>
    filters.tags.length + (filters.labels?.length ?? 0) + Number(!!filters.minRating) + Number(filters.onlyVue) + Number(filters.onlyEmail) +
    Number(filters.onlyNew) + Number(!!filters.minSalary) + Number(!!filters.size),
);
const isDefault = computed(() => {
  const { query: _q, sort: _s, ...rest } = filters;
  const { query: _dq, sort: _ds, ...def } = DEFAULT_FILTERS;
  return JSON.stringify(rest) === JSON.stringify(def);
});
watch(() => filters.query, (q, old) => {
  // Searching sorts by relevance; clearing the box goes back to match order.
  if (q && !old) filters.sort = 'relevance';
  if (!q && filters.sort === 'relevance') filters.sort = 'fit';
});

const SORTS: { value: Filters['sort']; label: string }[] = [
  { value: 'fit', label: 'Shoda' },
  { value: 'rating', label: 'Jak moc chci' },
  { value: 'salary', label: 'Mzda' },
  { value: 'newest', label: 'Nejnovější' },
  { value: 'company', label: 'Firma' },
];
const sorts = computed(() => (filters.query ? [{ value: 'relevance' as const, label: 'Relevance' }, ...SORTS] : SORTS));

// Reka Select items cannot hold an empty string, so "any size" maps to 'any'.
const size = computed({
  get: () => filters.size || 'any',
  set: (v: string) => { filters.size = v === 'any' ? '' : (v as Filters['size']); },
});

function move(step: number) {
  const list = visible.value;
  if (!list.length) return;
  const i = Math.max(0, list.findIndex((l) => l.id === selected.value?.id));
  const next = list[Math.min(list.length - 1, Math.max(0, i + step))];
  if (!next) return;
  selectedId.value = next.id;
  void nextTick(() => listEl.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
}

async function mark(status: Status) {
  const current = selected.value;
  if (!current) return;
  // Remember the neighbour first: the row may leave the filtered list once its status changes.
  const list = visible.value;
  const i = list.findIndex((l) => l.id === current.id);
  const neighbour = list[i + 1] ?? list[i - 1];
  try {
    await setState(current.id, { status });
  } catch (e) {
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
    return;
  }
  if (!visible.value.some((l) => l.id === current.id) && neighbour) selectedId.value = neighbour.id;
}

function emailDraft() {
  const l = selected.value;
  if (!l) return;
  const person = contactsOf(l.companyId).find((c) => c.email);
  const address = person?.email ?? bestEmail(companyById.value.get(l.companyId))?.address ?? '';
  const t = looksCzech(l.text || l.strengths) ? db.settings.introCs : db.settings.introEn;
  window.location.href = mailto(address, t.subject, t.body, l, person?.name);
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
  if (e.key === 'Escape') {
    if (typing) target.blur();
    return;
  }
  // Keys inside an open menu, select, popover or dialog belong to that widget.
  const inOverlay = !!target.closest('[data-slot$="-content"], [role="menu"], [role="dialog"]');
  if (typing || inOverlay || showHelp.value || e.metaKey || e.ctrlKey || e.altKey) return;
  const status = STATUS_META.find((s) => s.key && s.key === e.key);
  if (status) void mark(status.id);
  else if (e.key === 'j' || e.key === 'ArrowDown') move(1);
  else if (e.key === 'k' || e.key === 'ArrowUp') move(-1);
  else if (e.key === '/') searchBox.value?.focus();
  else if (e.key === 'o' && selected.value) window.open(selected.value.url, '_blank', 'noopener');
  else if (e.key === 'Enter' && selected.value) void router.push(`/pozice/${selected.value.id}`);
  else if (e.key === 'e') emailDraft();
  else if (e.key === '?') showHelp.value = true;
  else return;
  e.preventDefault();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

/** Only statuses that have something in them, plus any that are selected. */
const chipStatuses = computed(() => STATUS_META.filter((s) => statusCounts.value[s.id] || filters.statuses.includes(s.id)));

const SHORTCUTS: [string[], string][] = [
  [['j', 'k'], 'Další / předchozí pozice'],
  [['↵'], 'Celý text'],
  [['o'], 'Otevřít inzerát'],
  [['e'], 'E-mail firmě'],
  [['i'], 'Zajímá mě'],
  [['a'], 'Odesláno (připomínka za týden)'],
  [['v'], 'V jednání'],
  [['p'], 'Pohovor'],
  [['f'], 'Nabídka'],
  [['x'], 'Nechci'],
  [['z'], 'Zamítli'],
  [['g'], 'Bez odpovědi'],
  [['n'], 'Zpět na nové'],
  [['/'], 'Hledat'],
  [['Esc'], 'Opustit pole'],
  [['?'], 'Tahle nápověda'],
];
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- Toolbar -->
    <section class="flex flex-none flex-col gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref="searchBox"
            v-model="filters.query"
            type="search"
            placeholder="Hledat ve firmách, pozicích a textech inzerátů…"
            aria-label="Hledat"
            class="h-10 w-full rounded-xl border border-input bg-card pr-16 pl-9 text-sm shadow-soft transition-[box-shadow,border-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            v-if="filters.query"
            type="button"
            aria-label="Vymazat hledání"
            class="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="filters.query = ''"
          ><XIcon class="size-3.5" /></button>
          <Kbd v-else class="absolute top-1/2 right-2.5 hidden -translate-y-1/2 md:inline-flex">/</Kbd>
        </div>

        <Select v-model="filters.sort">
          <SelectTrigger class="h-9! w-auto gap-2 bg-card" aria-label="Řadit">
            <ArrowUpDownIcon class="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem v-for="s in sorts" :key="s.value" :value="s.value">{{ s.label }}</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" class="hidden size-9 bg-card md:inline-flex" aria-label="Klávesové zkratky" title="Klávesové zkratky (?)" @click="showHelp = true">
          <KeyboardIcon />
        </Button>
      </div>

      <div class="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <FilterChip
          v-for="s in chipStatuses"
          :key="s.id"
          :on="filters.statuses.includes(s.id)"
          @toggle="toggle(filters.statuses, s.id)"
        >
          <span :class="cn('size-1.5 rounded-full', s.dot)" />
          {{ s.label }}
          <span class="tabular-nums opacity-60">{{ statusCounts[s.id] }}</span>
        </FilterChip>

        <Separator orientation="vertical" class="mx-1 h-5!" />

        <FilterChip v-for="p in places" :key="p" :on="filters.places.includes(p)" @toggle="toggle(filters.places, p)">
          {{ PLACE_LABEL[p] }}
        </FilterChip>

        <Separator orientation="vertical" class="mx-1 h-5!" />

        <Select v-model="filters.minFit">
          <SelectTrigger
            size="sm"
            :class="cn('h-7! rounded-full px-2.5 text-xs font-medium', filters.minFit > 1 ? 'border-primary/30 bg-primary/10 text-primary' : 'text-muted-foreground')"
            aria-label="Minimální shoda"
          >
            Shoda od <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="n in 5" :key="n" :value="n">{{ n }}</SelectItem>
          </SelectContent>
        </Select>

        <FilterChip :on="filters.onlyRecommended" @toggle="filters.onlyRecommended = !filters.onlyRecommended">
          <StarIcon /> Doporučené
        </FilterChip>

        <Popover v-model:open="moreFilters">
          <PopoverTrigger as-child>
            <button
              type="button"
              :class="cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                activeExtra ? 'border-primary/30 bg-primary/10 text-primary' : 'border-dashed text-muted-foreground hover:text-foreground',
              )"
            >
              <ListFilterIcon class="size-3.5" /> Další filtry
              <span v-if="activeExtra" class="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{{ activeExtra }}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" class="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-4">
            <div class="flex flex-col gap-2">
              <p class="text-xs font-medium text-muted-foreground">Upřesnit</p>
              <div class="flex flex-wrap gap-1.5">
                <FilterChip :on="filters.onlyNew" @toggle="filters.onlyNew = !filters.onlyNew">Nové z posledního obnovení</FilterChip>
                <FilterChip :on="filters.onlyEmail" @toggle="filters.onlyEmail = !filters.onlyEmail"><MailIcon /> S e-mailem</FilterChip>
                <FilterChip :on="filters.onlyVue" @toggle="filters.onlyVue = !filters.onlyVue">Zmiňuje Vue</FilterChip>
                <FilterChip :on="!!filters.minSalary" @toggle="filters.minSalary = filters.minSalary ? 0 : db.settings.minSalary">
                  Mzda dosáhne {{ Math.round(db.settings.minSalary / 1000) }} tis.
                </FilterChip>
              </div>
            </div>
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-medium text-muted-foreground">Velikost firmy</p>
              <Select v-model="size">
                <SelectTrigger size="sm" class="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">jakákoli</SelectItem>
                  <SelectItem value="velká">velká</SelectItem>
                  <SelectItem value="střední">střední</SelectItem>
                  <SelectItem value="malá">malá</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex flex-col gap-2">
              <p class="text-xs font-medium text-muted-foreground">Jak moc chci, alespoň</p>
              <RatingStars :model-value="filters.minRating ?? 0" @update:model-value="(v) => (filters.minRating = v)" />
            </div>
            <div v-if="allLabels.length" class="flex flex-col gap-2">
              <p class="text-xs font-medium text-muted-foreground">Moje štítky</p>
              <div class="flex flex-wrap gap-1.5">
                <FilterChip v-for="t in allLabels" :key="t" :on="filters.labels?.includes(t) ?? false" @toggle="toggle((filters.labels ??= []), t)">{{ t }}</FilterChip>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <p class="text-xs font-medium text-muted-foreground">Technologie</p>
              <div class="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto scrollbar-thin">
                <FilterChip v-for="t in allTags" :key="t" :on="filters.tags.includes(t)" @toggle="toggle(filters.tags, t)">{{ t }}</FilterChip>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button v-if="!isDefault" variant="ghost" size="xs" class="text-muted-foreground" @click="reset">
          <XIcon /> Zrušit filtry
        </Button>
      </div>
    </section>

    <!-- Panes -->
    <div class="grid min-h-0 flex-1 grid-rows-[45%_1fr] md:grid-cols-[minmax(320px,400px)_1fr] md:grid-rows-1">
      <div
        ref="listEl"
        class="overflow-y-auto border-b bg-sidebar/60 scrollbar-thin md:border-r md:border-b-0"
        role="listbox"
        aria-label="Pozice"
        tabindex="0"
      >
        <p class="sticky top-0 z-10 border-b bg-sidebar/90 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
          <span class="font-medium text-foreground tabular-nums">{{ visible.length }}</span> z {{ db.listings.length }} pozic
        </p>
        <div class="flex flex-col gap-1 p-2">
          <button
            v-for="(l, i) in visible"
            :key="l.id"
            type="button"
            role="option"
            :style="{ '--i': i }"
            :aria-selected="l.id === selected?.id"
            :class="cn(
              'group relative flex w-full animate-rise items-start gap-3 overflow-hidden rounded-2xl border p-3 text-left outline-none',
              'transition-[transform,background-color,border-color,box-shadow] duration-300 ease-(--ease-spring)',
              'focus-visible:ring-3 focus-visible:ring-ring/50',
              l.id === selected?.id
                ? 'translate-x-1 border-primary/25 bg-card shadow-pop ring-2 ring-primary/15'
                : 'border-transparent hover:translate-x-0.5 hover:border-border hover:bg-card hover:shadow-soft',
              ENDINGS.includes(statusOf(l)) && statusOf(l) !== 'accepted' && 'opacity-55',
            )"
            @click="selectedId = l.id"
            @dblclick="router.push(`/pozice/${l.id}`)"
          >
            <span
              aria-hidden="true"
              :class="cn(
                'absolute inset-y-2 left-0 w-1 rounded-r-full transition-transform duration-300 ease-(--ease-spring)',
                statusOf(l) === 'new' ? 'bg-primary' : statusMeta(statusOf(l)).dot,
                l.id === selected?.id || statusOf(l) !== 'new' ? 'scale-y-100' : 'scale-y-0',
              )"
            />
            <CompanyAvatar :name="l.company" class="transition-transform duration-300 ease-(--ease-spring) group-hover:scale-110 group-hover:-rotate-6" />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex items-center gap-1.5">
                <span class="truncate text-sm font-semibold">{{ l.company }}</span>
                <span v-if="latestAdded.has(l.id)" class="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground" title="Nové z posledního obnovení">nové</span>
                <span class="flex-1" />
                <FitBadge :fit="l.fit" :auto="l.fitSource === 'auto'" size="sm" />
              </span>
              <span class="truncate text-sm text-foreground/80">{{ l.title }}</span>
              <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <StatusBadge v-if="statusOf(l) !== 'new'" :status="statusOf(l)" />
                <span>{{ PLACE_LABEL[l.place] }}</span>
                <span class="text-border">•</span>
                <SalaryRange :company="companyById.get(l.companyId)" :posted="l.salaryPosted" class="text-xs" />
                <MailIcon v-if="companyById.get(l.companyId)?.emails.length" class="size-3" aria-label="má e-mail" />
                <span v-if="l.vue" class="rounded bg-success-soft px-1 text-[10px] font-medium text-success">Vue</span>
                <RatingStars v-if="db.state[l.id]?.rating" :model-value="db.state[l.id]!.rating" readonly size="sm" />
                <span v-for="t in db.state[l.id]?.labels ?? []" :key="t" class="rounded-full bg-(--st-talking-bg) px-1.5 text-[10px] font-semibold text-(--st-talking-fg)">{{ t }}</span>
              </span>
            </span>
          </button>
        </div>

        <Empty v-if="!visible.length" class="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon"><SearchXIcon /></EmptyMedia>
            <EmptyTitle>Nic nenalezeno</EmptyTitle>
            <EmptyDescription>Žádná pozice neodpovídá filtrům.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" @click="reset">Zrušit filtry</Button>
          </EmptyContent>
        </Empty>
      </div>

      <div class="overflow-y-auto scrollbar-thin">
        <div class="mx-auto max-w-4xl px-6 pt-6 pb-16 lg:px-10">
          <Transition name="page" mode="out-in">
            <ListingDetail v-if="selected" :key="selected.id" :listing="selected" show-keys />
          </Transition>
          <Empty v-if="!selected" class="py-24">
            <EmptyHeader>
              <EmptyTitle>Vyber pozici vlevo</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    </div>

    <Dialog v-model:open="showHelp">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Klávesové zkratky</DialogTitle>
          <DialogDescription>Fungují v seznamu pozic, když nepíšeš do pole.</DialogDescription>
        </DialogHeader>
        <ul class="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <li v-for="[keys, label] in SHORTCUTS" :key="label" class="flex items-center justify-between gap-3 text-sm">
            <span class="text-muted-foreground">{{ label }}</span>
            <span class="flex gap-1"><Kbd v-for="k in keys" :key="k">{{ k }}</Kbd></span>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  </div>
</template>
