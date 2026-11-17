<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { ArrowRightIcon, ChevronDownIcon, ExternalLinkIcon, HeartIcon, LayersIcon, MailIcon, MinusIcon, PlusIcon, SendIcon, XIcon } from '@lucide/vue';
import type { Listing, ListingState } from '../../shared/types';
import { emptyState } from '../../shared/pipeline';
import { matchOf } from '../../shared/deck';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import CompanyAvatar from '../components/CompanyAvatar.vue';
import ComposeDialog from '../components/ComposeDialog.vue';
import PageHeader from '../components/PageHeader.vue';
import RatingStars from '../components/RatingStars.vue';
import SummaryCard from '../components/SummaryCard.vue';
import { bestEmail, looksCzech, PLACE_LABEL } from '../format';
import { restoreState } from '../mail';
import { companyById, contactsOf, db, deck, setState, shortlist } from '../store';

const toSort = computed(() => deck.value.cards.length + deck.value.waiting);
const said = (v: string | undefined) => !!v && !/^neuvedeno/i.test(v);
const summaryOf = (l: Listing) => db.summaries[l.id];
const salaryOf = (l: Listing) => (said(summaryOf(l)?.salary) ? summaryOf(l)!.salary : l.salaryPosted);
/** Someone to write to: a person I know there, or an address of the company. */
const hasEmail = (l: Listing) => contactsOf(l.companyId).some((c) => c.email) || !!bestEmail(companyById.value.get(l.companyId));

const openId = ref<string>();

// One e-mail dialog for the page. Opening the e-mail logs it and moves the posting to "Odesláno".
const composeFor = ref<Listing>();
const composeOpen = ref(false);
function write(l: Listing) {
  composeFor.value = l;
  composeOpen.value = true;
}

/** Change the status, with a way back: both moves take the posting off this page. */
async function move(l: Listing, status: 'applied' | 'passed', message: string) {
  const before = JSON.parse(JSON.stringify(db.state[l.id] ?? emptyState())) as ListingState;
  try {
    await setState(l.id, { status });
    toast.success(message, { description: `${l.company} – ${l.title}`, action: { label: 'Zpět', onClick: () => void restoreState(l.id, before) } });
  } catch (e) {
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
  }
}

const saveNote = (l: Listing, e: Event) => {
  const note = (e.target as HTMLTextAreaElement).value;
  if (note !== (db.state[l.id]?.note ?? '')) setState(l.id, { note }).catch((err: unknown) => toast.error('Uložení selhalo', { description: String(err) }));
};
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
    <PageHeader title="Výběr" description="Pozice, které tě při třídění zaujaly. Projdi si je pořádně a ozvi se; po odeslání se přesunou do Odesláno.">
      <Button v-if="toSort" variant="outline" size="sm" as-child>
        <RouterLink to="/tridit"><LayersIcon /> Třídit dalších {{ toSort }}</RouterLink>
      </Button>
    </PageHeader>

    <article v-for="l in shortlist" :key="l.id" class="flex flex-col gap-4 rounded-3xl border bg-card p-5">
      <header class="flex items-start gap-3">
        <CompanyAvatar :name="l.company" size="md" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-sm text-muted-foreground">{{ l.company }}<template v-if="said(summaryOf(l)?.companyType)"> · {{ summaryOf(l)!.companyType }}</template></span>
          <RouterLink :to="`/pozice/${encodeURIComponent(l.id)}`" class="text-lg leading-snug font-bold [overflow-wrap:anywhere] hover:underline">{{ l.title }}</RouterLink>
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span :class="cn('font-semibold', !salaryOf(l) && 'font-normal text-muted-foreground')">{{ salaryOf(l) || 'mzda neuvedena' }}</span>
            <span class="text-muted-foreground">{{ [...new Set([PLACE_LABEL[l.place], l.location].filter(Boolean))].join(' · ') }}</span>
            <span v-if="said(summaryOf(l)?.workMode)" class="text-muted-foreground">{{ summaryOf(l)!.workMode }}</span>
          </div>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1.5">
          <span class="rounded-full bg-muted px-2.5 py-0.5 text-sm font-bold tabular-nums" title="Shoda s tím, co chceš a umíš">{{ matchOf(l, summaryOf(l)) }} %</span>
          <RatingStars :model-value="db.state[l.id]?.rating ?? 0" size="sm" @update:model-value="setState(l.id, { rating: $event })" />
        </div>
      </header>

      <p v-if="summaryOf(l)?.oneLine" class="text-sm leading-relaxed">{{ summaryOf(l)!.oneLine }}</p>

      <div v-if="summaryOf(l)?.pros.length || summaryOf(l)?.cons.length" class="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
        <ul class="flex flex-col gap-1">
          <li v-for="x in summaryOf(l)!.pros" :key="x" class="flex items-start gap-1.5"><PlusIcon class="mt-0.5 size-4 shrink-0 text-success" /> {{ x }}</li>
        </ul>
        <ul class="flex flex-col gap-1">
          <li v-for="x in summaryOf(l)!.cons" :key="x" class="flex items-start gap-1.5"><MinusIcon class="mt-0.5 size-4 shrink-0 text-warning" /> {{ x }}</li>
        </ul>
      </div>

      <button
        type="button"
        class="flex items-center gap-1.5 self-start text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
        :aria-expanded="openId === l.id"
        @click="openId = openId === l.id ? undefined : l.id"
      >
        <ChevronDownIcon :class="cn('size-3.5 transition-transform', openId !== l.id && '-rotate-90')" /> Celé shrnutí
      </button>
      <SummaryCard v-if="openId === l.id" :listing="l" />

      <Textarea
        :model-value="db.state[l.id]?.note ?? ''"
        rows="2"
        placeholder="Poznámka… (uloží se při opuštění pole)"
        :aria-label="`Poznámka k pozici ${l.title}`"
        class="min-h-14"
        @blur="saveNote(l, $event)"
      />

      <footer class="flex flex-wrap items-center gap-2">
        <Button v-if="hasEmail(l)" @click="write(l)"><MailIcon /> Napsat e-mail</Button>
        <Button v-if="l.url" as="a" :href="l.url" target="_blank" rel="noopener noreferrer" :variant="hasEmail(l) ? 'outline' : 'default'">
          <ExternalLinkIcon /> Otevřít inzerát
        </Button>
        <Button variant="outline" title="Přihlásil ses přes portál nebo jinak" @click="move(l, 'applied', 'Označeno jako odesláno')"><SendIcon /> Odesláno</Button>
        <Button variant="ghost" class="ml-auto text-muted-foreground hover:text-destructive" @click="move(l, 'passed', 'Vyřazeno')"><XIcon /> Vyřadit</Button>
      </footer>
    </article>

    <Empty v-if="!shortlist.length" class="py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon"><HeartIcon /></EmptyMedia>
        <EmptyTitle>Výběr je prázdný</EmptyTitle>
        <EmptyDescription>
          <template v-if="toSort">Na roztřídění čeká {{ toSort }} {{ toSort === 1 ? 'inzerát' : toSort < 5 ? 'inzeráty' : 'inzerátů' }}. Co tě zaujme, objeví se tady.</template>
          <template v-else>Všem vybraným ses už ozval. Co je rozjednané, najdeš v přehledu dne.</template>
        </EmptyDescription>
      </EmptyHeader>
      <Button v-if="toSort" as-child><RouterLink to="/tridit">Začít třídit <ArrowRightIcon /></RouterLink></Button>
      <Button v-else variant="outline" as-child><RouterLink to="/dnes">Přehled dne</RouterLink></Button>
    </Empty>

    <ComposeDialog v-if="composeFor" v-model:open="composeOpen" :listing="composeFor" kind="intro" :lang="looksCzech(composeFor.text) ? 'cs' : 'en'" />
  </div>
</template>
