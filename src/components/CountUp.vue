<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { TransitionPresets, useTransition } from '@vueuse/core';

/** A number that counts up to its value, and eases to new values when they change. */
const props = defineProps<{ value: number }>();
const target = ref(0);
watch(() => props.value, (v) => (target.value = v), { immediate: true });
const shown = useTransition(target, { duration: 700, transition: TransitionPresets.easeOutCubic });
const text = computed(() => Math.round(shown.value).toLocaleString('cs-CZ'));
</script>

<template>
  <span class="tabular-nums">{{ text }}</span>
</template>
