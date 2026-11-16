<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { TransitionPresets, useTransition } from '@vueuse/core';

/** A number that eases to new values when they change (no count-up on mount). */
const props = defineProps<{ value: number }>();
const target = ref(props.value);
watch(() => props.value, (v) => (target.value = v));
const shown = useTransition(target, { duration: 700, transition: TransitionPresets.easeOutCubic });
const text = computed(() => Math.round(shown.value).toLocaleString('cs-CZ'));
</script>

<template>
  <span class="tabular-nums">{{ text }}</span>
</template>
