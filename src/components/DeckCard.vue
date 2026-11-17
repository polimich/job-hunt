<script setup lang="ts">
import { computed } from 'vue';
import { ClockIcon, MinusIcon, PlusIcon, TriangleAlertIcon } from '@lucide/vue';
import type { Listing, ListingSummary } from '../../shared/types';
import { matchOf } from '../../shared/deck';
import { cn } from '@/lib/utils';
import { PLACE_LABEL } from '../format';
import CompanyAvatar from './CompanyAvatar.vue';

/** One posting in the sorting deck: the facts that decide a first yes or no. */
const props = defineProps<{ listing: Listing; summary?: ListingSummary; deferred?: boolean }>();

const said = (v: string | undefined) => !!v && !/^neuvedeno/i.test(v);
/** The AI part, only when it was judged against the current wishes (older ones have no pros). */
const ai = computed(() => (props.summary?.profile ? props.summary : undefined));
const match = computed(() => matchOf(props.listing, props.summary));
const salary = computed(() => (said(props.summary?.salary) ? props.summary!.salary : props.listing.salaryPosted));
const facts = computed(() =>
  [
    // The town once: "Brno", not "Brno · Brno".
    [...new Set([PLACE_LABEL[props.listing.place], props.listing.location].filter(Boolean))].join(' · '),
    said(props.summary?.workMode) ? props.summary!.workMode : props.listing.mode,
    said(props.summary?.contract) ? props.summary!.contract : props.listing.contract,
  ].filter((t) => said(t)),
);
const stack = computed(() => (props.summary?.stack.length ? props.summary.stack : props.listing.tags).slice(0, 8));
</script>

<template>
  <article class="flex h-full flex-col overflow-hidden rounded-3xl border bg-card shadow-sm">
    <header class="flex flex-col gap-3 border-b p-5">
      <div class="flex items-center gap-3">
        <CompanyAvatar :name="listing.company" size="md" />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-sm text-muted-foreground">{{ listing.company }}<template v-if="said(summary?.companyType)"> · {{ summary!.companyType }}</template></span>
          <h2 class="text-lg leading-snug font-bold [overflow-wrap:anywhere]">{{ listing.title }}</h2>
        </div>
        <span
          :class="cn(
            'shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums',
            match >= 70 ? 'bg-(--st-interview-bg) text-(--st-interview-fg)' : match >= 40 ? 'bg-(--st-interested-bg) text-(--st-interested-fg)' : 'bg-muted text-muted-foreground',
          )"
          :title="ai ? 'Shoda s tím, co chceš a umíš (odhad AI)' : 'Shoda podle klíčových slov'"
        >{{ match }} %</span>
      </div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span :class="cn('font-semibold', !salary && 'font-normal text-muted-foreground')">{{ salary || 'mzda neuvedena' }}</span>
        <span v-for="f in facts" :key="f" class="text-muted-foreground">{{ f }}</span>
        <span v-if="deferred" class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"><ClockIcon class="size-3" /> odloženo</span>
      </div>
    </header>

    <!-- Scrolls inside the card on small screens; sideways drags still swipe. -->
    <div class="flex min-h-0 flex-1 touch-pan-y flex-col gap-4 overflow-y-auto p-5 text-sm scrollbar-thin">
      <p v-if="summary?.oneLine" class="text-base leading-snug">{{ summary.oneLine }}</p>

      <div v-if="ai && (ai.pros.length || ai.cons.length)" class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <ul class="flex flex-col gap-1">
          <li v-for="x in ai.pros" :key="x" class="flex items-start gap-1.5"><PlusIcon class="mt-0.5 size-4 shrink-0 text-success" /> {{ x }}</li>
        </ul>
        <ul class="flex flex-col gap-1">
          <li v-for="x in ai.cons" :key="x" class="flex items-start gap-1.5"><MinusIcon class="mt-0.5 size-4 shrink-0 text-warning" /> {{ x }}</li>
        </ul>
      </div>

      <div v-if="stack.length" class="flex flex-wrap gap-1">
        <span v-for="t in stack" :key="t" class="rounded-md bg-muted px-1.5 py-0.5 text-xs">{{ t }}</span>
      </div>

      <div v-if="summary?.mustHave.length">
        <h3 class="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Požadavky</h3>
        <ul class="list-disc space-y-0.5 pl-4"><li v-for="x in summary.mustHave.slice(0, 5)" :key="x">{{ x }}</li></ul>
      </div>

      <ul v-if="summary?.redFlags.length" class="flex flex-col gap-1 text-destructive">
        <li v-for="x in summary.redFlags.slice(0, 2)" :key="x" class="flex items-start gap-1.5"><TriangleAlertIcon class="mt-0.5 size-4 shrink-0" /> {{ x }}</li>
      </ul>

      <p v-if="!summary" class="text-muted-foreground">{{ listing.text.slice(0, 600) }}{{ listing.text.length > 600 ? '…' : '' }}</p>
    </div>
  </article>
</template>
