<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Status } from '../../shared/types';
import { statusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';

const props = defineProps<{ status: Status }>();
const meta = computed(() => statusMeta(props.status));

// Pop only when the status changes, not on first render.
const bump = ref(false);
watch(
  () => props.status,
  async () => {
    bump.value = false;
    await nextTick();
    bump.value = true;
  },
);
</script>

<template>
  <span :class="cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold', meta.tone, bump && 'animate-pop')">
    <component :is="meta.icon" class="size-3" />
    {{ meta.label }}
  </span>
</template>
