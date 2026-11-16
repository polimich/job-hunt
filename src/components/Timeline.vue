<script setup lang="ts">
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';
import { CalendarClockIcon, CalendarPlusIcon, HistoryIcon, MailIcon, PlusIcon, StickyNoteIcon, Trash2Icon } from '@lucide/vue';
import { INTERVIEW_ROUNDS, type EventKind, type InterviewRound, type TrackEvent } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { shortDate } from '../format';
import { addEvent, contactById, contactsOf, removeEvent, stateOf, todayIso } from '../store';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ id: string; companyId?: string }>();
const people = computed(() => (props.companyId ? contactsOf(props.companyId) : []));
const who = ref('');
const round = ref<InterviewRound | ''>('');
const roundLabel = (r?: InterviewRound) => INTERVIEW_ROUNDS.find((x) => x.id === r)?.label;

type AddKind = Exclude<EventKind, 'status'>;
const KINDS: { id: AddKind; label: string; icon: typeof MailIcon; placeholder: string }[] = [
  { id: 'message', label: 'Zpráva', icon: MailIcon, placeholder: 'Např. odpověděla HR, chtějí CV v angličtině' },
  { id: 'interview', label: 'Pohovor', icon: CalendarClockIcon, placeholder: 'Např. 1. kolo, technické, s CTO, Google Meet' },
  { id: 'note', label: 'Poznámka', icon: StickyNoteIcon, placeholder: 'Cokoli k zapamatování' },
];
const ICON: Record<EventKind, typeof MailIcon> = { status: HistoryIcon, message: MailIcon, interview: CalendarClockIcon, note: StickyNoteIcon };

// Newest first; entries of the same day in reverse order of writing.
const events = computed(() =>
  stateOf(props.id)
    .events.map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.at.localeCompare(a.e.at) || (b.e.time ?? '').localeCompare(a.e.time ?? '') || b.i - a.i)
    .map((x) => x.e),
);
const upcoming = (e: TrackEvent) => e.kind === 'interview' && e.at >= todayIso.value;

const kind = ref<AddKind>('message');
const at = ref(todayIso.value);
const time = ref('');
const text = ref('');
const busy = ref(false);
const placeholder = computed(() => KINDS.find((k) => k.id === kind.value)!.placeholder);

async function add() {
  if (!text.value.trim() && kind.value !== 'interview') return;
  busy.value = true;
  try {
    await addEvent(props.id, {
      kind: kind.value,
      at: at.value || todayIso.value,
      time: kind.value === 'interview' ? time.value || undefined : undefined,
      contactId: kind.value !== 'note' && who.value ? who.value : undefined,
      round: kind.value === 'interview' && round.value ? round.value : undefined,
      text: text.value.trim(),
    });
    if (kind.value === 'interview') toast.success('Pohovor zapsán', { description: 'Připomínka na poděkování je den po pohovoru.' });
    text.value = '';
    time.value = '';
    who.value = '';
    round.value = '';
    at.value = todayIso.value;
  } catch (e) {
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
  } finally {
    busy.value = false;
  }
}

async function remove(e: TrackEvent) {
  try {
    await removeEvent(props.id, e.id);
  } catch (err) {
    toast.error('Smazání selhalo', { description: err instanceof Error ? err.message : String(err) });
  }
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Historie</h3>

    <form class="flex flex-col gap-2 rounded-2xl border bg-card shadow-soft p-3" @submit.prevent="add">
      <div class="flex flex-wrap items-center gap-2">
        <ToggleGroup v-model="kind" type="single" variant="outline" size="sm" aria-label="Druh záznamu" @update:model-value="(v) => v || (kind = 'message')">
          <ToggleGroupItem v-for="k in KINDS" :key="k.id" :value="k.id" :aria-label="k.label">
            <component :is="k.icon" /> <span class="hidden sm:inline">{{ k.label }}</span>
          </ToggleGroupItem>
        </ToggleGroup>
        <Input v-model="at" type="date" aria-label="Datum" class="h-8 w-36" />
        <Input v-if="kind === 'interview'" v-model="time" type="time" aria-label="Čas" class="h-8 w-24" />
        <select
          v-if="kind === 'interview'"
          v-model="round"
          aria-label="Typ kola"
          class="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">Typ kola…</option>
          <option v-for="r in INTERVIEW_ROUNDS" :key="r.id" :value="r.id">{{ r.label }}</option>
        </select>
        <select
          v-if="people.length && kind !== 'note'"
          v-model="who"
          aria-label="S kým"
          class="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">S kým…</option>
          <option v-for="c in people" :key="c.id" :value="c.id">{{ c.name }}{{ c.role ? ` (${c.role})` : '' }}</option>
        </select>
      </div>
      <div class="flex gap-2">
        <Input v-model="text" :placeholder="placeholder" aria-label="Text záznamu" class="h-8 flex-1" />
        <Button type="submit" size="sm" :disabled="busy || (!text.trim() && kind !== 'interview')"><PlusIcon /> Přidat</Button>
      </div>
    </form>

    <ol v-if="events.length" class="relative flex flex-col gap-0.5 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
      <li v-for="e in events" :key="e.id" class="group relative flex items-start gap-3 rounded-lg py-1.5 pr-1">
        <span
          :class="cn(
            'z-10 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground',
            upcoming(e) && 'border-success/40 bg-success-soft text-success',
          )"
        >
          <component :is="ICON[e.kind]" class="size-3.5" />
        </span>
        <div class="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span class="tabular-nums">{{ shortDate(e.at) }}<template v-if="e.time"> · {{ e.time }}</template></span>
            <span v-if="upcoming(e)" class="font-medium text-success">nadcházející</span>
            <span v-if="e.contactId && contactById.get(e.contactId)">· s {{ contactById.get(e.contactId)!.name }}</span>
          </div>
          <p v-if="e.kind === 'status' && e.status" class="flex items-center gap-1.5 text-sm">Stav <StatusBadge :status="e.status" /></p>
          <p v-else class="text-sm [overflow-wrap:anywhere]">
            <span v-if="e.kind === 'interview'" class="font-medium">Pohovor<template v-if="e.round"> · {{ roundLabel(e.round) }}</template><template v-if="e.text">: </template></span>{{ e.text }}
          </p>
          <a
            v-if="e.kind === 'interview'"
            :href="`/api/state/${encodeURIComponent(id)}/events/${encodeURIComponent(e.id)}/ics`"
            class="mt-0.5 inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-4"
          ><CalendarPlusIcon class="size-3.5" /> Do kalendáře</a>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Smazat záznam"
          class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          @click="remove(e)"
        >
          <Trash2Icon />
        </Button>
      </li>
    </ol>
    <p v-else class="text-sm text-muted-foreground">Zatím nic. Změny stavu se sem zapisují samy.</p>
  </section>
</template>
