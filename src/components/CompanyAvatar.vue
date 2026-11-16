<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' });

const initials = computed(() => {
  const words = props.name.replace(/\(.*?\)/g, '').split(/[\s.-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
});
// Stable hue per company, so the same firm always gets the same colour.
const hue = computed(() => [...props.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
</script>

<template>
  <span
    aria-hidden="true"
    :style="{ '--h': hue }"
    :class="cn(
      'inline-flex shrink-0 select-none items-center justify-center font-display font-bold tracking-tight',
      'bg-[oklch(0.93_0.06_var(--h))] text-[oklch(0.45_0.13_var(--h))] shadow-[inset_0_-2px_0_oklch(0.85_0.08_var(--h))]',
      'dark:bg-[oklch(0.32_0.07_var(--h))] dark:text-[oklch(0.9_0.08_var(--h))] dark:shadow-[inset_0_-2px_0_oklch(0.26_0.06_var(--h))]',
      size === 'sm' && 'size-7 rounded-lg text-[11px]',
      size === 'md' && 'size-10 rounded-xl text-sm',
      size === 'lg' && 'size-16 rounded-2xl text-xl',
    )"
  >{{ initials }}</span>
</template>
