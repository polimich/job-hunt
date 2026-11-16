<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { ArrowDownLeftIcon, ArrowUpRightIcon, ExternalLinkIcon, InboxIcon, LoaderCircleIcon, MailIcon, PaperclipIcon, RefreshCwIcon, ReplyIcon } from '@lucide/vue';
import type { MailClass, MailMessage } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateTime } from '../format';
import { attachmentUrl, gmailUrl, mailStatus, messagesOf, syncMail } from '../mail';

/** E-mails linked to one listing, newest first. `refresh` bumps when the parent sent something. */
const props = defineProps<{ listingId: string; refresh?: number }>();
const emit = defineEmits<{ reply: [message: MailMessage] }>();

const messages = ref<MailMessage[]>([]);
const loading = ref(false);
const syncing = ref(false);
const expanded = ref(new Set<string>());

async function reload() {
  loading.value = true;
  try {
    const list = await messagesOf(props.listingId);
    messages.value = [...list].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  } catch {
    // Not connected or the server is down: the block simply stays empty.
    messages.value = [];
  } finally {
    loading.value = false;
  }
}
// A finished sync (here, in Settings or the background poll) moves lastSyncAt and may bring new mail.
watch(() => [props.listingId, props.refresh, mailStatus.value.lastSyncAt], () => void reload(), { immediate: true });
watch(() => props.listingId, () => (expanded.value = new Set()));

function toggle(id: string) {
  const s = new Set(expanded.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expanded.value = s;
}

async function sync() {
  syncing.value = true;
  try {
    const added = await syncMail();
    toast.success(added ? `Načteno ${added} ${added === 1 ? 'nový e-mail' : added < 5 ? 'nové e-maily' : 'nových e-mailů'}` : 'Nic nového');
  } catch (e) {
    toast.error('Načtení pošty selhalo', { description: e instanceof Error ? e.message : String(e) });
  } finally {
    syncing.value = false;
  }
}

// Each class borrows the colour of the status it hints at.
const CLASS: Partial<Record<MailClass, { label: string; tone: string }>> = {
  receipt: { label: 'potvrzení', tone: 'bg-(--st-applied-bg) text-(--st-applied-fg)' },
  rejection: { label: 'zamítnutí', tone: 'bg-(--st-rejected-bg) text-(--st-rejected-fg)' },
  invite: { label: 'pozvánka', tone: 'bg-(--st-interview-bg) text-(--st-interview-fg)' },
  offer: { label: 'nabídka', tone: 'bg-(--st-offer-bg) text-(--st-offer-fg)' },
  assignment: { label: 'úkol', tone: 'bg-(--st-talking-bg) text-(--st-talking-fg)' },
  reply: { label: 'odpověď', tone: 'bg-(--st-talking-bg) text-(--st-talking-fg)' },
  notification: { label: 'upozornění', tone: 'bg-muted text-muted-foreground' },
};

const visible = computed(() => mailStatus.value.connected || messages.value.length > 0);
</script>

<template>
  <section v-if="visible" class="flex flex-col gap-2.5">
    <div class="flex items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <MailIcon class="size-3.5" /> E-maily
        <span v-if="messages.length" class="tabular-nums normal-case">{{ messages.length }}</span>
      </h3>
      <Button v-if="mailStatus.connected" size="sm" variant="ghost" :disabled="syncing" @click="sync">
        <LoaderCircleIcon v-if="syncing" class="animate-spin" /><RefreshCwIcon v-else /> Načíst poštu
      </Button>
    </div>

    <p v-if="!messages.length && !loading" class="flex items-center gap-2 rounded-2xl border border-dashed bg-card/60 p-3.5 text-sm text-muted-foreground">
      <InboxIcon class="size-4 shrink-0" /> Zatím žádný e-mail k téhle pozici.
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li v-for="m in messages" :key="m.id" class="rounded-2xl border bg-card">
        <button type="button" class="flex w-full items-start gap-3 p-3 text-left" :aria-expanded="expanded.has(m.id)" @click="toggle(m.id)">
          <span
            :class="cn(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
              m.direction === 'in' ? 'bg-(--st-talking-bg) text-(--st-talking-fg)' : 'bg-muted text-muted-foreground',
            )"
            :title="m.direction === 'in' ? 'Přijatý' : 'Odeslaný'"
          >
            <ArrowDownLeftIcon v-if="m.direction === 'in'" class="size-3.5" /><ArrowUpRightIcon v-else class="size-3.5" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-center gap-2 text-xs text-muted-foreground">
              <span class="truncate font-medium text-foreground">{{ m.direction === 'out' ? 'Já' : m.fromName || m.from }}</span>
              <span v-if="m.direction === 'in' && CLASS[m.cls]" :class="cn('shrink-0 rounded-full px-1.5 text-[10px] font-semibold', CLASS[m.cls]!.tone)">{{ CLASS[m.cls]!.label }}</span>
              <span class="flex-1" />
              <span class="shrink-0 tabular-nums">{{ formatDateTime(m.sentAt) }}</span>
            </span>
            <span class="truncate text-sm font-medium">{{ m.subject || '(bez předmětu)' }}</span>
            <span v-if="!expanded.has(m.id)" class="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{{ m.snippet }}</span>
          </span>
        </button>

        <div v-if="expanded.has(m.id)" class="flex flex-col gap-2.5 px-3 pb-3 sm:pl-13">
          <div class="max-h-96 overflow-y-auto rounded-xl bg-muted/50 p-3 text-sm leading-relaxed whitespace-pre-wrap scrollbar-thin [overflow-wrap:anywhere]">{{ m.body || m.snippet }}</div>
        </div>

        <div v-if="m.attachments.length || m.direction === 'in'" class="flex flex-wrap items-center gap-1.5 px-3 pb-3 sm:pl-13">
          <template v-for="a in m.attachments" :key="a.fileName">
            <a
              v-if="a.attachmentId"
              :href="attachmentUrl(m.id, a.attachmentId)"
              target="_blank"
              class="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium text-muted-foreground hover:border-foreground/20 hover:text-foreground"
            ><PaperclipIcon class="size-3" /> {{ a.fileName }}</a>
            <span v-else class="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium text-muted-foreground"><PaperclipIcon class="size-3" /> {{ a.fileName }}</span>
          </template>
          <template v-if="m.direction === 'in'">
            <span class="flex-1" />
            <Button size="xs" variant="ghost" @click="emit('reply', m)"><ReplyIcon /> Odpovědět</Button>
            <Button as="a" :href="gmailUrl(m)" target="_blank" rel="noopener noreferrer" size="xs" variant="ghost" class="text-muted-foreground"><ExternalLinkIcon /> Otevřít v Gmailu</Button>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>
