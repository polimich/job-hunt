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
      'transition-colors duration-150',
      'focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5',
      on
        ? 'border-foreground/20 bg-secondary text-foreground'
        : 'border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground dark:bg-input/20',
    )"
    @click="$emit('toggle')"
  >
    <slot />
  </button>
</template>
