<script setup lang="ts">
import { cn } from '@/lib/utils';

withDefaults(defineProps<{ fit: number; auto?: boolean; size?: 'sm' | 'md' }>(), { size: 'md' });
</script>

<template>
  <span
    :class="cn(
      'inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums',
      size === 'md' ? 'h-6 min-w-7 px-1.5 text-xs' : 'h-5 min-w-6 px-1 text-[11px]',
      fit >= 5
        ? 'bg-(--st-interview-dot) text-white dark:text-(--background)'
        : fit === 4
          ? 'bg-(--st-interview-bg) text-(--st-interview-fg)'
          : fit === 3
            ? 'bg-(--st-interested-bg) text-(--st-interested-fg)'
            : 'bg-muted text-muted-foreground',
    )"
    :title="auto ? `Shoda ${fit} z 5 – automatický odhad podle klíčových slov` : `Shoda ${fit} z 5`"
  >{{ fit }}<span v-if="auto" class="ml-px font-normal opacity-70">~</span></span>
</template>
