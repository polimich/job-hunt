<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { DownloadIcon, LoaderCircleIcon, PlusIcon } from '@lucide/vue';
import { placeOf } from '../../shared/search';
import type { Listing, ManualInput, Status } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { statusMeta } from '@/lib/status';
import { PLACE_LABEL } from '../format';
import { addListing, addOpen, db, previewUrl, setState } from '../store';

const router = useRouter();

const blank = (): Required<ManualInput> => ({ url: '', title: '', company: '', location: '', place: 'local', mode: '', salaryPosted: '', text: '' });
const fields = ref(blank());
const status = ref<Status>('interested');
const fetching = ref(false);
const saving = ref(false);

watch(addOpen, (open) => {
  if (open) {
    fields.value = blank();
    status.value = 'interested';
  }
});

const STATUS_CHOICES: Status[] = ['interested', 'applied', 'talking', 'interview'];
const PLACES = Object.entries(PLACE_LABEL) as [Listing['place'], string][];
const canSave = computed(() => fields.value.title.trim() && fields.value.company.trim() && !saving.value);

async function fetchUrl() {
  if (!/^https?:\/\//i.test(fields.value.url)) return;
  fetching.value = true;
  try {
    const p = await previewUrl(fields.value.url);
    fields.value.title ||= p.title;
    fields.value.company ||= p.company;
    fields.value.location ||= p.location;
    fields.value.text ||= p.text;
    if (p.location) fields.value.place = placeOf(p.location, '', db.settings.location);
    if (!p.title && !p.text) toast.info('Ze stránky se nic nenačetlo', { description: 'Vyplň údaje ručně.' });
  } catch (e) {
    toast.error('Stránku se nepodařilo načíst', { description: e instanceof Error ? e.message : String(e) });
  } finally {
    fetching.value = false;
  }
}

/** Pasting a URL into an empty form reads it at once. */
const onPaste = () => setTimeout(() => !fields.value.title && void fetchUrl(), 0);

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const id = await addListing({ ...fields.value });
    await setState(id, { status: status.value });
    addOpen.value = false;
    toast.success('Pozice přidána');
    void router.push(`/pozice/${id}`);
  } catch (e) {
    toast.error('Přidání selhalo', { description: e instanceof Error ? e.message.replace(/^\d+ /, '') : String(e) });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="addOpen">
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Přidat pozici</DialogTitle>
        <DialogDescription>Doporučení, nabídka od recruitera nebo kariérní stránka firmy. Obnovení ji nikdy neuzavře.</DialogDescription>
      </DialogHeader>

      <form id="add-listing" class="flex flex-col gap-4" @submit.prevent="save">
        <div class="flex flex-col gap-1.5">
          <Label for="add-url">Odkaz na inzerát</Label>
          <div class="flex gap-2">
            <Input id="add-url" v-model="fields.url" type="url" placeholder="https://…" class="flex-1" @keydown.enter.prevent="fetchUrl" @paste="onPaste" />
            <Button type="button" variant="outline" :disabled="fetching || !fields.url" @click="fetchUrl">
              <LoaderCircleIcon v-if="fetching" class="animate-spin" /><DownloadIcon v-else /> Načíst
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">Nepovinné. Po vložení se zkusí doplnit název, firma a text.</p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <Label for="add-title">Pozice *</Label>
            <Input id="add-title" v-model="fields.title" required placeholder="Frontend Developer" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="add-company">Firma *</Label>
            <Input id="add-company" v-model="fields.company" required placeholder="Acme s.r.o." />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="add-location">Místo</Label>
            <Input id="add-location" v-model="fields.location" placeholder="Město, hybrid" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Oblast</Label>
            <Select v-model="fields.place">
              <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="[id, label] in PLACES" :key="id" :value="id">{{ label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="add-salary">Mzda v inzerátu</Label>
            <Input id="add-salary" v-model="fields.salaryPosted" placeholder="80–100 tis. Kč" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Stav</Label>
            <Select v-model="status">
              <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="s in STATUS_CHOICES" :key="s" :value="s">
                  <component :is="statusMeta(s).icon" /> {{ statusMeta(s).label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="add-text">Text inzerátu</Label>
          <Textarea id="add-text" v-model="fields.text" rows="4" placeholder="Vlož text, ať jde prohledávat a odhadne se shoda." class="max-h-48" />
        </div>
      </form>

      <DialogFooter>
        <Button variant="ghost" @click="addOpen = false">Zrušit</Button>
        <Button type="submit" form="add-listing" :disabled="!canSave">
          <LoaderCircleIcon v-if="saving" class="animate-spin" /><PlusIcon v-else /> Přidat
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
