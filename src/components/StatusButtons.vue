<script setup lang="ts">
import { computed } from 'vue';
import { ArchiveIcon, ChevronDownIcon, FlagIcon } from '@lucide/vue';
import { ENDINGS } from '../../shared/pipeline';
import type { Status } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { STATUS_META, statusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';

const props = defineProps<{ status: Status }>();
defineEmits<{ set: [status: Status] }>();

// Forward steps are buttons; endings sit in a menu. "closed" is set by refresh, not by hand.
const steps = STATUS_META.filter((s) => !ENDINGS.includes(s.id) || s.id === 'accepted');
const endings = STATUS_META.filter((s) => ENDINGS.includes(s.id) && s.id !== 'accepted' && s.id !== 'closed');
const ended = computed(() => endings.some((s) => s.id === props.status));
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div role="group" aria-label="Stav" class="inline-flex flex-wrap gap-0.5 rounded-xl border bg-muted/50 p-0.5">
      <button
        v-for="s in steps"
        :key="s.id"
        type="button"
        :aria-pressed="status === s.id"
        :class="cn(
          'inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium transition-all outline-none',
          'focus-visible:ring-3 focus-visible:ring-ring/50',
          status === s.id
            ? cn('shadow-xs ring-1 ring-foreground/5', s.tone)
            : 'text-muted-foreground hover:bg-background hover:text-foreground',
        )"
        @click="$emit('set', s.id)"
      >
        <component :is="s.icon" class="size-3.5" />
        {{ s.label }}
      </button>
    </div>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="outline" size="sm" :class="cn('h-9 rounded-xl', ended && statusMeta(status).tone)">
          <component :is="ended ? statusMeta(status).icon : FlagIcon" />
          {{ ended ? statusMeta(status).label : 'Ukončit' }}
          <ChevronDownIcon class="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-48">
        <DropdownMenuLabel>Ukončit</DropdownMenuLabel>
        <DropdownMenuItem v-for="s in endings" :key="s.id" @select="$emit('set', s.id)">
          <component :is="s.icon" />
          {{ s.label }}
          <Kbd v-if="s.key" class="ml-auto">{{ s.key }}</Kbd>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <span v-if="status === 'closed'" class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 text-sm font-medium text-destructive">
      <ArchiveIcon class="size-3.5" /> Inzerát uzavřen
    </span>
  </div>
</template>
