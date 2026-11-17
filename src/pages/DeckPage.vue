<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { ArrowRightIcon, CheckIcon, ClockIcon, HeartIcon, InfoIcon, RefreshCwIcon, SparklesIcon, StarIcon, Undo2Icon, XIcon } from '@lucide/vue';
import { PASS_REASONS, type ListingState } from '../../shared/types';
import { emptyState } from '../../shared/pipeline';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import DeckCard from '../components/DeckCard.vue';
import ListingDetail from '../components/ListingDetail.vue';
import { restoreState } from '../mail';
import { aiCardsOn, db, deck, deckWithoutAi, deferListing, refreshSummaries, saveSettings, setState, shortlist, summaryQueue } from '../store';

type Move = 'yes' | 'no' | 'top' | 'later';

// ---------- which card is up ----------

// The card on top stays put while better ones arrive from the queue behind it.
const pinned = ref<string>();
const top = computed(() => deck.value.cards.find((l) => l.id === pinned.value) ?? deck.value.cards[0]);
const next = computed(() => deck.value.cards.find((l) => l.id !== top.value?.id));
watch(top, (l) => (pinned.value = l?.id), { immediate: true });

const undecided = computed(() => deck.value.cards.length + deck.value.waiting);
const needsWishes = computed(() => db.settings.aiSummaries && !db.settings.wishes.trim() && !deckWithoutAi.value && undecided.value > 0);

// ---------- keeping up with the summary queue ----------

let timer: ReturnType<typeof setInterval> | undefined;
let ticks = 0;
const poll = () => refreshSummaries().catch(() => (summaryQueue.value = { running: false, pending: 0 }));
onMounted(() => {
  void poll();
  // Every 3 s while cards are being made, otherwise once a minute.
  timer = setInterval(() => (summaryQueue.value.running || ++ticks % 20 === 0) && void poll(), 3000);
});
onBeforeUnmount(() => clearInterval(timer));

// ---------- wishes ----------

const wishes = ref(db.settings.wishes);
const savingWishes = ref(false);
async function saveWishes() {
  if (!wishes.value.trim()) return;
  savingWishes.value = true;
  try {
    await saveSettings({ ...db.settings, wishes: wishes.value.trim() });
  } catch (e) {
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
  } finally {
    savingWishes.value = false;
  }
}

// ---------- deciding ----------

const history = ref<{ id: string; prev: ListingState | null; move: Move }[]>([]);
const counts = computed(() => ({
  yes: history.value.filter((h) => h.move === 'yes' || h.move === 'top').length,
  no: history.value.filter((h) => h.move === 'no').length,
}));
/** The card I just passed on, to ask why (optional, one tap). */
const asked = ref<string>();
const busy = ref(false);
const drag = ref({ x: 0, y: 0, active: false, leaving: false });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function decide(move: Move) {
  const l = top.value;
  if (!l || busy.value) return;
  busy.value = true;
  if (!reducedMotion) {
    const w = window.innerWidth;
    drag.value = { x: move === 'no' ? -w : move === 'yes' ? w : 0, y: move === 'top' ? -window.innerHeight : move === 'later' ? 120 : 0, active: false, leaving: true };
    await wait(170);
  }
  const before = db.state[l.id];
  history.value.push({ id: l.id, prev: before ? (JSON.parse(JSON.stringify(before)) as ListingState) : null, move });
  asked.value = move === 'no' ? l.id : undefined;
  pinned.value = undefined;
  const done = move === 'later' ? deferListing(l.id) : setState(l.id, move === 'no' ? { status: 'passed' } : move === 'top' ? { status: 'interested', rating: 5 } : { status: 'interested' });
  done.catch((e: unknown) => {
    history.value.pop();
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
  });
  drag.value = { x: 0, y: 0, active: false, leaving: false };
  busy.value = false;
}

async function undo() {
  const last = history.value.pop();
  if (!last) return;
  asked.value = undefined;
  try {
    await restoreState(last.id, last.prev ?? emptyState());
    pinned.value = last.id;
  } catch (e) {
    history.value.push(last);
    toast.error('Vrácení selhalo', { description: e instanceof Error ? e.message : String(e) });
  }
}

function why(reason: string) {
  const id = asked.value;
  asked.value = undefined;
  if (id) setState(id, { passReason: reason }).catch((e: unknown) => toast.error('Uložení selhalo', { description: String(e) }));
}

// ---------- dragging ----------

const SWIPE = 110;
let start: { x: number; y: number; id: number; mouse: boolean } | undefined;
let moved = false;

function down(e: PointerEvent) {
  if (busy.value || (e.pointerType === 'mouse' && e.button !== 0)) return;
  start = { x: e.clientX, y: e.clientY, id: e.pointerId, mouse: e.pointerType === 'mouse' };
  moved = false;
}
function move(e: PointerEvent) {
  if (!start || e.pointerId !== start.id) return;
  const x = e.clientX - start.x;
  const y = e.clientY - start.y;
  if (!drag.value.active) {
    // Sideways starts a swipe; up and down is left to scrolling (touch) or the top pick (mouse).
    const sideways = Math.abs(x) > 8 && Math.abs(x) > Math.abs(y);
    const up = start.mouse && y < -8 && Math.abs(y) > Math.abs(x);
    if (!sideways && !up) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone; the drag still follows it while it is over the card */
    }
    moved = true;
  }
  drag.value = { x, y: start.mouse ? Math.min(y, 0) : 0, active: true, leaving: false };
}
function up(e: PointerEvent) {
  if (!start || e.pointerId !== start.id) return;
  start = undefined;
  if (!drag.value.active) return;
  const { x, y } = drag.value;
  if (x > SWIPE) void decide('yes');
  else if (x < -SWIPE) void decide('no');
  else if (y < -SWIPE && Math.abs(x) < SWIPE) void decide('top');
  else drag.value = { x: 0, y: 0, active: false, leaving: false };
}
function cancel() {
  start = undefined;
  if (!drag.value.leaving) drag.value = { x: 0, y: 0, active: false, leaving: false };
}

const cardStyle = computed(() => {
  const { x, y, active } = drag.value;
  return { transform: `translate(${x}px, ${y}px) rotate(${x / 28}deg)`, transition: active ? 'none' : 'transform 170ms ease-out' };
});
/** Which answer the drag is heading for, and how far (0–1), for the stamp on the card. */
const hint = computed(() => {
  const { x, y } = drag.value;
  const up = -y > Math.abs(x);
  const far = Math.min((up ? -y : Math.abs(x)) / SWIPE, 1);
  return { move: (up ? 'top' : x > 0 ? 'yes' : 'no') as Move, far: drag.value.active || drag.value.leaving ? far : 0 };
});

// ---------- detail and keys ----------

const detailOpen = ref(false);
// Deciding from inside the detail (its status buttons) moves on to the next card.
watch(() => top.value?.id, () => (detailOpen.value = false));
function openDetail() {
  if (!moved && top.value) detailOpen.value = true;
  moved = false;
}

function key(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey || detailOpen.value) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
  const moves: Record<string, () => void> = {
    ArrowRight: () => void decide('yes'),
    ArrowLeft: () => void decide('no'),
    ArrowUp: () => void decide('top'),
    ArrowDown: () => void decide('later'),
    Enter: () => top.value && (detailOpen.value = true),
    ' ': () => top.value && (detailOpen.value = true),
    z: () => void undo(),
    Backspace: () => void undo(),
  };
  const run = moves[e.key];
  if (!run) return;
  e.preventDefault();
  run();
}
onMounted(() => window.addEventListener('keydown', key));
onBeforeUnmount(() => window.removeEventListener('keydown', key));

const STAMP: Record<Move, { label: string; cls: string }> = {
  yes: { label: 'Zajímá mě', cls: 'right-4 border-success text-success -rotate-6' },
  no: { label: 'Nechci', cls: 'left-4 border-destructive text-destructive rotate-6' },
  top: { label: 'Top', cls: 'left-1/2 -translate-x-1/2 border-warning text-warning' },
  later: { label: '', cls: '' },
};
</script>

<template>
  <div class="mx-auto flex h-full max-w-xl flex-col gap-4 px-4 pt-6 pb-5">
    <header class="flex items-end justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-0.5">
        <h1 class="text-3xl font-bold tracking-tight">Třídit</h1>
        <p class="text-sm text-muted-foreground">
          <template v-if="undecided">Zbývá {{ undecided }}<template v-if="deck.waiting && deck.cards.length"> · {{ deck.waiting }} se připravuje</template></template>
          <template v-else>Všechno roztříděno</template>
          <template v-if="counts.yes || counts.no"> · teď {{ counts.yes }} ano, {{ counts.no }} ne</template>
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="!history.length" title="Vrátit poslední rozhodnutí (Z)" @click="undo"><Undo2Icon /> Zpět</Button>
    </header>

    <!-- 1. Wishes first, so the cards are judged against them (and made only once). -->
    <section v-if="needsWishes" class="flex flex-col gap-4 rounded-3xl border bg-card p-6">
      <div class="flex flex-col gap-1">
        <h2 class="flex items-center gap-2 text-lg font-bold"><SparklesIcon class="size-5 text-primary" /> Co od práce chceš?</h2>
        <p class="text-sm text-muted-foreground">
          Napiš to vlastními slovy. AI podle toho u každého inzerátu napíše pro a proti a seřadí karty od nejlepší shody.
          Čeká na tebe {{ undecided }} {{ undecided === 1 ? 'inzerát' : undecided < 5 ? 'inzeráty' : 'inzerátů' }}; příprava karet zabere asi čtvrt minuty na inzerát.
        </p>
      </div>
      <Textarea
        v-model="wishes"
        rows="7"
        aria-label="Co od práce chci"
        placeholder="Např.: Chci frontend nebo fullstack v Reactu a TypeScriptu, ideálně produktová firma. Hybrid nejvýš 2 dny v kanceláři v Brně, nebo plně remote. Aspoň 90 000 Kč hrubého. Nechci agentury, body shopy, on-call ani čistý backend v Javě nebo .NET. Seniorní role jen když je prostor se učit."
        class="leading-relaxed"
      />
      <div class="flex flex-wrap items-center gap-3">
        <Button :disabled="!wishes.trim() || savingWishes" @click="saveWishes"><SparklesIcon /> {{ savingWishes ? 'Ukládám…' : 'Uložit a připravit karty' }}</Button>
        <Button variant="ghost" class="text-muted-foreground" @click="deckWithoutAi = true">Třídit bez AI</Button>
      </div>
      <p class="text-xs text-muted-foreground">Později to změníš v Nastavení. Po změně se karty, o kterých jsi ještě nerozhodl, připraví znovu.</p>
    </section>

    <!-- 2. The deck -->
    <template v-else-if="top">
      <div class="relative min-h-0 max-h-[44rem] flex-1 select-none">
        <div v-if="next" class="absolute inset-0 origin-bottom scale-[0.97] opacity-60" aria-hidden="true">
          <DeckCard :listing="next" :summary="db.summaries[next.id]" :deferred="!!db.state[next.id]?.deferredAt" />
        </div>
        <div
          :key="top.id"
          class="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing"
          :style="cardStyle"
          @pointerdown="down"
          @pointermove="move"
          @pointerup="up"
          @pointercancel="cancel"
          @click="openDetail"
        >
          <DeckCard :listing="top" :summary="db.summaries[top.id]" :deferred="!!db.state[top.id]?.deferredAt" />
          <span
            v-if="hint.far > 0 && hint.move !== 'later'"
            :class="cn('pointer-events-none absolute top-6 rounded-xl border-4 bg-card/90 px-3 py-1 text-xl font-black tracking-wide uppercase', STAMP[hint.move].cls)"
            :style="{ opacity: hint.far }"
          >{{ STAMP[hint.move].label }}</span>
        </div>
      </div>

      <div class="flex items-center justify-center gap-3">
        <Button variant="outline" size="icon-lg" class="size-14 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10" title="Nechci (←)" aria-label="Nechci" :disabled="busy" @click="decide('no')"><XIcon class="size-6" /></Button>
        <Button variant="outline" size="icon" class="size-11 rounded-full text-muted-foreground" title="Později (↓)" aria-label="Později" :disabled="busy" @click="decide('later')"><ClockIcon /></Button>
        <Button variant="outline" size="icon" class="size-11 rounded-full text-muted-foreground" title="Detail (Enter)" aria-label="Detail" @click="detailOpen = true"><InfoIcon /></Button>
        <Button variant="outline" size="icon" class="size-11 rounded-full border-warning/40 text-warning hover:bg-warning/10" title="Top – zajímá mě nejvíc (↑)" aria-label="Top" :disabled="busy" @click="decide('top')"><StarIcon /></Button>
        <Button variant="outline" size="icon-lg" class="size-14 rounded-full border-success/40 text-success hover:bg-success/10" title="Zajímá mě (→)" aria-label="Zajímá mě" :disabled="busy" @click="decide('yes')"><HeartIcon class="size-6" /></Button>
      </div>

      <!-- Fixed height, so the buttons do not jump when the question appears. -->
      <div class="flex min-h-8 flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <template v-if="asked">
          <span class="mr-1">Proč ne?</span>
          <button v-for="r in PASS_REASONS" :key="r.id" type="button" class="rounded-full border bg-card px-2.5 py-1 font-medium text-foreground hover:bg-muted" @click="why(r.id)">{{ r.label }}</button>
        </template>
        <span v-else class="hidden items-center gap-1.5 sm:flex"><Kbd>←</Kbd> ne <Kbd>→</Kbd> ano <Kbd>↑</Kbd> top <Kbd>↓</Kbd> později <Kbd>Enter</Kbd> detail <Kbd>Z</Kbd> zpět</span>
      </div>
    </template>

    <!-- 3. Cards are still being made -->
    <section v-else-if="deck.waiting" class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-dashed p-8 text-center">
      <RefreshCwIcon class="size-8 animate-spin text-muted-foreground" />
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-bold">Připravuji karty</h2>
        <p class="text-sm text-muted-foreground">První karta bude za pár vteřin; další se připravují na pozadí, zatímco třídíš.</p>
      </div>
      <Button variant="ghost" class="text-muted-foreground" @click="deckWithoutAi = true">Nečekat, třídit bez AI</Button>
    </section>

    <!-- 4. Done -->
    <section v-else class="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-dashed p-8 text-center">
      <span class="flex size-14 items-center justify-center rounded-full bg-success-soft text-success"><CheckIcon class="size-7" /></span>
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-bold">Roztříděno</h2>
        <p class="text-sm text-muted-foreground">
          <template v-if="shortlist.length">Ve výběru máš {{ shortlist.length }} {{ shortlist.length === 1 ? 'pozici' : shortlist.length < 5 ? 'pozice' : 'pozic' }}. Teď si je projdi pořádně a ozvi se.</template>
          <template v-else>Žádné nové inzeráty. Další přibudou po obnovení.</template>
        </p>
      </div>
      <Button v-if="shortlist.length" as-child><RouterLink to="/vyber">Pokračovat na výběr <ArrowRightIcon /></RouterLink></Button>
      <Button v-else variant="outline" as-child><RouterLink to="/dnes">Přehled dne</RouterLink></Button>
    </section>

    <p v-if="summaryQueue.blocked && aiCardsOn && undecided" class="text-center text-xs text-warning">AI shrnutí stojí: {{ summaryQueue.blocked }}</p>

    <Dialog v-model:open="detailOpen">
      <DialogContent v-if="top" class="max-h-[92dvh] overflow-y-auto p-6 sm:max-w-3xl">
        <DialogHeader class="sr-only">
          <DialogTitle>{{ top.title }}</DialogTitle>
          <DialogDescription>{{ top.company }}</DialogDescription>
        </DialogHeader>
        <ListingDetail :listing="top" />
      </DialogContent>
    </Dialog>
  </div>
</template>
