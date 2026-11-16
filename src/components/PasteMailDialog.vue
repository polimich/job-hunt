<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { InboxIcon } from '@lucide/vue';
import { classify, suggestedStatus } from '../../shared/mail';
import type { Listing, MailClass } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from './StatusBadge.vue';
import { addEvent, setState, statusOf, todayIso } from '../store';

/**
 * Paste an e-mail the company sent: it goes into the history, and when it reads like a
 * rejection, an invitation, an offer or a confirmation, the matching status is one click away.
 */
const props = defineProps<{ listing: Listing }>();
const open = defineModel<boolean>('open', { default: false });

const text = ref('');
const at = ref('');
watch(open, (v) => {
  if (!v) return;
  text.value = '';
  at.value = todayIso.value;
});

const LABEL: Record<MailClass, string> = {
  receipt: 'potvrzení přihlášky',
  rejection: 'zamítnutí',
  invite: 'pozvánka na pohovor',
  offer: 'nabídka',
  assignment: 'úkol',
  reply: 'odpověď',
};
const cls = computed<MailClass | null>(() => (text.value.trim().length > 20 ? classify(text.value) : null));
const next = computed(() => (cls.value ? suggestedStatus(cls.value, statusOf(props.listing)) : null));
/** First non-empty line, usually the subject or greeting, as the history title. */
const title = computed(() => text.value.trim().split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 120) ?? '');

async function save(withStatus: boolean) {
  try {
    await addEvent(props.listing.id, { kind: 'message', at: at.value || todayIso.value, text: `📩 ${title.value}\n\n${text.value.trim()}`.slice(0, 4000) });
    if (withStatus && next.value) await setState(props.listing.id, { status: next.value });
    toast.success('Zapsáno do historie');
    open.value = false;
  } catch (e) {
    toast.error('Zápis selhal', { description: e instanceof Error ? e.message : String(e) });
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2"><InboxIcon class="size-4" /> Přijatý e-mail</DialogTitle>
        <DialogDescription class="truncate">{{ listing.company }} – {{ listing.title }}</DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-3">
        <Textarea v-model="text" rows="10" placeholder="Vlož sem text e-mailu (stačí zkopírovat celý z pošty)…" class="max-h-[45vh] leading-relaxed" aria-label="Text e-mailu" />
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <Label for="paste-at" class="text-xs text-muted-foreground">Přišel</Label>
            <Input id="paste-at" v-model="at" type="date" class="h-8 w-40" />
          </div>
          <p v-if="cls" class="text-xs text-muted-foreground">Vypadá jako: <span class="font-semibold text-foreground">{{ LABEL[cls] }}</span></p>
        </div>
      </div>
      <DialogFooter class="gap-2">
        <Button variant="ghost" type="button" @click="open = false">Zrušit</Button>
        <Button :variant="next ? 'outline' : 'default'" type="button" :disabled="!title" @click="save(false)">Jen zapsat</Button>
        <Button v-if="next" type="button" @click="save(true)">Zapsat a změnit na <StatusBadge :status="next" class="ml-1" /></Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
