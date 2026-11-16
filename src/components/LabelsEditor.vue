<script setup lang="ts">
import { computed, ref } from 'vue';
import { PlusIcon, TagIcon, XIcon } from '@lucide/vue';
import { allLabels } from '../store';

/** My own labels on an application: type and press Enter, click × to remove. */
const props = defineProps<{ modelValue: string[]; inputId?: string }>();
const emit = defineEmits<{ 'update:modelValue': [labels: string[]] }>();

const draft = ref('');
const listId = `labels-${Math.random().toString(36).slice(2, 8)}`;
const suggestions = computed(() => allLabels.value.filter((l) => !props.modelValue.includes(l)));

function add() {
  const l = draft.value.trim().toLowerCase();
  draft.value = '';
  if (l && !props.modelValue.includes(l)) emit('update:modelValue', [...props.modelValue, l]);
}
const remove = (l: string) => emit('update:modelValue', props.modelValue.filter((x) => x !== l));
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <TransitionGroup name="list">
      <span
        v-for="l in modelValue"
        :key="l"
        class="inline-flex h-7 items-center gap-1 rounded-full bg-(--st-talking-bg) pr-1 pl-2.5 text-xs font-semibold text-(--st-talking-fg)"
      >
        <TagIcon class="size-3" /> {{ l }}
        <button type="button" :aria-label="`Odebrat ${l}`" class="rounded-full p-0.5 transition-colors hover:bg-black/10" @click="remove(l)">
          <XIcon class="size-3" />
        </button>
      </span>
    </TransitionGroup>
    <form class="relative" @submit.prevent="add">
      <PlusIcon class="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        :id="inputId"
        v-model="draft"
        :list="listId"
        placeholder="štítek…"
        aria-label="Přidat štítek"
        class="h-7 w-28 rounded-full border border-dashed border-input bg-transparent pr-2 pl-7 text-xs outline-none transition-[width,border-color] duration-300 focus:w-40 focus:border-ring"
        @blur="add"
      />
      <datalist :id="listId">
        <option v-for="s in suggestions" :key="s" :value="s" />
      </datalist>
    </form>
  </div>
</template>
