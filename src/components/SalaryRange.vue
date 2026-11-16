<script setup lang="ts">
import { computed } from 'vue';
import type { Company } from '../../shared/types';
import { salaryRange } from '../format';
import { db } from '../store';

const props = defineProps<{ company?: Company; posted?: string }>();
const below = computed(() => !!props.company?.salary && props.company.salary.max < db.settings.minSalary);
</script>

<template>
  <span class="inline-flex items-baseline gap-1.5">
    <template v-if="posted">
      <strong class="font-semibold tabular-nums text-foreground">{{ posted }}</strong>
      <span class="text-xs text-muted-foreground">v inzerátu</span>
    </template>
    <template v-else-if="company?.salary">
      <strong
        class="font-semibold tabular-nums"
        :class="below ? 'text-destructive' : 'text-foreground'"
        :title="below ? 'Horní mez je pod tvým minimem' : undefined"
      >{{ salaryRange(company.salary) }}</strong>
      <span class="text-xs text-muted-foreground" :title="company.salary.note">{{ company.salary.basis }}</span>
    </template>
    <span v-else class="text-muted-foreground">bez odhadu</span>
  </span>
</template>
