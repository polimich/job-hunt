<script setup lang="ts">
import { CheckIcon } from '@lucide/vue';
import { cn } from '@/lib/utils';

/** One numbered step of the application procedure, with a tick I set myself. */
defineProps<{ n: number; title: string; hint?: string; done?: boolean; tickable?: boolean }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <section class="flex flex-col gap-4 rounded-3xl border bg-card p-5">
    <header class="flex items-start gap-3">
      <button
        v-if="tickable"
        type="button"
        :aria-pressed="done"
        :title="done ? 'Hotovo. Kliknutím vrátíš.' : 'Označit krok jako hotový'"
        :class="cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold tabular-nums transition-colors',
          done ? 'border-transparent bg-success text-white' : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
        )"
        @click="$emit('toggle')"
      >
        <CheckIcon v-if="done" class="size-4" /><template v-else>{{ n }}</template>
      </button>
      <span v-else class="flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold text-muted-foreground tabular-nums">{{ n }}</span>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 class="text-lg leading-8 font-bold">{{ title }}</h2>
        <p v-if="hint" class="text-sm text-muted-foreground">{{ hint }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-1"><slot name="actions" /></div>
    </header>
    <slot />
  </section>
</template>
