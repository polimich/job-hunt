<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { toast } from 'vue-sonner';
import { AlarmClockIcon, RadarIcon, CalendarDaysIcon, CalendarPlusIcon, CopyIcon, FileTextIcon, PaperclipIcon, Trash2Icon, UploadIcon, MailPlusIcon, DatabaseIcon, ChevronDownIcon, DownloadIcon, HardDriveDownloadIcon, MailIcon, SaveIcon, SearchIcon, WalletIcon } from '@lucide/vue';
import { CITIES, cityCode, ISCO_GROUPS, splitList } from '../../shared/search';
import { SOURCE_LABELS, type Level, type Settings, type Source, type TemplateKind } from '../../shared/types';
import FilterChip from '../components/FilterChip.vue';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '../components/PageHeader.vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { db, deleteDoc, saveSettings, uploadDoc } from '../store';
import type { Doc } from '../../shared/types';

const form = reactive<Settings>(structuredClone(JSON.parse(JSON.stringify(db.settings)) as Settings));
const TEMPLATE_KINDS: { id: TemplateKind; label: string }[] = [
  { id: 'followUp', label: 'Připomenutí' },
  { id: 'thankYou', label: 'Poděkování' },
  { id: 'decline', label: 'Odmítnutí' },
];

const docLabel = ref('');
const docKind = ref<Doc['kind']>('cv');
const docFile = ref<File | null>(null);
const uploading = ref(false);
async function upload() {
  if (!docFile.value) return;
  uploading.value = true;
  try {
    await uploadDoc(docFile.value, docLabel.value, docKind.value);
    docLabel.value = '';
    docFile.value = null;
    toast.success('Dokument nahrán');
  } catch (e) {
    toast.error('Nahrání selhalo', { description: e instanceof Error ? e.message : String(e) });
  } finally {
    uploading.value = false;
  }
}
async function removeDoc(id: string, label: string) {
  if (!confirm(`Smazat ${label}? U přihlášek zmizí i označení.`)) return;
  await deleteDoc(id).catch((e) => toast.error('Smazání selhalo', { description: String(e) }));
}

// The API serves the feed on its own port, also while developing on Vite's.
const calendarUrl = `webcal://${location.hostname}:${location.port === '5173' ? '5174' : location.port || '80'}/calendar.ics`;
async function copyCalendar() {
  try {
    await navigator.clipboard.writeText(calendarUrl);
    toast.success('Adresa zkopírována');
  } catch {
    toast.error('Kopírování se nepovedlo');
  }
}

interface SourceInfo {
  id: Source;
  about: string;
  on: boolean;
  needsKey?: { env: string; signup: string; has: boolean };
}
const sources = ref<SourceInfo[]>([]);
onMounted(async () => {
  try {
    sources.value = (await (await fetch('/api/sources')).json()) as SourceInfo[];
  } catch {
    /* the list just stays empty */
  }
});

const backups = ref<string[]>([]);
const loadBackups = async () => (backups.value = (await (await fetch('/api/backups')).json()) as string[]);
onMounted(() => void loadBackups().catch(() => undefined));
async function backupNow() {
  try {
    const res = await fetch('/api/backups', { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    await loadBackups();
    toast.success('Záloha uložena', { description: backups.value[0] });
  } catch (e) {
    toast.error('Záloha selhala', { description: e instanceof Error ? e.message : String(e) });
  }
}

const keywords = ref(form.keywords.join(', '));
const skills = ref((form.skills ?? []).join(', '));
const titleMustMatch = ref(form.titleMustMatch.join(', '));
const excludeWords = ref(form.excludeWords.join(', '));
const CITY_NAMES = Object.keys(CITIES);
const RADII = [0, 10, 20, 30, 50];
const AGES = [...new Set([3, 7, 10, 14, 30, 0, form.postedWithinDays])].sort((a, b) => (a || 999) - (b || 999));
const LEVELS: { id: Level; label: string }[] = [
  { id: 'any', label: 'nerozhoduje' },
  { id: 'junior', label: 'junior' },
  { id: 'medior', label: 'medior' },
  { id: 'senior', label: 'senior' },
  { id: 'lead', label: 'vedoucí / lead' },
];
function toggleGroup(id: string) {
  const i = form.mpsvCategories.indexOf(id);
  if (i >= 0) form.mpsvCategories.splice(i, 1);
  else form.mpsvCategories.push(id);
}
const saving = ref(false);


async function save() {
  saving.value = true;
  try {
    await saveSettings({
      ...form,
      keywords: splitList(keywords.value),
      titleMustMatch: splitList(titleMustMatch.value),
      excludeWords: splitList(excludeWords.value),
      skills: splitList(skills.value),
    });
    toast.success('Nastavení uloženo');
  } catch (e) {
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="mx-auto flex max-w-3xl flex-col gap-6 px-6 pt-8 pb-16" @submit.prevent="save">
    <PageHeader title="Nastavení" description="Co a kde hledat, tvůj profil, e-maily a připomínky." />

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><SearchIcon class="size-4 text-muted-foreground" /> Hledání</CardTitle>
        <CardDescription>Co a kde se při obnovení hledá na všech zapnutých portálech.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-5">
        <div class="flex flex-col gap-2">
          <Label for="keywords">Klíčová slova</Label>
          <Input id="keywords" v-model="keywords" placeholder="např. frontend developer, účetní, projektový manažer" />
          <p class="text-xs text-muted-foreground">Oddělená čárkou. Každé slovo je jeden dotaz na každém portálu, takže víc než šest slov obnovení zpomalí (hlavně LinkedIn).</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div class="flex flex-col gap-2">
            <Label for="location">Město</Label>
            <Input id="location" v-model="form.location" list="cities" placeholder="Prázdné = celá ČR" />
            <datalist id="cities"><option v-for="c in CITY_NAMES" :key="c" :value="c" /></datalist>
            <p v-if="form.location.trim() && !cityCode(form.location)" class="text-xs text-muted-foreground">
              Úřad práce zná jen větší města ze seznamu; ostatní portály hledají i tady.
            </p>
          </div>
          <div class="flex flex-col gap-2">
            <Label for="radius">Okruh</Label>
            <Select :model-value="String(form.radiusKm)" :disabled="!form.location.trim()" @update:model-value="(v) => (form.radiusKm = Number(v))">
              <SelectTrigger id="radius" class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="r in RADII" :key="r" :value="String(r)">{{ r ? `+ ${r} km` : "jen město" }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <Label class="flex items-start gap-3 font-normal">
            <Checkbox v-model="form.remote" class="mt-0.5" />
            <span class="flex flex-col gap-0.5">
              <span class="font-medium">Hledat i práci na dálku</span>
              <span class="text-xs text-muted-foreground">Remote pozice odkudkoli z ČR.</span>
            </span>
          </Label>
          <div class="flex flex-col gap-2">
            <Label for="posted">Stáří inzerátů</Label>
            <Select :model-value="String(form.postedWithinDays)" @update:model-value="(v) => (form.postedWithinDays = Number(v))">
              <SelectTrigger id="posted" class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="d in AGES" :key="d" :value="String(d)">{{ d ? `posledních ${d} dní` : "jakékoli" }}</SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-muted-foreground">Umí jen LinkedIn; ostatní portály ukazují jen aktuální nabídky.</p>
          </div>
        </div>
        <details class="group rounded-xl border px-4 py-3" :open="!!form.titleMustMatch.length || !!form.excludeWords.length">
          <summary class="flex items-center justify-between text-sm font-medium select-none">
            Filtrovat názvy pozic
            <ChevronDownIcon class="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div class="flex flex-col gap-4 pt-4">
            <div class="flex flex-col gap-2">
              <Label for="must">Název musí obsahovat aspoň jedno z</Label>
              <Textarea id="must" v-model="titleMustMatch" rows="2" placeholder="Prázdné = věřit vyhledávání portálu" />
            </div>
            <div class="flex flex-col gap-2">
              <Label for="exclude">Vynechat pozice, jejichž název obsahuje</Label>
              <Textarea id="exclude" v-model="excludeWords" rows="3" placeholder="např. junior, java, sales" />
            </div>
            <p class="text-xs text-muted-foreground">Oddělené čárkou. Porovnávají se celá slova bez ohledu na diakritiku: „java“ nevyřadí „JavaScript“.</p>
          </div>
        </details>
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">Obory z Úřadu práce</span>
          <p class="text-xs text-muted-foreground">Inzeráty Úřadu práce mají málokdy technologie v textu. Zvolené obory se berou celé, ostatní jen když zmíní klíčové slovo.</p>
          <div class="flex flex-wrap gap-1.5">
            <FilterChip v-for="g in ISCO_GROUPS" :key="g.id" :on="form.mpsvCategories.includes(g.id)" @toggle="toggleGroup(g.id)">{{ g.label }}</FilterChip>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><RadarIcon class="size-4 text-muted-foreground" /> Zdroje inzerátů</CardTitle>
        <CardDescription>Kde se při obnovení hledají nové pozice. Přednost mají oficiální data a API, scrapování jen tam, kde jiná cesta není.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col divide-y">
        <label v-for="src in sources" :key="src.id" class="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <Checkbox
            :model-value="!!src.needsKey && !src.needsKey.has ? false : ((form.sources ??= {})[src.id] ?? src.on)"
            :disabled="!!src.needsKey && !src.needsKey.has"
            class="mt-0.5"
            @update:model-value="(v) => ((form.sources ??= {})[src.id] = v === true)"
          />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {{ SOURCE_LABELS[src.id] }}
              <span v-if="src.needsKey && src.needsKey.has" class="rounded-full bg-(--st-interview-bg) px-2 text-[11px] font-semibold text-(--st-interview-fg)">klíč nastaven</span>
              <span v-else-if="src.needsKey" class="rounded-full bg-muted px-2 text-[11px] font-semibold text-muted-foreground">potřebuje klíč</span>
            </span>
            <span class="text-xs text-muted-foreground">{{ src.about }}</span>
            <span v-if="src.needsKey && !src.needsKey.has" class="text-xs text-muted-foreground">
              Zdarma na <a :href="src.needsKey.signup" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline underline-offset-4">{{ src.needsKey.signup.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] }}</a>,
              pak <code class="rounded bg-muted px-1 font-mono">{{ src.needsKey.env }}=…</code> do souboru <code class="rounded bg-muted px-1 font-mono">.env</code> a restart serveru.
            </span>
          </span>
        </label>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><MailIcon class="size-4 text-muted-foreground" /> Úvodní e-mail</CardTitle>
        <CardDescription>
          Tlačítko E-mail u pozice otevře poštu s tímhle textem.
          <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">{title}</code> se nahradí názvem pozice,
          <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">{company}</code> firmou. Životopis přilož ručně.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs default-value="cs" class="gap-4">
          <TabsList>
            <TabsTrigger value="cs">Česky</TabsTrigger>
            <TabsTrigger value="en">Anglicky</TabsTrigger>
          </TabsList>
          <TabsContent value="cs" class="flex flex-col gap-4">
            <div class="flex flex-col gap-2"><Label for="cs-subject">Předmět</Label><Input id="cs-subject" v-model="form.introCs.subject" /></div>
            <div class="flex flex-col gap-2"><Label for="cs-body">Text</Label><Textarea id="cs-body" v-model="form.introCs.body" rows="10" class="leading-relaxed" /></div>
          </TabsContent>
          <TabsContent value="en" class="flex flex-col gap-4">
            <div class="flex flex-col gap-2"><Label for="en-subject">Předmět</Label><Input id="en-subject" v-model="form.introEn.subject" /></div>
            <div class="flex flex-col gap-2"><Label for="en-body">Text</Label><Textarea id="en-body" v-model="form.introEn.body" rows="10" class="leading-relaxed" /></div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><MailPlusIcon class="size-4 text-muted-foreground" /> Další e-maily</CardTitle>
        <CardDescription>
          V detailu pozice pod tlačítkem E-mail. <code class="rounded bg-muted px-1 font-mono text-xs">{company}</code>,
          <code class="rounded bg-muted px-1 font-mono text-xs">{title}</code> a
          <code class="rounded bg-muted px-1 font-mono text-xs">{name}</code> (křestní jméno kontaktu s mezerou před ním) se doplní.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs default-value="followUp">
          <TabsList>
            <TabsTrigger v-for="k in TEMPLATE_KINDS" :key="k.id" :value="k.id">{{ k.label }}</TabsTrigger>
          </TabsList>
          <TabsContent v-for="k in TEMPLATE_KINDS" :key="k.id" :value="k.id" class="grid gap-4 pt-2 md:grid-cols-2">
            <div v-for="lng in (['cs', 'en'] as const)" :key="lng" class="flex flex-col gap-2">
              <p class="text-xs font-semibold text-muted-foreground">{{ lng === 'cs' ? 'Česky' : 'Anglicky' }}</p>
              <Input v-model="form.templates[k.id][lng].subject" :aria-label="`${k.label} ${lng} předmět`" placeholder="Předmět" />
              <Textarea v-model="form.templates[k.id][lng].body" :aria-label="`${k.label} ${lng} text`" rows="8" class="leading-relaxed" />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>



    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><WalletIcon class="size-4 text-muted-foreground" /> Profil a mzda</CardTitle>
        <CardDescription>Tvoje dovednosti, úroveň a mzdové minimum. Firmy, jejichž horní odhad je pod minimem, se zvýrazní červeně.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-5">
        <div class="flex flex-col gap-2">
          <Label for="skills">Moje dovednosti</Label>
          <Input id="skills" v-model="skills" placeholder="např. React, TypeScript, Figma, účetnictví" />
          <p class="text-xs text-muted-foreground">Oddělené čárkou. V detailu pozice uvidíš, kolik procent stacku umíš a co chybí; podle nich se odhaduje i shoda nových inzerátů.</p>
        </div>
        <div class="flex max-w-xs flex-col gap-2">
          <Label for="level">Úroveň, o kterou mi jde</Label>
          <Select v-model="form.level">
            <SelectTrigger id="level" class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="l in LEVELS" :key="l.id" :value="l.id">{{ l.label }}</SelectItem>
            </SelectContent>
          </Select>
          <p class="text-xs text-muted-foreground">Pozice o úroveň výš nebo níž dostanou nižší odhad shody.</p>
        </div>
        <div class="flex max-w-xs flex-col gap-2">
          <Label for="min-salary">Moje minimum, hrubého měsíčně</Label>
          <div class="relative">
            <Input id="min-salary" v-model.number="form.minSalary" type="number" step="5000" min="0" class="pr-10 tabular-nums" />
            <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">Kč</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><AlarmClockIcon class="size-4 text-muted-foreground" /> Připomínky a obnovení</CardTitle>
        <CardDescription>
          Po odeslání přihlášky se za zvolený počet dní objeví na stránce Dnes připomínka. Po dvou připomenutích bez odpovědi
          nabídne označit pozici jako bez odpovědi.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-5">
        <div class="flex max-w-xs flex-col gap-2">
          <Label for="follow-up-days">Připomenout se po</Label>
          <div class="relative">
            <Input id="follow-up-days" v-model.number="form.followUpDays" type="number" min="1" max="60" class="pr-12 tabular-nums" />
            <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">dnech</span>
          </div>
        </div>
        <div class="flex max-w-xs flex-col gap-2">
          <Label for="weekly-goal">Týdenní cíl odeslaných přihlášek</Label>
          <Input id="weekly-goal" v-model.number="form.weeklyGoal" type="number" min="1" max="50" class="tabular-nums" />
          <p class="text-xs text-muted-foreground">Na stránce Dnes uvidíš postup a kolik týdnů v řadě ho plníš.</p>
        </div>
        <Label class="flex items-start gap-3 font-normal">
          <Checkbox v-model="form.autoRefresh" class="mt-0.5" />
          <span class="flex flex-col gap-0.5">
            <span class="font-medium">Obnovovat inzeráty jednou denně</span>
            <span class="text-xs text-muted-foreground">Když běží server, obnoví se sám mezi 7. a 23. hodinou, pokud poslední obnovení je starší než 20 hodin.</span>
          </span>
        </Label>
      </CardContent>
    </Card>

    <Card id="dokumenty">
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><PaperclipIcon class="size-4 text-muted-foreground" /> Dokumenty</CardTitle>
        <CardDescription>Verze CV, motivační dopisy, portfolio. U každé přihlášky pak označíš, co jsi poslal(a), a Přehled ukáže, která verze funguje.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <form class="flex flex-wrap items-end gap-2" @submit.prevent="upload">
          <div class="flex min-w-48 flex-1 flex-col gap-1.5">
            <Label for="doc-label">Název</Label>
            <Input id="doc-label" v-model="docLabel" placeholder="CV EN – frontend" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="doc-kind">Druh</Label>
            <select id="doc-kind" v-model="docKind" class="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30">
              <option value="cv">CV</option><option value="cover">Motivační dopis</option><option value="other">Jiné</option>
            </select>
          </div>
          <label class="relative inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed px-3 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground">
            <UploadIcon class="size-4" /> {{ docFile ? docFile.name : 'Vybrat soubor' }}
            <input type="file" accept=".pdf,.doc,.docx,.odt,.md,.txt" class="sr-only" @change="docFile = ($event.target as HTMLInputElement).files?.[0] ?? null" />
          </label>
          <Button type="submit" :disabled="!docFile || uploading">Nahrát</Button>
        </form>
        <ul v-if="db.docs.length" class="divide-y rounded-xl border">
          <li v-for="d in db.docs" :key="d.id" class="flex items-center gap-3 px-3 py-2 text-sm">
            <FileTextIcon class="size-4 shrink-0 text-muted-foreground" />
            <a :href="`/api/docs/${d.id}`" target="_blank" class="min-w-0 flex-1 truncate font-medium hover:underline underline-offset-4">{{ d.label }}</a>
            <span class="hidden text-xs text-muted-foreground sm:inline">{{ d.fileName }} · {{ Math.max(1, Math.round(d.size / 1024)) }} kB</span>
            <Button size="icon-xs" variant="ghost" type="button" :aria-label="`Smazat ${d.label}`" class="hover:text-destructive" @click="removeDoc(d.id, d.label)"><Trash2Icon /></Button>
          </li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><CalendarDaysIcon class="size-4 text-muted-foreground" /> Kalendář</CardTitle>
        <CardDescription>Přihlas si tuhle adresu v kalendáři (Apple Calendar: Soubor → Nový odběr kalendáře). Obsahuje pohovory, další kroky a úkoly. Funguje, když běží server.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap items-center gap-2">
        <code class="rounded-lg bg-muted px-2.5 py-1.5 font-mono text-xs">{{ calendarUrl }}</code>
        <Button variant="outline" size="sm" type="button" @click="copyCalendar"><CopyIcon /> Kopírovat</Button>
        <Button as="a" :href="calendarUrl" variant="ghost" size="sm" type="button"><CalendarPlusIcon /> Otevřít v kalendáři</Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><DatabaseIcon class="size-4 text-muted-foreground" /> Data a zálohy</CardTitle>
        <CardDescription>
          Vše je v SQLite souboru <code class="rounded bg-muted px-1 font-mono text-xs">data/jobhunt.db</code>. Server si každý den uloží kopii do
          <code class="rounded bg-muted px-1 font-mono text-xs">data/backups/</code> a drží posledních 30.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <div class="flex flex-wrap gap-2">
          <Button as="a" href="/api/export.csv" variant="outline" type="button"><DownloadIcon /> Export CSV (tabulka)</Button>
          <Button as="a" href="/api/export.json" variant="outline" type="button"><DownloadIcon /> Export JSON (vše)</Button>
          <Button variant="outline" type="button" @click="backupNow"><HardDriveDownloadIcon /> Zálohovat teď</Button>
        </div>
        <p v-if="backups.length" class="text-xs text-muted-foreground">
          Poslední záloha: <span class="font-medium text-foreground">{{ backups[0] }}</span> · celkem {{ backups.length }}
        </p>
      </CardContent>
    </Card>

    <div class="sticky bottom-0 -mx-6 -mb-16 flex justify-end border-t bg-background/85 px-6 py-3 backdrop-blur">
      <Button type="submit" :disabled="saving">
        <SaveIcon /> {{ saving ? 'Ukládám…' : 'Uložit nastavení' }}
      </Button>
    </div>
  </form>
</template>
