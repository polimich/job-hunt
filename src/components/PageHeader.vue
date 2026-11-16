<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <header class="flex animate-rise flex-wrap items-end justify-between gap-4">
    <div class="flex min-w-0 flex-col gap-1">
      <h1 class="text-3xl font-bold tracking-tight sm:text-[2.1rem]">{{ title }}</h1>
      <p v-if="description" class="max-w-2xl text-sm text-muted-foreground">{{ description }}</p>
      <slot name="description" />
    </div>
    <div class="flex items-center gap-2"><slot /></div>
  </header>
</template>
