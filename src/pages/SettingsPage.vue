<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { toast } from 'vue-sonner';
import { AlarmClockIcon, MailPlusIcon, DatabaseIcon, DownloadIcon, HardDriveDownloadIcon, MailIcon, SaveIcon, SearchIcon, WalletIcon } from '@lucide/vue';
import type { Settings, TemplateKind } from '../../shared/types';
import PageHeader from '../components/PageHeader.vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { db, saveSettings } from '../store';

const form = reactive<Settings>(structuredClone(JSON.parse(JSON.stringify(db.settings)) as Settings));
const TEMPLATE_KINDS: { id: TemplateKind; label: string }[] = [
  { id: 'followUp', label: 'Připomenutí' },
  { id: 'thankYou', label: 'Poděkování' },
  { id: 'decline', label: 'Odmítnutí' },
];

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
const vueKeywords = ref(form.vueKeywords.join(', '));
const saving = ref(false);

const split = (text: string) => text.split(',').map((t) => t.trim()).filter(Boolean);

async function save() {
  saving.value = true;
  try {
    await saveSettings({ ...form, keywords: split(keywords.value), vueKeywords: split(vueKeywords.value) });
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
    <PageHeader title="Nastavení" description="Úvodní e-mail, klíčová slova pro hledání a tvoje mzdové minimum." />

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
        <CardTitle class="flex items-center gap-2"><SearchIcon class="size-4 text-muted-foreground" /> Hledání nových inzerátů</CardTitle>
        <CardDescription>Každé klíčové slovo přidá dotazy na LinkedIn, které trvají nejdéle. Čtyři až šest slov je rozumné maximum.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <Label for="keywords">Klíčová slova</Label>
          <Input id="keywords" v-model="keywords" />
          <p class="text-xs text-muted-foreground">Oddělená čárkou.</p>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="vue-keywords">Klíčová slova pro Vue</Label>
          <Input id="vue-keywords" v-model="vueKeywords" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="exclude">Vynechat názvy pozic</Label>
          <Input id="exclude" v-model="form.excludeTitle" placeholder="např. java|php|devops" class="font-mono text-xs" />
          <p class="text-xs text-muted-foreground">Regulární výraz. Prázdné = výchozí seznam.</p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><WalletIcon class="size-4 text-muted-foreground" /> Mzda</CardTitle>
        <CardDescription>Firmy, jejichž horní odhad je pod minimem, se zvýrazní červeně.</CardDescription>
      </CardHeader>
      <CardContent>
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
