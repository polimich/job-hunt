<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { CheckIcon, FileTextIcon, LoaderCircleIcon, MailIcon, SendIcon } from '@lucide/vue';
import type { Listing, MailDraft, MailMessage } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { bestEmail, fillTemplate, looksCzech, mailto } from '../format';
import { mailStatus, sendMail } from '../mail';
import { companyById, contactsOf, db, statusOf } from '../store';

type Kind = MailDraft['kind'];

/** Write and send one e-mail for a listing; without Gmail it falls back to a mailto: link. */
/** `lang` overrides the language guessed from the posting's text. */
const props = defineProps<{ listing: Listing; kind: Kind; lang?: 'cs' | 'en'; replyTo?: MailMessage }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ sent: [message: MailMessage] }>();

const KINDS: { id: Kind; label: string }[] = [
  { id: 'intro', label: 'Úvodní e-mail' },
  { id: 'followUp', label: 'Připomenutí' },
  { id: 'thankYou', label: 'Poděkování po pohovoru' },
  { id: 'decline', label: 'Odmítnutí nabídky' },
  { id: 'other', label: 'Vlastní' },
];

// E-mails go to a person I know there first, then the company's best address. A reply goes back to the sender.
const recipient = computed(() => {
  if (props.replyTo) return { address: props.replyTo.from, name: props.replyTo.fromName };
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
const sending = ref(false);
// What the last template put in, so switching language only overwrites text I have not touched.
const filled = ref({ subject: '', body: '' });

const replySubject = (s: string) => (/^re:/i.test(s.trim()) ? s.trim() : `Re: ${s.trim()}`);

function template(k: Kind): { subject: string; body: string } {
  if (k === 'other') return { subject: '', body: '' };
  const t = k === 'intro' ? (lang.value === 'cs' ? db.settings.introCs : db.settings.introEn) : db.settings.templates[k][lang.value];
  return { subject: fillTemplate(t.subject, props.listing, recipient.value.name), body: fillTemplate(t.body, props.listing, recipient.value.name) };
}

function apply() {
  const t = template(kind.value);
  // A reply keeps its "Re:" subject; the template only gives the text.
  subject.value = props.replyTo ? replySubject(props.replyTo.subject) : t.subject;
  body.value = t.body;
  filled.value = { subject: subject.value, body: body.value };
}

// Start fresh each time the dialog opens.
watch(open, (v) => {
  if (!v) return;
  to.value = recipient.value.address;
  lang.value = props.lang ?? (looksCzech(props.listing.text || props.listing.strengths) ? 'cs' : 'en');
  kind.value = props.replyTo && props.kind === 'intro' ? 'other' : props.kind;
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

const toggleDoc = (id: string) => (docIds.value = docIds.value.includes(id) ? docIds.value.filter((x) => x !== id) : [...docIds.value, id]);
const kb = (size: number) => `${Math.max(1, Math.round(size / 1024))} kB`;

const connected = computed(() => mailStatus.value.connected);
const href = computed(() => mailto(to.value, subject.value, body.value, props.listing));
const canSend = computed(() => !!to.value.trim() && !!subject.value.trim() && !!body.value.trim() && !sending.value);

async function send() {
  if (!connected.value || !canSend.value) return;
  sending.value = true;
  const before = statusOf(props.listing);
  try {
    const message = await sendMail({
      listingId: props.listing.id,
      to: to.value.trim(),
      subject: subject.value.trim(),
      body: body.value,
      docIds: docIds.value,
      kind: kind.value,
      replyTo: props.replyTo?.id,
    });
    const moved = kind.value === 'intro' && statusOf(props.listing) !== before;
    toast.success('Odesláno', moved ? { description: 'Pozice je teď Odesláno' } : undefined);
    emit('sent', message);
    open.value = false;
  } catch (e) {
    toast.error('Odeslání selhalo', { description: e instanceof Error ? e.message : String(e) });
  } finally {
    sending.value = false;
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void send();
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl" @keydown="onKey">
      <DialogHeader>
        <DialogTitle>{{ replyTo ? 'Odpověď' : 'Nový e-mail' }}</DialogTitle>
        <DialogDescription class="truncate">{{ listing.company }} – {{ listing.title }}</DialogDescription>
      </DialogHeader>

      <form id="compose-form" class="flex min-w-0 flex-col gap-3" @submit.prevent="send">
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

        <div v-if="connected" class="flex flex-col gap-1.5">
          <p class="text-xs font-medium text-muted-foreground">Přílohy</p>
          <div v-if="db.docs.length" class="flex flex-wrap gap-1.5">
            <button
              v-for="d in db.docs"
              :key="d.id"
              type="button"
              :aria-pressed="docIds.includes(d.id)"
              :class="cn(
                'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors',
                docIds.includes(d.id) ? 'border-(--st-applied-dot)/40 bg-(--st-applied-bg) text-(--st-applied-fg)' : 'text-muted-foreground hover:border-foreground/20 hover:text-foreground',
              )"
              @click="toggleDoc(d.id)"
            >
              <CheckIcon v-if="docIds.includes(d.id)" class="size-3 animate-pop" /><FileTextIcon v-else class="size-3" />
              {{ d.label }} <span class="font-normal opacity-70">{{ kb(d.size) }}</span>
            </button>
          </div>
          <RouterLink v-else to="/nastaveni#dokumenty" class="text-xs text-primary hover:underline underline-offset-4" @click="open = false">Nahraj CV v Nastavení →</RouterLink>
        </div>
      </form>

      <DialogFooter class="items-center gap-2 sm:justify-between">
        <p v-if="!connected" class="text-xs text-muted-foreground">Připoj Gmail v Nastavení a posílej přímo odsud i s CV.</p>
        <p v-else class="hidden text-xs text-muted-foreground sm:block">Ctrl/⌘ + Enter odešle</p>
        <div class="flex gap-2">
          <Button variant="ghost" type="button" @click="open = false">Zrušit</Button>
          <Button v-if="connected" type="submit" form="compose-form" :disabled="!canSend">
            <LoaderCircleIcon v-if="sending" class="animate-spin" /><SendIcon v-else /> Odeslat
          </Button>
          <Button v-else as="a" :href="href" @click="open = false"><MailIcon /> Otevřít v poště</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
