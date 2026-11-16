<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import {
  AlarmClockIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleCheckBigIcon,
  GhostIcon,
  PlusIcon,
  SparklesIcon,
  SendIcon,
  StarIcon,
} from '@lucide/vue';
import { addDays, daysBetween, looksGhosted } from '../../shared/pipeline';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import CompanyAvatar from '../components/CompanyAvatar.vue';
import FitBadge from '../components/FitBadge.vue';
import StatTile from '../components/StatTile.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { dueLabel, shortDate } from '../format';
import { addOpen, db, due, filters, followUp, latestAdded, planned, setState, statusOf, todayIso, upcomingInterviews, type AgendaItem } from '../store';

const router = useRouter();

const longDate = computed(() =>
  new Date(`${todayIso.value}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }),
);

const greeting = computed(() => {
  const h = new Date().getHours();
  return h < 10 ? 'Dobré ráno' : h < 18 ? 'Dobré odpoledne' : 'Dobrý večer';
});
const summary = computed(() => {
  const n = due.value.length;
  if (!n) return 'Dnes nic nehoří. Mrkni na nové pozice nebo něco odešli.';
  return n === 1 ? 'Dnes čeká jedna věc k vyřízení.' : `Dnes čekají ${n} ${n < 5 ? 'věci' : 'věcí'} k vyřízení.`;
});

const soon = computed(() => planned.value.filter((x) => x.state.nextAt > todayIso.value && x.state.nextAt <= addDays(todayIso.value, 7)));
const interviews = computed(() => upcomingInterviews.value.filter((x) => x.event.at <= addDays(todayIso.value, 14)));

/** Interested but not sent yet, best match first. */
const toApply = computed(() =>
  db.listings
    .filter((l) => statusOf(l) === 'interested')
    .sort((a, b) => b.fit - a.fit || Number(b.recommended) - Number(a.recommended))
    .slice(0, 6),
);
const freshCount = computed(() => db.listings.filter((l) => latestAdded.value.has(l.id) && statusOf(l) === 'new').length);

const weekStart = computed(() => {
  const d = new Date(`${todayIso.value}T12:00:00`);
  return addDays(todayIso.value, -((d.getDay() + 6) % 7));
});
const sentThisWeek = computed(() => Object.values(db.state).filter((s) => s.contactedAt && s.contactedAt >= weekStart.value).length);

const waiting = (x: AgendaItem) => x.state.status === 'applied' || x.state.status === 'talking';
const fail = (e: unknown) => toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });

async function act(p: Promise<unknown>, message?: string) {
  try {
    await p;
    if (message) toast.success(message);
  } catch (e) {
    fail(e);
  }
}

function showNew() {
  Object.assign(filters, { onlyNew: true, statuses: ['new'] });
  void router.push('/pozice');
}
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6 lg:px-10">
    <header class="flex animate-rise flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <p class="text-sm font-medium text-muted-foreground">{{ longDate[0]?.toUpperCase() }}{{ longDate.slice(1) }}</p>
        <h1 class="flex items-center gap-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {{ greeting }} <span class="inline-block origin-[70%_80%] animate-wiggle">👋</span>
        </h1>
        <p class="text-sm text-muted-foreground">{{ summary }}</p>
      </div>
      <Button variant="outline" @click="addOpen = true"><PlusIcon /> Přidat pozici</Button>
    </header>

    <!-- Summary tiles -->
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="K vyřízení" :value="due.length" :icon="AlarmClockIcon" color="offer" :index="1" />
      <StatTile label="Pohovory do 14 dní" :value="interviews.length" :icon="CalendarClockIcon" color="interview" :index="2" />
      <StatTile label="Odesláno tento týden" :value="sentThisWeek" :icon="SendIcon" color="applied" :index="3" />
      <StatTile label="Nové z obnovení" :value="freshCount" :icon="SparklesIcon" color="interested" clickable :index="4" @click="showNew" />
    </div>

    <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="flex flex-col gap-6">
        <!-- Due -->
        <section class="flex flex-col gap-2">
          <h2 class="flex items-center gap-2 text-lg font-bold">
            <AlarmClockIcon :class="cn('size-5 text-primary', due.length && 'animate-wiggle')" /> K vyřízení
          </h2>
          <div v-if="!due.length" class="flex animate-rise items-center gap-4 rounded-2xl border border-dashed bg-card/60 p-5 text-sm text-muted-foreground">
            <span class="flex size-12 shrink-0 animate-float items-center justify-center rounded-2xl bg-(--st-interview-bg) text-(--st-interview-fg)">
              <CircleCheckBigIcon class="size-6" />
            </span>
            <span><span class="block font-display text-base font-bold text-foreground">Na dnes máš hotovo</span>Až něco odešleš, připomínka se objeví tady.</span>
          </div>
          <TransitionGroup v-else name="list" tag="ul" class="relative flex flex-col gap-2.5">
            <li
              v-for="(x, i) in due"
              :key="x.listing.id"
              :style="{ '--i': i + 5 }"
              class="lift flex animate-rise flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft sm:flex-row sm:items-center"
            >
              <RouterLink :to="`/pozice/${x.listing.id}`" class="flex min-w-0 flex-1 items-center gap-3">
                <CompanyAvatar :name="x.listing.company" size="lg" class="size-12! rounded-2xl! text-base!" />
                <div class="min-w-0">
                  <p class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span class="truncate">{{ x.listing.company }}</span>
                    <StatusBadge :status="x.state.status" />
                  </p>
                  <p class="truncate text-sm font-medium">{{ x.listing.title }}</p>
                  <p class="mt-0.5 text-sm">
                    <span :class="cn('inline-flex items-center gap-1.5 font-semibold', x.state.nextAt < todayIso ? 'text-destructive' : 'text-primary')">
                      <span v-if="x.state.nextAt < todayIso" class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" /><span class="relative inline-flex size-2 rounded-full bg-destructive" /></span>
                      {{ dueLabel(daysBetween(todayIso, x.state.nextAt)) }}
                    </span>
                    <span class="text-muted-foreground"> · {{ x.state.nextNote || 'Ozvat se' }}</span>
                  </p>
                </div>
              </RouterLink>
              <div class="flex shrink-0 flex-wrap items-center gap-1.5">
                <template v-if="waiting(x)">
                  <Button v-if="looksGhosted(x.state)" size="sm" variant="outline" @click="act(setState(x.listing.id, { status: 'ghosted' }), 'Označeno jako bez odpovědi')">
                    <GhostIcon /> Bez odpovědi
                  </Button>
                  <Button size="sm" @click="act(followUp(x.listing.id, 'done'), 'Zapsáno, další připomínka za týden')"><CheckIcon /> Připomenuto</Button>
                </template>
                <Button v-else size="sm" @click="act(setState(x.listing.id, { nextAt: '' }), 'Hotovo')"><CheckIcon /> Hotovo</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button size="sm" variant="ghost" class="text-muted-foreground">Odložit <ChevronDownIcon /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem v-for="n in [1, 3, 7, 14]" :key="n" @select="act(followUp(x.listing.id, 'snooze', n))">
                      {{ n === 1 ? 'Na zítra' : n === 7 ? 'O týden' : n === 14 ? 'O dva týdny' : `O ${n} dny` }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          </TransitionGroup>
        </section>

        <!-- This week -->
        <section v-if="soon.length" class="flex flex-col gap-2">
          <h2 class="text-lg font-bold">Příštích 7 dní</h2>
          <ul class="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
            <li v-for="(x, i) in soon" :key="x.listing.id" class="animate-rise" :style="{ '--i': i + 6 }">
              <RouterLink :to="`/pozice/${x.listing.id}`" class="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-accent/60">
                <span class="w-20 shrink-0 rounded-lg bg-muted px-1.5 py-0.5 text-center whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">{{ shortDate(x.state.nextAt) }}</span>
                <span class="min-w-0 flex-1 truncate text-sm"><span class="font-medium">{{ x.listing.company }}</span> · {{ x.state.nextNote || 'Ozvat se' }}</span>
                <StatusBadge :status="x.state.status" class="hidden sm:inline-flex" />
              </RouterLink>
            </li>
          </ul>
        </section>
      </div>

      <aside class="flex flex-col gap-6">
        <!-- Interviews -->
        <section class="flex flex-col gap-2">
          <h2 class="flex items-center gap-2 text-lg font-bold"><CalendarClockIcon class="size-5 text-(--st-interview-dot)" /> Pohovory</h2>
          <p v-if="!interviews.length" class="rounded-2xl border border-dashed bg-card/60 p-4 text-sm text-muted-foreground">
            Žádný naplánovaný. Zapiš ho v detailu pozice do Historie.
          </p>
          <ul v-else class="flex flex-col gap-2">
            <li v-for="(x, i) in interviews" :key="x.event.id" class="animate-rise" :style="{ '--i': i + 5 }">
              <RouterLink :to="`/pozice/${x.listing.id}`" class="lift flex gap-3 rounded-2xl border bg-card p-3 shadow-soft">
                <div class="flex w-13 shrink-0 flex-col items-center justify-center rounded-xl bg-(--st-interview-bg) py-1.5 text-(--st-interview-fg)">
                  <span class="text-[10px] font-medium uppercase">{{ shortDate(x.event.at).split(' ')[0] }}</span>
                  <span class="font-display text-lg leading-none font-bold tabular-nums">{{ x.event.at.slice(8).replace(/^0/, '') }}.</span>
                </div>
                <div class="min-w-0 text-sm">
                  <p class="truncate font-medium">{{ x.listing.company }}</p>
                  <p class="truncate text-muted-foreground">{{ x.event.time ? `${x.event.time} · ` : '' }}{{ x.event.text || x.listing.title }}</p>
                </div>
              </RouterLink>
            </li>
          </ul>
        </section>

        <!-- Waiting to apply -->
        <section class="flex flex-col gap-2">
          <h2 class="flex items-center gap-2 text-lg font-bold"><StarIcon class="size-5 fill-(--st-interested-dot) text-(--st-interested-dot)" /> Zajímá mě, neodesláno</h2>
          <p v-if="!toApply.length" class="rounded-2xl border border-dashed bg-card/60 p-4 text-sm text-muted-foreground">
            Nic. Označ zajímavé pozice v seznamu klávesou <kbd class="rounded border px-1 font-mono text-xs">i</kbd>.
          </p>
          <TransitionGroup v-else name="list" tag="ul" class="relative divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
            <li v-for="(l, i) in toApply" :key="l.id" :style="{ '--i': i + 6 }" class="flex animate-rise items-center gap-2 bg-card py-2.5 pr-2 pl-3 transition-colors hover:bg-accent/50">
              <RouterLink :to="`/pozice/${l.id}`" class="flex min-w-0 flex-1 items-center gap-2.5">
                <FitBadge :fit="l.fit" :auto="l.fitSource === 'auto'" size="sm" />
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{{ l.title }}</span>
                  <span class="block truncate text-xs text-muted-foreground">{{ l.company }}</span>
                </span>
              </RouterLink>
              <Button size="sm" variant="ghost" class="shrink-0" @click="act(setState(l.id, { status: 'applied' }), `Odesláno: připomínka za ${db.settings.followUpDays} dní`)">
                <SendIcon /> Odesláno
              </Button>
            </li>
          </TransitionGroup>
        </section>

      </aside>
    </div>
  </div>
</template>
