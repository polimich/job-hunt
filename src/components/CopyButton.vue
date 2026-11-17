<script setup lang="ts">
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { CheckIcon, CopyIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';

const props = defineProps<{ text: string; label?: string }>();
const copied = ref(false);

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    toast.error('Kopírování se nepovedlo', { description: 'Označ text a zkopíruj ho ručně.' });
  }
}
</script>

<template>
  <Button type="button" variant="ghost" size="sm" class="text-muted-foreground" :disabled="!text" @click="copy">
    <component :is="copied ? CheckIcon : CopyIcon" /> {{ copied ? 'Zkopírováno' : (label ?? 'Kopírovat') }}
  </Button>
</template>
