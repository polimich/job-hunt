<script setup lang="ts">
import type { Component } from 'vue';
import { RouterLink } from 'vue-router';
import { ArchiveIcon, CircleAlertIcon, FilePenLineIcon, HistoryIcon, PlusIcon, RefreshCwIcon, RotateCcwIcon } from '@lucide/vue';
import type { RefreshRun } from '../../shared/types';
import CompanyAvatar from '../components/CompanyAvatar.vue';
import FitBadge from '../components/FitBadge.vue';
import PageHeader from '../components/PageHeader.vue';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { formatDateTime } from '../format';
import { db, listingById, progress, startRefresh } from '../store';

type Key = keyof Pick<RefreshRun, 'added' | 'closed' | 'changed' | 'reopened'>;
const groups: { key: Key; label: string; icon: Component; tone: string }[] = [
  { key: 'added', label: 'Nové', icon: PlusIcon, tone: 'bg-success-soft text-success' },
  { key: 'closed', label: 'Uzavřené', icon: ArchiveIcon, tone: 'bg-danger-soft text-destructive' },
  { key: 'changed', label: 'Změněný text', icon: FilePenLineIcon, tone: 'bg-warning-soft text-warning' },
  { key: 'reopened', label: 'Znovu otevřené', icon: RotateCcwIcon, tone: 'bg-info-soft text-info' },
];
const empty = (r: RefreshRun) => !r.added.length && !r.closed.length && !r.changed.length && !r.reopened.length;
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-8 px-6 pt-8 pb-16">
    <PageHeader
      title="Změny po obnovení"
      description="Obnovení ověří všechny otevřené pozice, prohledá LinkedIn, jobs.cz a StartupJobs a přidá nové. Trvá několik minut, protože LinkedIn omezuje počet dotazů. Nové pozice dostanou shodu odhadnutou podle klíčových slov (značka ~), dokud ji neupravíš."
    >
      <Button :disabled="progress.running" @click="startRefresh()">
        <RefreshCwIcon :class="cn(progress.running && 'animate-spin')" />
        {{ progress.running ? 'Obnovuji…' : 'Obnovit inzeráty' }}
      </Button>
    </PageHeader>

    <Empty v-if="!db.runs.length" class="rounded-xl border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon"><HistoryIcon /></EmptyMedia>
        <EmptyTitle>Zatím žádné obnovení</EmptyTitle>
        <EmptyDescription>Spusť první obnovení a tady uvidíš, co přibylo a co zmizelo.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" :disabled="progress.running" @click="startRefresh()"><RefreshCwIcon /> Obnovit</Button>
      </EmptyContent>
    </Empty>

    <ol v-else class="relative flex flex-col gap-6 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-border">
      <li v-for="run in db.runs" :key="run.at" class="relative pl-8">
        <span class="absolute top-1.5 left-0 size-[15px] rounded-full border-4 border-background bg-primary ring-1 ring-border" />
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-semibold">{{ formatDateTime(run.at) }}</h2>
            <span
              v-for="g in groups.filter((g) => run[g.key].length)"
              :key="g.key"
              :class="cn('inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium', g.tone)"
            ><component :is="g.icon" class="size-3" />{{ run[g.key].length }}</span>
            <span v-if="empty(run)" class="text-xs text-muted-foreground">Beze změn</span>
          </div>

          <div v-if="!empty(run) || run.errors.length" class="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
            <template v-for="g in groups" :key="g.key">
              <div v-if="run[g.key].length" class="flex flex-col gap-1 p-3">
                <h3 class="flex items-center gap-1.5 px-1 pb-1 text-xs font-medium text-muted-foreground">
                  <component :is="g.icon" class="size-3.5" /> {{ g.label }} · {{ run[g.key].length }}
                </h3>
                <template v-for="id in run[g.key]" :key="id">
                  <RouterLink
                    v-if="listingById.get(id)"
                    :to="`/pozice/${id}`"
                    class="flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-muted/60"
                  >
                    <CompanyAvatar :name="listingById.get(id)!.company" size="sm" />
                    <span class="min-w-0 flex-1 truncate text-sm">
                      <span class="font-medium">{{ listingById.get(id)!.company }}</span>
                      <span class="text-muted-foreground"> · {{ listingById.get(id)!.title }}</span>
                    </span>
                    <FitBadge :fit="listingById.get(id)!.fit" :auto="listingById.get(id)!.fitSource === 'auto'" size="sm" />
                  </RouterLink>
                  <span v-else class="px-1 py-1 text-sm text-muted-foreground">{{ id }}</span>
                </template>
              </div>
            </template>
            <div v-if="run.errors.length" class="flex flex-col gap-1 bg-warning-soft/40 p-3">
              <h3 class="flex items-center gap-1.5 px-1 pb-1 text-xs font-medium text-warning">
                <CircleAlertIcon class="size-3.5" /> Nepodařilo se · {{ run.errors.length }}
              </h3>
              <p v-for="e in run.errors" :key="e" class="px-1 font-mono text-xs break-all text-muted-foreground">{{ e }}</p>
            </div>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>
