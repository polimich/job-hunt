<script setup lang="ts">
import type { Component } from 'vue';
import type { Status } from '../../shared/types';
import { statusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';
import CountUp from './CountUp.vue';

/** A pastel tile with a big number. Coloured like the pipeline stage it is about. */
defineProps<{ label: string; value: number | string; icon: Component; color: Status; hint?: string; clickable?: boolean; index?: number; progress?: number }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    :style="{ '--i': index ?? 0 }"
    :class="cn(
      'group relative flex animate-rise flex-col overflow-hidden rounded-2xl p-4 text-left',
      statusMeta(color).tone,
      clickable && 'lift cursor-pointer',
    )"
    @click="$emit('click')"
  >
    <span
      aria-hidden="true"
      class="absolute -top-6 -right-6 size-24 rounded-full bg-white/35 transition-transform duration-700 ease-(--ease-spring) group-hover:scale-125 dark:bg-white/5"
    />
    <span class="relative flex items-center justify-between gap-2">
      <span class="text-xs font-semibold opacity-80">{{ label }}</span>
      <span class="flex size-8 items-center justify-center rounded-xl bg-white/60 shadow-xs transition-transform duration-500 ease-(--ease-spring) group-hover:-rotate-12 group-hover:scale-110 dark:bg-white/10">
        <component :is="icon" class="size-4" />
      </span>
    </span>
    <span class="relative mt-2 font-display text-4xl leading-none font-bold">
      <CountUp v-if="typeof value === 'number'" :value="value" />
      <template v-else>{{ value }}</template>
    </span>
    <span v-if="hint" class="relative mt-1.5 text-xs opacity-75">{{ hint }}</span>
    <span v-if="progress !== undefined" class="relative mt-2.5 h-2 overflow-hidden rounded-full bg-white/50 dark:bg-white/10">
      <span
        class="block h-full rounded-full bg-current transition-[width] duration-1000 ease-(--ease-spring)"
        :style="{ width: `${Math.min(progress, 1) * 100}%` }"
      />
    </span>
  </component>
</template>
