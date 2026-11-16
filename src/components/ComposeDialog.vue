<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { DownloadIcon, MailIcon } from '@lucide/vue';
import type { EmailTemplateKind, Listing } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { bestEmail, fillTemplate, looksCzech, mailto } from '../format';
import { logEmail, restoreState } from '../mail';
import { companyById, contactsOf, db, statusOf } from '../store';

type Kind = EmailTemplateKind;

/**
 * Prepare one e-mail for a listing from a template and open it in the mail program. Opening it
 * logs it in the history (with undo); the CV is downloaded here and dragged into the e-mail,
 * because a mailto: link cannot carry attachments. `lang` overrides the guessed language.
 */
const props = defineProps<{ listing: Listing; kind: Kind; lang?: 'cs' | 'en' }>();
const open = defineModel<boolean>('open', { default: false });

const KINDS: { id: Kind; label: string }[] = [
  { id: 'intro', label: 'Úvodní e-mail' },
  { id: 'followUp', label: 'Připomenutí' },
  { id: 'thankYou', label: 'Poděkování po pohovoru' },
  { id: 'decline', label: 'Odmítnutí nabídky' },
  { id: 'other', label: 'Vlastní' },
];

// E-mails go to a person I know there first, then the company's best address.
const recipient = computed(() => {
  const person = contactsOf(props.listing.companyId).find((c) => c.email);
  return person
    ? { address: person.email, name: person.name }
    : { address: bestEmail(companyById.value.get(props.listing.companyId))?.address ?? '', name: '' };
});

const to = ref('');
const subject = ref('');
const body = ref('');
const kind = ref<Kind>('intro');
const lang = ref<'cs' | 'en'>('cs');
const docIds = ref<string[]>([]);
// What the last template put in, so switching language only overwrites text I have not touched.
const filled = ref({ subject: '', body: '' });

function template(k: Kind): { subject: string; body: string } {
  if (k === 'other') return { subject: '', body: '' };
  const t = k === 'intro' ? (lang.value === 'cs' ? db.settings.introCs : db.settings.introEn) : db.settings.templates[k][lang.value];
  return { subject: fillTemplate(t.subject, props.listing, recipient.value.name), body: fillTemplate(t.body, props.listing, recipient.value.name) };
}

function apply() {
  const t = template(kind.value);
  subject.value = t.subject;
  body.value = t.body;
  filled.value = { subject: subject.value, body: body.value };
}

// Start fresh each time the dialog opens.
watch(open, (v) => {
  if (!v) return;
  to.value = recipient.value.address;
  lang.value = props.lang ?? (looksCzech(props.listing.text || props.listing.strengths) ? 'cs' : 'en');
  kind.value = props.kind;
  apply();
  // An intro goes with the newest CV unless I pick otherwise.
  const cv = [...db.docs].filter((d) => d.kind === 'cv').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  docIds.value = kind.value === 'intro' && cv ? [cv.id] : [];
}, { immediate: true });

function pickKind(v: unknown) {
  kind.value = v as Kind;
  apply();
}
watch(lang, () => {
  if (subject.value === filled.value.subject && body.value === filled.value.body) apply();
});

const kb = (size: number) => `${Math.max(1, Math.round(size / 1024))} kB`;

const href = computed(() => mailto(to.value, subject.value, body.value, props.listing));
const ready = computed(() => !!subject.value.trim() && !!body.value.trim());

/** The mail program opens from the link itself; here the e-mail is logged, with a way back. */
async function opened() {
  const before = statusOf(props.listing);
  const listingId = props.listing.id;
  open.value = false;
  try {
    const prev = await logEmail(listingId, kind.value, subject.value, docIds.value);
    const moved = statusOf(props.listing) !== before;
    toast.success('Zapsáno do historie', {
      description: moved ? 'Pozice je teď Odesláno' : 'Nakonec neodesláno? Vrať to.',
      action: { label: 'Zpět', onClick: () => void restoreState(listingId, prev).catch(() => toast.error('Vrácení selhalo')) },
    });
  } catch (e) {
    toast.error('Zápis selhal', { description: e instanceof Error ? e.message : String(e) });
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Nový e-mail</DialogTitle>
        <DialogDescription class="truncate">{{ listing.company }} – {{ listing.title }}</DialogDescription>
      </DialogHeader>

      <div class="flex min-w-0 flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <Select :model-value="kind" @update:model-value="pickKind">
            <SelectTrigger size="sm" aria-label="Šablona" class="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="k in KINDS" :key="k.id" :value="k.id">{{ k.label }}</SelectItem>
            </SelectContent>
          </Select>
          <ToggleGroup v-model="lang" type="single" variant="outline" size="sm" aria-label="Jazyk šablony" @update:model-value="(v) => v || (lang = 'cs')">
            <ToggleGroupItem value="cs" aria-label="Česky">CZ</ToggleGroupItem>
            <ToggleGroupItem value="en" aria-label="Anglicky">EN</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div class="flex flex-col gap-1.5"><Label for="compose-to">Komu</Label><Input id="compose-to" v-model="to" type="email" placeholder="adresa@firma.cz" /></div>
        <div class="flex flex-col gap-1.5"><Label for="compose-subject">Předmět</Label><Input id="compose-subject" v-model="subject" /></div>
        <div class="flex flex-col gap-1.5">
          <Label for="compose-body">Text</Label>
          <Textarea id="compose-body" v-model="body" rows="12" class="max-h-[50vh] leading-relaxed" />
        </div>

        <div class="flex flex-col gap-1.5">
          <p class="text-xs font-medium text-muted-foreground">Přílohy <span class="font-normal">· stáhni a přetáhni do e-mailu</span></p>
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
          <RouterLink v-else to="/nastaveni#dokumenty" class="text-xs text-primary hover:underline underline-offset-4" @click="open = false">Nahraj CV v Nastavení →</RouterLink>
        </div>
      </div>

      <DialogFooter class="items-center gap-2 sm:justify-between">
        <p class="text-xs text-muted-foreground">Otevře se tvoje pošta a e-mail se zapíše do historie.</p>
        <div class="flex gap-2">
          <Button variant="ghost" type="button" @click="open = false">Zrušit</Button>
          <Button as="a" :href="href" :aria-disabled="!ready" :class="!ready && 'pointer-events-none opacity-50'" @click="opened"><MailIcon /> Otevřít v poště</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
