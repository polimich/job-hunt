<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { AlarmClockIcon, CheckIcon, GhostIcon, XIcon } from '@lucide/vue';
import { addDays, daysBetween, looksGhosted } from '../../shared/pipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { dueLabel } from '../format';
import { followUp, setState, stateOf, todayIso } from '../store';

const props = defineProps<{ id: string }>();
const st = computed(() => stateOf(props.id));
const due = computed(() => !!st.value.nextAt && st.value.nextAt <= todayIso.value);
const waiting = computed(() => st.value.status === 'applied' || st.value.status === 'talking');

const what = ref('');
watch(() => st.value.nextNote, (v) => (what.value = v), { immediate: true });

const fail = (e: unknown) => toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
const run = (p: Promise<unknown>) => p.catch(fail);

const setDate = (nextAt: string) => run(setState(props.id, { nextAt, nextNote: what.value || 'Ozvat se' }));
const saveWhat = () => what.value !== st.value.nextNote && st.value.nextAt && run(setState(props.id, { nextNote: what.value }));
const inDays = (n: number) => setDate(addDays(todayIso.value, n));
</script>

<template>
  <section :class="cn('rounded-2xl border bg-card p-3.5', due && 'border-(--st-offer-dot)/40 bg-(--st-offer-bg)/60')">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <AlarmClockIcon class="size-3.5" /> Další krok
      </h3>
      <span v-if="st.nextAt" :class="cn('text-xs font-medium', due ? 'text-warning' : 'text-muted-foreground')">
        {{ dueLabel(daysBetween(todayIso, st.nextAt)) }}
      </span>
    </div>

    <div class="flex flex-col gap-2 sm:flex-row">
      <Input
        type="date"
        aria-label="Kdy"
        class="h-8 sm:w-40"
        :model-value="st.nextAt"
        @change="setDate(($event.target as HTMLInputElement).value)"
      />
      <Input v-model="what" aria-label="Co udělat" placeholder="Co udělat… např. připomenout se" class="h-8 flex-1" @blur="saveWhat" @keydown.enter="saveWhat" />
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <template v-if="due && waiting">
        <Button size="sm" @click="run(followUp(id, 'done'))"><CheckIcon /> Připomenul(a) jsem se</Button>
        <Button v-if="looksGhosted(st)" size="sm" variant="outline" @click="run(setState(id, { status: 'ghosted' }))">
          <GhostIcon /> Bez odpovědi
        </Button>
      </template>
      <Button size="sm" variant="ghost" class="text-muted-foreground" @click="inDays(3)">+3 dny</Button>
      <Button size="sm" variant="ghost" class="text-muted-foreground" @click="inDays(7)">+týden</Button>
      <Button v-if="st.nextAt" size="sm" variant="ghost" class="text-muted-foreground" @click="setDate('')"><XIcon /> Nic</Button>
      <span v-if="st.followUps" class="ml-auto text-[11px] text-muted-foreground">Připomenutí bez odpovědi: {{ st.followUps }}</span>
    </div>
  </section>
</template>
