<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { AlarmClockIcon, CalendarClockIcon, EyeIcon, EyeOffIcon } from '@lucide/vue';
import { daysBetween } from '../../shared/pipeline';
import type { Listing, Status } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { statusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';
import CompanyAvatar from '../components/CompanyAvatar.vue';
import FitBadge from '../components/FitBadge.vue';
import PageHeader from '../components/PageHeader.vue';
import RatingStars from '../components/RatingStars.vue';
import { dueLabel, shortDate } from '../format';
import { db, setState, statusOf, todayIso } from '../store';

const MAIN: Status[] = ['interested', 'applied', 'talking', 'interview', 'offer'];
const ENDED: Status[] = ['accepted', 'rejected', 'ghosted', 'passed'];

function readShowEnded(): boolean {
  try {
    return localStorage.getItem('board-ended') === '1';
  } catch {
    return false;
  }
}
const showEnded = ref(readShowEnded());
function toggleEnded() {
  showEnded.value = !showEnded.value;
  try {
    localStorage.setItem('board-ended', showEnded.value ? '1' : '0');
  } catch {
    /* not remembered, fine */
  }
}

const columns = computed(() => {
  const ids = showEnded.value ? [...MAIN, ...ENDED] : MAIN;
  const by = new Map<Status, Listing[]>(ids.map((s) => [s, []]));
  for (const l of db.listings) by.get(statusOf(l))?.push(l);
  return ids.map((id) => ({
    meta: statusMeta(id),
    // Soonest next step first, then best match.
    items: by.get(id)!.sort((a, b) => (db.state[a.id]?.nextAt || '9').localeCompare(db.state[b.id]?.nextAt || '9') || b.fit - a.fit),
  }));
});

const nextInterview = (id: string) => db.state[id]?.events.find((e) => e.kind === 'interview' && e.at >= todayIso.value);

const dragging = ref<string>();
const over = ref<Status>();

function onDragStart(e: DragEvent, l: Listing) {
  dragging.value = l.id;
  e.dataTransfer?.setData('text/plain', l.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

async function onDrop(status: Status) {
  const id = dragging.value;
  dragging.value = undefined;
  over.value = undefined;
  if (!id) return;
  const l = db.listings.find((x) => x.id === id);
  if (!l || statusOf(l) === status) return;
  try {
    await setState(id, { status });
    toast.success(`${l.company}: ${statusMeta(status).label}`);
  } catch (e) {
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
  }
}
</script>

<template>
  <div class="flex h-full flex-col gap-5 pt-6 pb-4">
    <div class="px-4 md:px-6 lg:px-10">
      <PageHeader title="Tabule" description="Rozjednané pozice podle stavu. Přetáhni kartu do jiného sloupce.">
        <Button variant="outline" size="sm" @click="toggleEnded">
          <component :is="showEnded ? EyeOffIcon : EyeIcon" /> {{ showEnded ? 'Skrýt ukončené' : 'Ukončené' }}
        </Button>
      </PageHeader>
    </div>

    <div class="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-2 scrollbar-thin md:px-6 lg:px-10">
      <section
        v-for="(col, ci) in columns"
        :key="col.meta.id"
        :aria-label="col.meta.label"
        :class="cn(
          'flex w-64 shrink-0 flex-col rounded-2xl lg:w-auto lg:min-w-52 lg:flex-1 lg:basis-0 border bg-muted/40 transition-colors',
          over === col.meta.id && 'border-primary/50 bg-primary/5',
        )"
        @dragover.prevent="over = col.meta.id"
        @dragleave="over === col.meta.id && (over = undefined)"
        @drop.prevent="onDrop(col.meta.id)"
      >
        <header class="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
          <span :class="cn('flex size-7 items-center justify-center rounded-xl', col.meta.tone)">
            <component :is="col.meta.icon" class="size-3.5" />
          </span>
          <h2 class="text-base font-bold">{{ col.meta.label }}</h2>
          <span :key="col.items.length" class="ml-auto animate-pop rounded-full bg-card/80 px-2 py-0.5 text-xs font-semibold tabular-nums shadow-xs">{{ col.items.length }}</span>
        </header>
        <TransitionGroup name="list" tag="ul" class="relative flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5 scrollbar-thin">
          <li
            v-for="l in col.items"
            :key="l.id"
            draggable="true"
            :class="cn(
              'lift cursor-grab rounded-2xl border bg-card shadow-soft active:cursor-grabbing',
              dragging === l.id && 'rotate-2 opacity-50',
            )"
            @dragstart="onDragStart($event, l)"
            @dragend="dragging = undefined; over = undefined"
          >
            <RouterLink :to="`/pozice/${l.id}`" draggable="false" class="flex flex-col gap-2 p-3.5">
              <div class="flex items-center gap-2">
                <CompanyAvatar :name="l.company" size="sm" />
                <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{{ l.company }}</span>
                <FitBadge :fit="l.fit" :auto="l.fitSource === 'auto'" size="sm" />
              </div>
              <p class="line-clamp-2 text-sm leading-snug font-semibold">{{ l.title }}</p>
              <div v-if="db.state[l.id]?.rating || db.state[l.id]?.labels?.length || db.state[l.id]?.referredBy" class="flex flex-wrap items-center gap-1.5">
                <RatingStars v-if="db.state[l.id]?.rating" :model-value="db.state[l.id]!.rating" readonly size="sm" />
                <span v-if="db.state[l.id]?.referredBy" class="rounded-full bg-(--st-offer-bg) px-1.5 text-[10px] font-semibold text-(--st-offer-fg)">doporučení</span>
                <span v-for="t in db.state[l.id]?.labels ?? []" :key="t" class="rounded-full bg-(--st-talking-bg) px-1.5 text-[10px] font-semibold text-(--st-talking-fg)">{{ t }}</span>
              </div>
              <p v-if="nextInterview(l.id)" class="flex items-center gap-1.5 text-xs font-medium text-success">
                <CalendarClockIcon class="size-3.5" /> {{ shortDate(nextInterview(l.id)!.at) }}{{ nextInterview(l.id)!.time ? ` · ${nextInterview(l.id)!.time}` : '' }}
              </p>
              <p
                v-else-if="db.state[l.id]?.nextAt"
                :class="cn(
                  'flex items-center gap-1.5 text-xs',
                  db.state[l.id]!.nextAt < todayIso ? 'font-medium text-destructive' : db.state[l.id]!.nextAt === todayIso ? 'font-medium text-warning' : 'text-muted-foreground',
                )"
              >
                <AlarmClockIcon class="size-3.5" /> {{ dueLabel(daysBetween(todayIso, db.state[l.id]!.nextAt)) }}
              </p>
            </RouterLink>
          </li>
          <li
            v-if="!col.items.length"
            key="empty"
            class="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-foreground/10 p-4 text-center text-xs text-muted-foreground"
          >
            <component :is="col.meta.icon" class="size-5 animate-float opacity-50" />
            Sem přetáhni kartu
          </li>
        </TransitionGroup>
      </section>
    </div>
  </div>
</template>
