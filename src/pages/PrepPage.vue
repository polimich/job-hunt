<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { ArrowLeftIcon, ArrowUpIcon, BookOpenCheckIcon, FileQuestionIcon, LayersIcon, MessageCircleIcon, MessagesSquareIcon, MicIcon, PencilIcon, PlusIcon, PrinterIcon, RefreshCwIcon, RotateCcwIcon, SaveIcon, SparklesIcon, SquareIcon, Trash2Icon, TriangleAlertIcon } from '@lucide/vue';
import type { ChatMode, ChatModel, PrepSheet, PrepState } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { renderMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { formatDateTime } from '../format';
import { api, listingById } from '../store';

/**
 * Getting ready for an interview at one company: a chat with Claude that knows the posting, the
 * company research and my profile, and a cheat sheet that collects what we worked out.
 */
const props = defineProps<{ id: string }>();
const listing = computed(() => listingById.value.get(props.id));
const path = computed(() => `/listings/${encodeURIComponent(props.id)}/chat`);

const state = ref<PrepState>();
const failed = ref('');
const messages = computed(() => state.value?.chat.messages ?? []);
const running = computed(() => state.value?.running ?? null);
const sheet = computed(() => state.value?.chat.sheet);
const sheetEmpty = computed(() => !sheet.value || !(sheet.value.answers.length + sheet.value.weak.length + sheet.value.stack.length + sheet.value.ask.length));

async function call(suffix = '', init?: RequestInit): Promise<boolean> {
  try {
    state.value = await api<PrepState>(path.value + suffix, init);
    failed.value = '';
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (init) toast.error('Nepovedlo se', { description: msg });
    else failed.value = msg;
    return false;
  }
}

// The answer is written on the server; while it is, ask for the text so far twice a second.
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void call();
  timer = setInterval(() => {
    if (state.value?.running || state.value?.sheetBusy) void call();
  }, 500);
});
onUnmounted(() => clearInterval(timer));

// ---------- modes, model, language ----------

const MODES: { id: ChatMode; label: string; icon: typeof MicIcon; opener: string; hint: string }[] = [
  { id: 'mock', label: 'Zkušební pohovor', icon: MicIcon, opener: 'Pojďme na zkušební pohovor.', hint: 'Otázka, tvoje odpověď, zpětná vazba a lepší verze.' },
  { id: 'stack', label: 'Jejich technologie', icon: LayersIcon, opener: 'Uveď mě do technologií, které používají.', hint: 'Co znáš, co je příbuzné a co je nové.' },
  { id: 'review', label: 'Moje znalosti', icon: BookOpenCheckIcon, opener: 'Osvěž se mnou znalosti, které tahle pozice chce.', hint: 'Krátké kontrolní otázky a kde máš mezery.' },
  { id: 'free', label: 'Volný dotaz', icon: MessageCircleIcon, opener: '', hint: 'Zeptej se na cokoli k téhle pozici.' },
];
const mode = ref<ChatMode>('free');
// Coming back to a conversation, carry on in the mode it was in.
watch(() => state.value?.chat.messages.length, (n, before) => {
  if (before === undefined && n) mode.value = [...messages.value].reverse().find((m) => m.role === 'user')?.mode ?? 'free';
});

const stored = (() => {
  try {
    return localStorage.getItem('prep-model');
  } catch {
    return null;
  }
})();
const model = ref<ChatModel>(stored === 'opus' ? 'opus' : 'sonnet');
watch(model, (m) => {
  try {
    localStorage.setItem('prep-model', m);
  } catch {
    /* private window: the choice just does not persist */
  }
});

const lang = computed(() => state.value?.chat.lang ?? 'cs');
const setLang = (v: unknown) => v && v !== lang.value && void call('', { method: 'PUT', body: JSON.stringify({ lang: v }) });

// ---------- talking ----------

const text = ref('');
const box = ref<InstanceType<typeof Textarea>>();
const feed = ref<HTMLElement>();
const focusBox = () => void nextTick(() => (box.value?.$el as HTMLTextAreaElement | undefined)?.focus());

async function post(body: string, as: ChatMode) {
  if (running.value || !body.trim()) return;
  stick.value = true;
  await call('', { method: 'POST', body: JSON.stringify({ text: body, mode: as, model: model.value }) });
}
async function send() {
  const body = text.value;
  text.value = '';
  await post(body, mode.value);
}
function start(m: (typeof MODES)[number]) {
  mode.value = m.id;
  if (m.opener) void post(m.opener, m.id);
  else focusBox();
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    void send();
  }
}
const stop = () => call('/stop', { method: 'POST', body: '{}' });
const retry = () => call('/retry', { method: 'POST', body: JSON.stringify({ model: model.value }) });
async function restart() {
  if (!window.confirm('Rozhovor se smaže a začne znovu. Tahák zůstane. Pokračovat?')) return;
  await call('', { method: 'DELETE' });
  mode.value = 'free';
}

// Follow the text as it arrives, unless I scrolled up to read something.
const stick = ref(true);
function onScroll() {
  const el = feed.value;
  if (el) stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}
watch(() => [messages.value.length, running.value?.text.length], () => {
  if (stick.value) void nextTick(() => feed.value?.scrollTo({ top: feed.value.scrollHeight }));
});

// ---------- cheat sheet ----------

const view = ref<'chat' | 'sheet'>('chat');
const editing = ref(false);
const edit = reactive({ answers: [] as { q: string; a: string }[], weak: '', stack: '', ask: '' });
const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);

function startEdit() {
  const s = sheet.value;
  edit.answers = (s?.answers ?? []).map((x) => ({ ...x }));
  edit.weak = (s?.weak ?? []).join('\n');
  edit.stack = (s?.stack ?? []).join('\n');
  edit.ask = (s?.ask ?? []).join('\n');
  editing.value = true;
}
async function saveEdit() {
  const next: Omit<PrepSheet, 'updatedAt'> = { answers: edit.answers.filter((x) => x.q.trim() && x.a.trim()), weak: lines(edit.weak), stack: lines(edit.stack), ask: lines(edit.ask) };
  if (await call('/sheet', { method: 'PUT', body: JSON.stringify(next) })) editing.value = false;
}
const updateSheet = () => call('/sheet', { method: 'POST', body: '{}' });
const print = () => window.print();

const SECTIONS = [
  { key: 'weak', title: 'Slabá místa' },
  { key: 'stack', title: 'Jejich technologie' },
  { key: 'ask', title: 'Zeptej se' },
] as const;
</script>

<template>
  <Empty v-if="!listing" class="pt-16">
    <EmptyHeader>
      <EmptyMedia variant="icon"><FileQuestionIcon /></EmptyMedia>
      <EmptyTitle>Tahle pozice v seznamu není</EmptyTitle>
    </EmptyHeader>
  </Empty>

  <div v-else class="mx-auto flex h-full max-w-7xl flex-col gap-3 px-4 pt-4 pb-3 md:px-6 print:block print:h-auto print:max-w-none print:p-0">
    <header class="flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden">
      <Button variant="ghost" size="icon-sm" class="-ml-2 text-muted-foreground" as-child aria-label="Zpět na pozici">
        <RouterLink :to="`/pozice/${encodeURIComponent(id)}`"><ArrowLeftIcon /></RouterLink>
      </Button>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-xs text-muted-foreground">Příprava na pohovor · {{ listing.company }}</span>
        <h1 class="truncate text-lg leading-tight font-bold">{{ listing.title }}</h1>
      </div>
      <ToggleGroup v-model="view" type="single" variant="outline" size="sm" class="lg:hidden" aria-label="Co zobrazit" @update:model-value="(v) => v || (view = 'chat')">
        <ToggleGroupItem value="chat">Chat</ToggleGroupItem>
        <ToggleGroupItem value="sheet">Tahák</ToggleGroupItem>
      </ToggleGroup>
      <Button v-if="messages.length" variant="ghost" size="sm" class="text-muted-foreground" title="Smazat rozhovor a začít znovu; tahák zůstane" @click="restart"><RotateCcwIcon /> <span class="max-sm:hidden">Začít znovu</span></Button>
    </header>

    <p v-if="failed" class="rounded-2xl border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-destructive print:hidden">Chat se nepodařilo načíst: {{ failed }}</p>

    <div class="flex min-h-0 flex-1 gap-4 print:block">
      <!-- Chat -->
      <section :class="cn('flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border bg-card print:hidden', view === 'sheet' && 'max-lg:hidden')">
        <div ref="feed" class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 scrollbar-thin" @scroll.passive="onScroll">
          <div v-if="state && !messages.length && !running" class="m-auto flex max-w-md flex-col items-center gap-4 text-center">
            <span class="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessagesSquareIcon class="size-6" /></span>
            <div>
              <h2 class="text-lg font-bold">Čím začneme?</h2>
              <p class="text-sm text-muted-foreground">Kouč zná inzerát, průzkum firmy, tvou přihlášku a profil. Co stojí za zapamatování, ulož potom do taháku.</p>
            </div>
            <div class="grid w-full gap-2 sm:grid-cols-2">
              <button v-for="m in MODES" :key="m.id" type="button" class="flex flex-col gap-0.5 rounded-2xl border p-3 text-left transition-colors hover:border-foreground/25 hover:bg-foreground/[0.03]" @click="start(m)">
                <span class="flex items-center gap-1.5 text-sm font-semibold"><component :is="m.icon" class="size-4 text-primary" /> {{ m.label }}</span>
                <span class="text-xs text-muted-foreground">{{ m.hint }}</span>
              </button>
            </div>
          </div>

          <template v-for="m in messages" :key="m.id">
            <div v-if="m.role === 'user'" class="max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary/10 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{{ m.text }}</div>
            <div v-else class="flex min-w-0 flex-col gap-1.5">
              <!-- eslint-disable-next-line vue/no-v-html -- rendered with HTML switched off -->
              <div v-if="m.text" class="md text-sm" v-html="renderMarkdown(m.text)" />
              <p v-if="m.error" class="flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-destructive">
                <TriangleAlertIcon class="size-4 shrink-0" /> <span class="min-w-40 flex-1">Odpověď se nepovedla: {{ m.error }}</span>
                <Button v-if="m === messages.at(-1)" size="sm" variant="outline" :disabled="!!running" @click="retry">Zkusit znovu</Button>
              </p>
              <p v-else-if="m.stopped" class="flex items-center gap-2 text-xs text-muted-foreground">
                Zastaveno.
                <button v-if="m === messages.at(-1)" type="button" class="underline underline-offset-4 hover:text-foreground" :disabled="!!running" @click="retry">Odpovědět znovu</button>
              </p>
              <span v-else-if="m.model === 'opus'" class="text-[11px] text-muted-foreground">Opus</span>
            </div>
          </template>

          <div v-if="running" class="flex min-w-0 flex-col gap-1.5" aria-live="polite">
            <!-- eslint-disable-next-line vue/no-v-html -- rendered with HTML switched off -->
            <div v-if="running.text" class="md text-sm" v-html="renderMarkdown(running.text)" />
            <p class="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCwIcon class="size-3.5 animate-spin" /> {{ running.text ? 'Píšu…' : 'Přemýšlím…' }}</p>
          </div>
        </div>

        <!-- Composer -->
        <div class="flex flex-col gap-2 border-t p-3">
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              v-for="m in MODES"
              :key="m.id"
              type="button"
              :disabled="!!running"
              :title="m.hint"
              :aria-pressed="mode === m.id"
              :class="cn(
                'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors disabled:opacity-50',
                mode === m.id ? 'border-transparent bg-primary text-primary-foreground' : 'text-muted-foreground hover:border-foreground/25 hover:text-foreground',
              )"
              @click="start(m)"
            >
              <component :is="m.icon" class="size-3.5" /> {{ m.label }}
            </button>
            <span class="flex-1" />
            <ToggleGroup v-if="mode === 'mock'" :model-value="lang" type="single" variant="outline" size="sm" aria-label="Jazyk zkušebního pohovoru" title="Jazyk zkušebního pohovoru" @update:model-value="setLang">
              <ToggleGroupItem value="cs">CZ</ToggleGroupItem>
              <ToggleGroupItem value="en">EN</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup v-model="model" type="single" variant="outline" size="sm" aria-label="Model" title="Sonnet je rychlý. Opus jde víc do hloubky, ale je pomalejší a spotřebuje víc předplatného." @update:model-value="(v) => v || (model = 'sonnet')">
              <ToggleGroupItem value="sonnet">Sonnet</ToggleGroupItem>
              <ToggleGroupItem value="opus">Opus</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div class="flex items-end gap-2">
            <Textarea ref="box" v-model="text" rows="2" placeholder="Napiš odpověď nebo dotaz… (Enter odešle, Shift+Enter nový řádek)" class="max-h-48 min-h-14 flex-1 leading-relaxed" aria-label="Zpráva" @keydown="onKey" />
            <Button v-if="running" size="icon" variant="outline" aria-label="Zastavit odpověď" title="Zastavit odpověď" @click="stop"><SquareIcon class="fill-current" /></Button>
            <Button v-else size="icon" :disabled="!text.trim()" aria-label="Odeslat" @click="send"><ArrowUpIcon /></Button>
          </div>
        </div>
      </section>

      <!-- Cheat sheet -->
      <aside :class="cn('flex w-full shrink-0 flex-col overflow-hidden rounded-3xl border bg-card lg:w-[26rem] print:block print:w-full print:overflow-visible print:rounded-none print:border-0', view === 'chat' && 'max-lg:hidden print:block')">
        <header class="flex items-center gap-2 border-b px-5 py-3 print:hidden">
          <h2 class="flex-1 text-base font-bold">Tahák</h2>
          <template v-if="editing">
            <Button size="sm" variant="ghost" @click="editing = false">Zrušit</Button>
            <Button size="sm" @click="saveEdit"><SaveIcon /> Uložit</Button>
          </template>
          <template v-else>
            <Button size="icon-sm" variant="ghost" class="text-muted-foreground" aria-label="Upravit tahák" title="Upravit ručně" @click="startEdit"><PencilIcon /></Button>
            <Button size="icon-sm" variant="ghost" class="text-muted-foreground" :disabled="sheetEmpty" aria-label="Vytisknout tahák" title="Vytisknout nebo uložit jako PDF" @click="print"><PrinterIcon /></Button>
            <Button size="sm" variant="outline" :disabled="state?.sheetBusy || !messages.length" title="Doplní tahák podle rozhovoru (asi 10 s)" @click="updateSheet">
              <RefreshCwIcon v-if="state?.sheetBusy" class="animate-spin" /><SparklesIcon v-else /> {{ state?.sheetBusy ? 'Doplňuji…' : 'Doplnit z rozhovoru' }}
            </Button>
          </template>
        </header>

        <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 text-sm scrollbar-thin print:overflow-visible print:p-0">
          <div class="hidden print:block">
            <p class="text-xs">Tahák na pohovor</p>
            <h1 class="text-xl font-bold">{{ listing.company }}: {{ listing.title }}</h1>
          </div>
          <p v-if="state?.sheetError" class="rounded-xl bg-danger-soft px-3 py-2 text-destructive print:hidden">Doplnění se nepovedlo: {{ state.sheetError }}</p>

          <!-- Editing by hand -->
          <template v-if="editing">
            <div class="flex flex-col gap-2">
              <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Moje odpovědi</h3>
              <div v-for="(x, i) in edit.answers" :key="i" class="flex flex-col gap-1.5 rounded-xl border p-2.5">
                <div class="flex items-center gap-1.5">
                  <Input v-model="x.q" placeholder="Otázka" :aria-label="`Otázka ${i + 1}`" />
                  <Button size="icon-sm" variant="ghost" class="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Smazat" @click="edit.answers.splice(i, 1)"><Trash2Icon /></Button>
                </div>
                <Textarea v-model="x.a" rows="3" placeholder="Moje odpověď" :aria-label="`Odpověď ${i + 1}`" class="leading-relaxed" />
              </div>
              <Button size="sm" variant="outline" class="w-fit" @click="edit.answers.push({ q: '', a: '' })"><PlusIcon /> Přidat otázku</Button>
            </div>
            <div v-for="s in SECTIONS" :key="s.key" class="flex flex-col gap-1.5">
              <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{{ s.title }} <span class="font-normal normal-case">· jedna položka na řádek</span></h3>
              <Textarea v-model="edit[s.key]" rows="5" class="leading-relaxed" :aria-label="s.title" />
            </div>
          </template>

          <!-- Reading -->
          <template v-else-if="sheet && !sheetEmpty">
            <div v-if="sheet.answers.length" class="flex flex-col gap-3">
              <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Moje odpovědi</h3>
              <div v-for="x in sheet.answers" :key="x.q" class="break-inside-avoid">
                <p class="font-semibold">{{ x.q }}</p>
                <p class="mt-0.5 leading-relaxed">{{ x.a }}</p>
              </div>
            </div>
            <template v-for="s in SECTIONS" :key="s.key">
              <div v-if="sheet[s.key].length" class="break-inside-avoid">
                <h3 class="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{{ s.title }}</h3>
                <ul class="list-disc space-y-1 pl-4 leading-relaxed"><li v-for="x in sheet[s.key]" :key="x">{{ x }}</li></ul>
              </div>
            </template>
            <p v-if="sheet.updatedAt" class="text-xs text-muted-foreground print:hidden">Naposledy změněno {{ formatDateTime(sheet.updatedAt) }}.</p>
          </template>

          <p v-else class="m-auto max-w-64 text-center text-muted-foreground">
            Tady se sbírá, co si přečíst těsně před hovorem: tvoje nejlepší odpovědi, slabá místa, poznámky k jejich technologiím a otázky na ně. Projdi si něco s koučem a dej „Doplnit z rozhovoru“.
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
