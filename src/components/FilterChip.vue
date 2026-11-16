<script setup lang="ts">
import { cn } from '@/lib/utils';

defineProps<{ on: boolean }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    :aria-pressed="on"
    :class="cn(
      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap outline-none',
      'transition-[transform,background-color,border-color,color] duration-300 ease-(--ease-spring) active:scale-95',
      'focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5',
      on
        ? 'scale-[1.03] border-primary/35 bg-primary/12 text-primary shadow-xs dark:border-primary/40 dark:bg-primary/18'
        : 'border-border bg-card text-muted-foreground hover:-translate-y-px hover:border-foreground/20 hover:text-foreground dark:bg-input/20',
    )"
    @click="$emit('toggle')"
  >
    <slot />
  </button>
</template>
