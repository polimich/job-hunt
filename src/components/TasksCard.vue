<script setup lang="ts">
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';
import { CalendarIcon, CheckIcon, ListTodoIcon, PlusIcon, Trash2Icon } from '@lucide/vue';
import { addDays, daysBetween } from '../../shared/pipeline';
import type { Task } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dueLabel } from '../format';
import { addTask, deleteTask, tasksOf, todayIso, updateTask } from '../store';

/** To-dos on one application: take-home with a deadline, send portfolio, prepare questions. */
const props = defineProps<{ listingId: string }>();

const tasks = computed(() =>
  [...tasksOf(props.listingId)].sort(
    (a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || (a.due || '9').localeCompare(b.due || '9') || a.createdAt.localeCompare(b.createdAt),
  ),
);
const open = computed(() => tasks.value.filter((t) => !t.doneAt).length);

const title = ref('');
const due = ref('');
const QUICK = [
  { label: 'zítra', days: 1 },
  { label: '+3 dny', days: 3 },
  { label: 'týden', days: 7 },
];

const fail = (e: unknown) => toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });

async function add() {
  if (!title.value.trim()) return;
  try {
    await addTask(props.listingId, title.value.trim(), due.value);
    title.value = '';
    due.value = '';
  } catch (e) {
    fail(e);
  }
}

const toggle = (t: Task) => updateTask(t.id, { done: !t.doneAt }).catch(fail);
const remove = (t: Task) => deleteTask(t.id).catch(fail);
const tone = (t: Task) =>
  !t.due || t.doneAt ? 'text-muted-foreground' : t.due < todayIso.value ? 'text-destructive font-semibold' : t.due === todayIso.value ? 'text-primary font-semibold' : 'text-muted-foreground';
</script>

<template>
  <section class="flex flex-col gap-2.5">
    <h3 class="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      <ListTodoIcon class="size-3.5" /> Úkoly
      <span v-if="open" class="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{{ open }}</span>
    </h3>

    <TransitionGroup v-if="tasks.length" name="list" tag="ul" class="relative flex flex-col gap-1.5">
      <li
        v-for="t in tasks"
        :key="t.id"
        :class="cn('group flex items-center gap-3 rounded-xl border bg-card px-3 py-2 transition-opacity', t.doneAt && 'opacity-60')"
      >
        <button
          type="button"
          role="checkbox"
          :aria-checked="!!t.doneAt"
          :aria-label="t.doneAt ? `Vrátit: ${t.title}` : `Hotovo: ${t.title}`"
          :class="cn(
            'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            t.doneAt ? 'scale-110 border-(--st-interview-dot) bg-(--st-interview-dot) text-white' : 'border-foreground/25 hover:border-(--st-interview-dot)',
          )"
          @click="toggle(t)"
        >
          <CheckIcon v-if="t.doneAt" class="size-3.5 animate-pop" stroke-width="3" />
        </button>
        <span :class="cn('min-w-0 flex-1 truncate text-sm', t.doneAt && 'line-through')">{{ t.title }}</span>
        <span v-if="t.due" :class="cn('shrink-0 text-xs tabular-nums', tone(t))">{{ dueLabel(daysBetween(todayIso, t.due)) }}</span>
        <Button size="icon-xs" variant="ghost" :aria-label="`Smazat ${t.title}`" class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive" @click="remove(t)">
          <Trash2Icon />
        </Button>
      </li>
    </TransitionGroup>

    <form class="flex flex-wrap items-center gap-2 rounded-xl border border-dashed bg-card/60 p-2" @submit.prevent="add">
      <input
        v-model="title"
        placeholder="Nový úkol… např. odevzdat úkol na doma"
        aria-label="Nový úkol"
        class="h-8 min-w-48 flex-1 rounded-lg bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div class="flex items-center gap-1">
        <button
          v-for="q in QUICK"
          :key="q.days"
          type="button"
          :class="cn(
            'h-7 rounded-full px-2.5 text-xs font-medium transition-colors',
            due === addDays(todayIso, q.days) ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-muted',
          )"
          @click="due = due === addDays(todayIso, q.days) ? '' : addDays(todayIso, q.days)"
        >{{ q.label }}</button>
        <label class="relative flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted" title="Vybrat datum">
          <CalendarIcon class="size-3.5" />
          <input v-model="due" type="date" aria-label="Termín" class="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
      <Button type="submit" size="sm" :disabled="!title.trim()"><PlusIcon /> Přidat</Button>
    </form>
  </section>
</template>
