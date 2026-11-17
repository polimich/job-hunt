<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { ArrowLeftIcon, DownloadIcon, ExternalLinkIcon, FileQuestionIcon, FileTextIcon, GraduationCapIcon, MailIcon, RefreshCwIcon, SearchIcon, SendIcon, SparklesIcon, TriangleAlertIcon } from '@lucide/vue';
import type { KitStep as Step, ListingState } from '../../shared/types';
import { emptyState } from '../../shared/pipeline';
import { matchOf } from '../../shared/deck';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import CompanyAvatar from '../components/CompanyAvatar.vue';
import CopyButton from '../components/CopyButton.vue';
import KitStep from '../components/KitStep.vue';
import { bestEmail, fillTemplate, formatDate, looksCzech } from '../format';
import { useKitPolling } from '../kits';
import { logEmail, restoreState } from '../mail';
import { companyById, contactsOf, db, kitQueue, kitsOn, listingById, requestKit, saveKit, setState, statusOf } from '../store';

/**
 * Applying to one posting, step by step: get to know the company, adjust the CV, send the
 * message (e-mail or form), then note that it went out. The drafts come from the AI and are
 * meant to be rewritten in my own voice before sending.
 */
const props = defineProps<{ id: string }>();
useKitPolling();

const listing = computed(() => listingById.value.get(props.id));
const kit = computed(() => db.kits[props.id]);
const failed = computed(() => db.kitErrors[props.id]);
const busy = computed(() => kitQueue.value.ids.includes(props.id));
const research = computed(() => (listing.value ? db.research[listing.value.companyId] : undefined));
const summary = computed(() => db.summaries[props.id]);
const status = computed(() => (listing.value ? statusOf(listing.value) : 'new'));
const sent = computed(() => !['new', 'interested'].includes(status.value));
const said = (v: string | undefined) => !!v && !/^(nezjištěno|neuvedeno)/i.test(v);
const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

// E-mails go to a person I know there first, then the company's best address.
const recipient = computed(() => {
  const l = listing.value;
  if (!l) return '';
  return contactsOf(l.companyId).find((c) => c.email)?.email ?? bestEmail(companyById.value.get(l.companyId))?.address ?? '';
});

// My working copy of the drafts; saved when I leave a field.
const draft = reactive({ to: '', subject: '', body: '', message: '', whyUs: '', aboutMe: '', salary: '', start: '', linkedin: '', cvSummary: '', moveUp: '' });
const channel = ref<'email' | 'form'>('email');
let saved = '';
const payload = () => ({
  email: { subject: draft.subject, body: draft.body },
  form: { message: draft.message, whyUs: draft.whyUs, aboutMe: draft.aboutMe, salary: draft.salary, start: draft.start },
  linkedin: draft.linkedin,
  cv: { summary: draft.cvSummary, moveUp: draft.moveUp.split('\n').map((x) => x.trim()).filter(Boolean), keywordsHave: kit.value?.cv.keywordsHave ?? [], keywordsMissing: kit.value?.cv.keywordsMissing ?? [] },
});

function fill() {
  const l = listing.value;
  if (!l) return;
  const k = kit.value;
  // Without a kit the e-mail starts from my template, so the page is useful even with AI off.
  const t = looksCzech(l.text || l.title) ? db.settings.introCs : db.settings.introEn;
  Object.assign(draft, {
    subject: k?.email.subject ?? fillTemplate(t.subject, l),
    body: k?.email.body ?? fillTemplate(t.body, l),
    message: k?.form.message ?? '',
    whyUs: k?.form.whyUs ?? '',
    aboutMe: k?.form.aboutMe ?? '',
    salary: k?.form.salary ?? '',
    start: k?.form.start ?? '',
    linkedin: k?.linkedin ?? '',
    cvSummary: k?.cv.summary ?? '',
    moveUp: k?.cv.moveUp.join('\n') ?? '',
  });
  saved = JSON.stringify(payload());
}
// A new kit (first one, or made again) replaces the working copy; my own saves do not.
watch(() => [props.id, kit.value?.createdAt], fill, { immediate: true });
watch(recipient, (r) => {
  if (!draft.to) draft.to = r;
  channel.value = r ? 'email' : 'form';
}, { immediate: true });

async function persist() {
  if (!kit.value) return;
  const next = payload();
  if (JSON.stringify(next) === saved) return;
  try {
    await saveKit(props.id, next);
    saved = JSON.stringify(next);
  } catch (e) {
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
  }
}

const isDone = (s: Step) => !!kit.value?.done.includes(s);
async function toggle(s: Step) {
  if (!kit.value) return;
  const done = isDone(s) ? kit.value.done.filter((x) => x !== s) : [...kit.value.done, s];
  await saveKit(props.id, { done }).catch(() => toast.error('Uložení selhalo'));
}
const tick = (s: Step) => (kit.value && !isDone(s) ? toggle(s) : Promise.resolve());

async function make(what: 'kit' | 'research' | 'cv') {
  if (what !== 'cv' && kit.value && !window.confirm('Koncepty se napíšou znovu a tvoje úpravy textů se přepíšou. Pokračovat?')) return;
  try {
    if (what === 'cv') await persist();
    await requestKit(props.id, what);
  } catch (e) {
    toast.error('Nepovedlo se', { description: e instanceof Error ? e.message : String(e) });
  }
}

// ---------- sending ----------

const docIds = ref<string[]>([]);
const kb = (size: number) => `${Math.max(1, Math.round(size / 1024))} kB`;
const mailHref = computed(() => `mailto:${draft.to}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`);
const mailReady = computed(() => !!draft.subject.trim() && !!draft.body.trim());
const todo = computed(() => [draft.subject, draft.body, draft.message].join(' ').match(/\[doplň[^\]]*\]/gi) ?? []);

const undo = (before: ListingState) => ({ label: 'Zpět', onClick: () => void restoreState(props.id, before).catch(() => toast.error('Vrácení selhalo')) });

/** The mail program opens from the link itself; here the e-mail is logged, with a way back. */
async function mailed() {
  await persist();
  try {
    const before = await logEmail(props.id, 'intro', draft.subject, docIds.value);
    await tick('sent');
    toast.success('Zapsáno jako odesláno', { description: 'Nakonec neodesláno? Vrať to.', action: undo(before) });
  } catch (e) {
    toast.error('Zápis selhal', { description: e instanceof Error ? e.message : String(e) });
  }
}

/** Applied through a form or a portal. */
async function applied() {
  await persist();
  const before = JSON.parse(JSON.stringify(db.state[props.id] ?? emptyState())) as ListingState;
  try {
    await setState(props.id, { status: 'applied' });
    await tick('sent');
    toast.success('Označeno jako odesláno', { action: undo(before) });
  } catch (e) {
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
  }
}

/** Places to look the company up by hand. */
const lookups = computed(() => {
  const name = listing.value?.company ?? '';
  const q = encodeURIComponent;
  return [
    { label: 'Web firmy', href: `https://www.google.com/search?q=${q(name)}` },
    { label: 'Lidé na LinkedInu', href: `https://www.linkedin.com/search/results/people/?keywords=${q(`${name} recruiter`)}` },
    { label: 'Atmoskop', href: `https://www.google.com/search?q=${q(`${name} atmoskop`)}` },
  ];
});
const FORM_FIELDS = [
  { key: 'message', label: 'Zpráva / průvodní dopis', rows: 7 },
  { key: 'whyUs', label: 'Proč chcete pracovat u nás?', rows: 4 },
  { key: 'aboutMe', label: 'Řekněte nám něco o sobě', rows: 5 },
  { key: 'start', label: 'Možný nástup', rows: 1 },
  { key: 'salary', label: 'Platová představa (jen když se ptají)', rows: 1 },
] as const;
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-5 px-4 pt-6 pb-16 md:px-6">
    <Button variant="ghost" size="sm" class="-ml-2 w-fit text-muted-foreground" as-child>
      <RouterLink to="/vyber"><ArrowLeftIcon /> Výběr</RouterLink>
    </Button>

    <Empty v-if="!listing">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileQuestionIcon /></EmptyMedia>
        <EmptyTitle>Tahle pozice v seznamu není</EmptyTitle>
      </EmptyHeader>
    </Empty>

    <template v-else>
      <header class="flex items-start gap-3">
        <CompanyAvatar :name="listing.company" size="md" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-sm text-muted-foreground">Přihláška · {{ listing.company }}</span>
          <h1 class="text-2xl leading-tight font-bold [overflow-wrap:anywhere]">{{ listing.title }}</h1>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span class="tabular-nums">shoda {{ matchOf(listing, summary) }} %</span>
            <RouterLink :to="`/pozice/${encodeURIComponent(listing.id)}`" class="hover:text-foreground hover:underline">Detail a celý inzerát</RouterLink>
            <a v-if="listing.url" :href="listing.url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 hover:text-foreground hover:underline">Inzerát na portálu <ExternalLinkIcon class="size-3" /></a>
          </div>
        </div>
        <Button v-if="kit" variant="ghost" size="sm" class="shrink-0 text-muted-foreground" :disabled="busy" title="Napsat koncepty znovu (asi minutu)" @click="make('kit')">
          <RefreshCwIcon :class="busy && 'animate-spin'" /> {{ busy ? 'Připravuji…' : 'Znovu' }}
        </Button>
      </header>

      <p v-if="sent" class="rounded-2xl bg-success-soft px-4 py-3 text-sm">
        Tahle přihláška už je odeslaná. Další kroky najdeš v <RouterLink to="/dnes" class="font-medium underline underline-offset-4">přehledu dne</RouterLink>.
      </p>

      <!-- What the AI part is doing -->
      <div v-if="!kit && busy" class="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
        <RefreshCwIcon class="size-4 shrink-0 animate-spin text-primary" />
        <p>Připravuji přihlášku: průzkum firmy na webu a koncepty textů. Trvá to asi minutu, stránka se doplní sama.</p>
      </div>
      <div v-else-if="kitQueue.blocked" class="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-destructive">
        <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
        <p class="flex-1">Příprava přihlášek stojí: {{ kitQueue.blocked }}</p>
      </div>
      <div v-else-if="failed" class="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-destructive">
        <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
        <p class="flex-1">Příprava se nepovedla: {{ failed }}</p>
        <Button size="sm" variant="outline" :disabled="busy" @click="requestKit(id, 'kit')">Zkusit znovu</Button>
      </div>
      <div v-else-if="!kit && !kitsOn" class="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
        <SparklesIcon class="size-4 shrink-0 text-primary" />
        <p class="min-w-48 flex-1">Koncepty na míru píše AI jen z toho, co o sobě napíšeš. Vyplň „Můj profil“ a zapni přípravu přihlášek.</p>
        <Button size="sm" as-child><RouterLink to="/nastaveni#muj-profil">Vyplnit profil</RouterLink></Button>
      </div>
      <div v-else-if="!kit" class="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
        <SparklesIcon class="size-4 shrink-0 text-primary" />
        <p class="min-w-48 flex-1">Pro tuhle pozici ještě není nic připraveno.</p>
        <Button size="sm" @click="requestKit(id, 'kit')"><SparklesIcon /> Připravit přihlášku</Button>
      </div>

      <div v-if="kit?.gaps.length" class="flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
        <TriangleAlertIcon class="mt-0.5 size-4 shrink-0 text-warning" />
        <div class="flex flex-col gap-1">
          <p class="font-medium">V profilu chybělo</p>
          <ul class="list-disc pl-4"><li v-for="g in kit.gaps" :key="g">{{ g }}</li></ul>
          <RouterLink to="/nastaveni#muj-profil" class="w-fit text-primary underline-offset-4 hover:underline">Doplnit do profilu</RouterLink>
        </div>
      </div>

      <!-- 1 -->
      <KitStep :n="1" title="Poznej firmu" hint="Pět minut: co dělají, s čím pracují, co je u nich nového a komu psát." :tickable="!!kit" :done="isDone('company')" @toggle="toggle('company')">
        <template #actions>
          <Button v-if="kit" variant="ghost" size="sm" class="text-muted-foreground" :disabled="busy" title="Hledat na webu znovu a přepsat koncepty" @click="make('research')"><SearchIcon /> Hledat znovu</Button>
        </template>
        <dl v-if="research" class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[7rem_1fr]">
          <template v-if="said(research.what)"><dt class="text-muted-foreground">Firma</dt><dd>{{ research.what }}</dd></template>
          <template v-if="said(research.product)"><dt class="text-muted-foreground">Produkt</dt><dd>{{ research.product }}</dd></template>
          <template v-if="research.engineering.length">
            <dt class="text-muted-foreground">Vývoj</dt>
            <dd><ul class="list-disc space-y-0.5 pl-4"><li v-for="x in research.engineering" :key="x">{{ x }}</li></ul></dd>
          </template>
          <template v-if="research.news.length">
            <dt class="text-muted-foreground">Novinky</dt>
            <dd><ul class="list-disc space-y-0.5 pl-4"><li v-for="x in research.news" :key="x">{{ x }}</li></ul></dd>
          </template>
          <template v-if="research.hooks.length">
            <dt class="text-muted-foreground">Na co navázat</dt>
            <dd><ul class="list-disc space-y-0.5 pl-4"><li v-for="x in research.hooks" :key="x">{{ x }}</li></ul></dd>
          </template>
          <template v-if="research.people.length">
            <dt class="text-muted-foreground">Komu psát</dt>
            <dd class="flex flex-col gap-0.5">
              <span v-for="p in research.people" :key="p.name">
                {{ p.name }}<span v-if="p.role" class="text-muted-foreground"> · {{ p.role }}</span>
                <a v-if="p.url" :href="p.url" target="_blank" rel="noopener noreferrer" class="ml-1 text-primary underline-offset-4 hover:underline">zdroj</a>
              </span>
            </dd>
          </template>
          <template v-if="said(research.hiring)"><dt class="text-muted-foreground">Výběrko</dt><dd>{{ research.hiring }}</dd></template>
          <template v-if="research.sources.length">
            <dt class="text-muted-foreground">Zdroje</dt>
            <dd class="flex flex-wrap gap-x-3 gap-y-1">
              <a v-for="u in research.sources" :key="u" :href="u" target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-4 hover:underline">{{ host(u) }}</a>
            </dd>
          </template>
        </dl>
        <p v-else class="text-sm text-muted-foreground">{{ busy ? 'Hledám na webu…' : 'Průzkum firmy zatím není. Projdi si ji přes odkazy níže.' }}</p>
        <p v-if="research" class="text-xs text-muted-foreground">Nalezeno AI na webu {{ formatDate(research.createdAt.slice(0, 10)) }}. Může se plést, než něco z toho napíšeš do e-mailu, ověř to ve zdroji.</p>
        <div class="flex flex-wrap gap-2">
          <Button v-for="x in lookups" :key="x.label" variant="outline" size="sm" as="a" :href="x.href" target="_blank" rel="noopener noreferrer">{{ x.label }}</Button>
        </div>
      </KitStep>

      <!-- 2 -->
      <KitStep :n="2" title="Uprav životopis" hint="Mění se jen shrnutí nahoře a pořadí odrážek. Fakta zůstávají." :tickable="!!kit" :done="isDone('cv')" @toggle="toggle('cv')">
        <template v-if="kit">
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-2"><Label for="cv-summary">Shrnutí na začátek CV</Label><CopyButton :text="draft.cvSummary" /></div>
            <Textarea id="cv-summary" v-model="draft.cvSummary" rows="5" class="leading-relaxed" @blur="persist" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="cv-up">Co dát nahoru <span class="font-normal text-muted-foreground">· jedna rada na řádek, uprav nebo smaž</span></Label>
            <Textarea id="cv-up" v-model="draft.moveUp" rows="6" class="leading-relaxed" @blur="persist" />
          </div>
          <div v-if="kit.cv.keywordsHave.length" class="flex flex-col gap-1.5 text-sm">
            <p class="font-medium">Slova z inzerátu, která máš <span class="font-normal text-muted-foreground">· napiš je do CV stejně jako inzerát</span></p>
            <div class="flex flex-wrap gap-1"><span v-for="k in kit.cv.keywordsHave" :key="k" class="rounded-md bg-success-soft px-1.5 py-0.5 text-xs">{{ k }}</span></div>
          </div>
          <div v-if="kit.cv.keywordsMissing.length" class="flex flex-col gap-1.5 text-sm">
            <p class="font-medium">V profilu chybí <span class="font-normal text-muted-foreground">· doplň jen to, co opravdu umíš</span></p>
            <div class="flex flex-wrap gap-1"><span v-for="k in kit.cv.keywordsMissing" :key="k" class="rounded-md bg-warning-soft px-1.5 py-0.5 text-xs">{{ k }}</span></div>
          </div>
          <div class="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button variant="outline" :disabled="busy" @click="make('cv')">
              <RefreshCwIcon v-if="busy" class="animate-spin" /><FileTextIcon v-else />
              {{ kit.cvDoc ? 'Vygenerovat CV znovu' : 'Vygenerovat CV na míru' }}
            </Button>
            <Button v-if="kit.cvDoc" as="a" :href="`/cv/${encodeURIComponent(id)}`" target="_blank"><ExternalLinkIcon /> Otevřít CV</Button>
            <p class="min-w-48 flex-1 text-xs text-muted-foreground">
              <template v-if="kit.cvDoc">Vytvořeno {{ formatDate(kit.cvDoc.createdAt.slice(0, 10)) }} z profilu a rad výše. Před odesláním ho celé přečti.</template>
              <template v-else>AI sestaví CV z tvého profilu podle shrnutí a rad výše (asi 15 s). Uložíš ho jako PDF.</template>
            </p>
          </div>
        </template>
        <p v-else class="text-sm text-muted-foreground">Rady k životopisu se objeví, až bude přihláška připravená.</p>
      </KitStep>

      <!-- 3 -->
      <KitStep :n="3" title="Napiš zprávu" hint="Koncept přepiš svými slovy. Neupravený text od AI personalisté poznají." :tickable="!!kit" :done="isDone('message')" @toggle="toggle('message')">
        <p v-if="todo.length" class="rounded-xl bg-warning-soft px-3 py-2 text-sm">Před odesláním doplň: {{ [...new Set(todo)].join(' ') }}</p>
        <Tabs v-model="channel">
          <TabsList>
            <TabsTrigger value="email">E-mail</TabsTrigger>
            <TabsTrigger value="form">Formulář</TabsTrigger>
            <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
          </TabsList>

          <TabsContent value="email" class="flex flex-col gap-3 pt-3">
            <div class="flex flex-col gap-1.5"><Label for="mail-to">Komu</Label><Input id="mail-to" v-model="draft.to" type="email" placeholder="adresa@firma.cz" /></div>
            <div class="flex flex-col gap-1.5"><Label for="mail-subject">Předmět</Label><Input id="mail-subject" v-model="draft.subject" @blur="persist" /></div>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2"><Label for="mail-body">Text</Label><CopyButton :text="draft.body" /></div>
              <Textarea id="mail-body" v-model="draft.body" rows="12" class="max-h-[60vh] leading-relaxed" @blur="persist" />
            </div>
            <div class="flex flex-col gap-1.5">
              <p class="text-xs font-medium text-muted-foreground">Přílohy <span class="font-normal">· stáhni a přetáhni do e-mailu; CV na míru ulož z kroku 2</span></p>
              <div v-if="db.docs.length" class="flex flex-wrap gap-1.5">
                <a
                  v-for="d in db.docs"
                  :key="d.id"
                  :href="`/api/docs/${d.id}`"
                  :download="d.fileName"
                  class="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                  @click="docIds.includes(d.id) || docIds.push(d.id)"
                >
                  <DownloadIcon class="size-3" /> {{ d.label }} <span class="font-normal opacity-70">{{ kb(d.size) }}</span>
                </a>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button as="a" :href="mailHref" :aria-disabled="!mailReady" :class="!mailReady && 'pointer-events-none opacity-50'" @click="mailed"><MailIcon /> Otevřít v poště</Button>
              <p class="text-xs text-muted-foreground">Otevře se tvoje pošta a pozice se zapíše jako odeslaná.</p>
            </div>
          </TabsContent>

          <TabsContent value="form" class="flex flex-col gap-3 pt-3">
            <p class="text-sm text-muted-foreground">Odpovědi do polí formuláře. Na vyřazovací otázky (praxe, jazyk, pracovní povolení) odpovídej přesně a pravdivě, podle nich se filtruje nejdřív.</p>
            <div v-for="f in FORM_FIELDS" :key="f.key" class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2"><Label :for="`form-${f.key}`">{{ f.label }}</Label><CopyButton :text="draft[f.key]" /></div>
              <Textarea :id="`form-${f.key}`" v-model="draft[f.key]" :rows="f.rows" :class="f.rows === 1 ? 'min-h-9' : 'leading-relaxed'" @blur="persist" />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button v-if="listing.url" as="a" :href="listing.url" target="_blank" rel="noopener noreferrer"><ExternalLinkIcon /> Otevřít formulář</Button>
              <Button variant="outline" :disabled="sent" @click="applied"><SendIcon /> Odesláno</Button>
            </div>
          </TabsContent>

          <TabsContent value="linkedin" class="flex flex-col gap-3 pt-3">
            <p class="text-sm text-muted-foreground">Krátká zpráva personalistovi nebo vedoucímu týmu vedle přihlášky. Jestli pomáhá, není doložené; pošli ji tam, kde o pozici opravdu stojíš.</p>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2">
                <Label for="li-text">Zpráva <span :class="['font-normal tabular-nums', draft.linkedin.length > 300 ? 'text-destructive' : 'text-muted-foreground']">· {{ draft.linkedin.length }} / 300 znaků</span></Label>
                <CopyButton :text="draft.linkedin" />
              </div>
              <Textarea id="li-text" v-model="draft.linkedin" rows="4" class="leading-relaxed" @blur="persist" />
            </div>
          </TabsContent>
        </Tabs>
      </KitStep>

      <!-- 4 -->
      <KitStep :n="4" title="Odešli a zapiš" :hint="`Po odeslání se pozice přesune do Odesláno a za ${db.settings.followUpDays} dní ti ji připomenu.`" :tickable="!!kit" :done="isDone('sent') || sent" @toggle="toggle('sent')">
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" :disabled="sent" @click="applied"><SendIcon /> {{ sent ? 'Zapsáno jako odeslané' : 'Odesláno, zapsat' }}</Button>
          <p class="min-w-48 flex-1 text-xs text-muted-foreground">E-mail otevřený z kroku 3 se zapíše sám. Tohle tlačítko je pro formulář nebo portál.</p>
        </div>
      </KitStep>

      <!-- After the reply -->
      <section v-if="kit && (kit.call.theyAsk.length || kit.call.myQuestions.length)" class="flex flex-col gap-4 rounded-3xl border border-dashed p-5 text-sm">
        <div>
          <h2 class="text-lg font-bold">Až se ozvou: první hovor</h2>
          <p class="text-muted-foreground">Na co se připravit. S koučem si to můžeš projít nanečisto.</p>
        </div>
        <Button variant="outline" class="w-fit" as-child><RouterLink :to="`/priprava/${encodeURIComponent(id)}`"><GraduationCapIcon /> Příprava na pohovor</RouterLink></Button>
        <div v-if="kit.call.theyAsk.length">
          <h3 class="mb-1 font-medium">Nejspíš se zeptají</h3>
          <ol class="list-decimal space-y-1 pl-5"><li v-for="x in kit.call.theyAsk" :key="x">{{ x }}</li></ol>
        </div>
        <div v-if="kit.call.know.length">
          <h3 class="mb-1 font-medium">O firmě měj v hlavě</h3>
          <ul class="list-disc space-y-1 pl-5"><li v-for="x in kit.call.know" :key="x">{{ x }}</li></ul>
        </div>
        <div v-if="kit.call.myQuestions.length">
          <h3 class="mb-1 font-medium">Zeptej se ty</h3>
          <ul class="list-disc space-y-1 pl-5"><li v-for="x in kit.call.myQuestions" :key="x">{{ x }}</li></ul>
        </div>
      </section>

      <p v-if="kit" class="text-xs text-muted-foreground">Koncepty napsala AI ({{ kit.model }}) {{ formatDate(kit.createdAt.slice(0, 10)) }} jen z tvého profilu a z inzerátu. Za to, co odešleš, ručíš ty.</p>
    </template>
  </div>
</template>
