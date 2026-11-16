<script setup lang="ts">
import { ref } from 'vue';
import { StarIcon } from '@lucide/vue';
import { cn } from '@/lib/utils';

/** How much I want a role, 1–5. Click a star to set it, click the same star again to clear. */
const props = withDefaults(defineProps<{ modelValue: number; readonly?: boolean; size?: 'sm' | 'md' }>(), { size: 'md' });
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const hover = ref(0);
const popped = ref(0);
function pick(n: number) {
  if (props.readonly) return;
  const next = n === props.modelValue ? 0 : n;
  popped.value = next;
  emit('update:modelValue', next);
}
const LABELS = ['', 'Spíš ne', 'Možná', 'Zajímavé', 'Moc chci', 'Vysněná práce'];
</script>

<template>
  <span
    :role="readonly ? 'img' : 'radiogroup'"
    :aria-label="readonly ? `Chci ${modelValue} z 5` : 'Jak moc to chci'"
    class="inline-flex items-center gap-0.5"
    @mouseleave="hover = 0"
  >
    <component
      :is="readonly ? 'span' : 'button'"
      v-for="n in 5"
      :key="n"
      :type="readonly ? undefined : 'button'"
      :role="readonly ? undefined : 'radio'"
      :aria-checked="readonly ? undefined : modelValue === n"
      :aria-label="readonly ? undefined : `${n} – ${LABELS[n]}`"
      :title="readonly ? undefined : LABELS[n]"
      :class="cn(
        'rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        !readonly && 'transition-transform duration-150 hover:scale-110',
      )"
      @mouseenter="!readonly && (hover = n)"
      @click="pick(n)"
    >
      <StarIcon
        :class="cn(
          size === 'sm' ? 'size-3' : 'size-5',
          'transition-colors duration-200',
          n <= (hover || modelValue) ? 'fill-(--st-interested-dot) text-(--st-interested-dot)' : 'text-foreground/20',
          popped && n <= popped && 'animate-pop',
        )"
        :style="popped && n <= popped ? { animationDelay: `${n * 40}ms` } : undefined"
      />
    </component>
    <span v-if="!readonly && (hover || modelValue)" class="ml-1.5 text-xs font-medium text-muted-foreground">{{ LABELS[hover || modelValue] }}</span>
  </span>
</template>
