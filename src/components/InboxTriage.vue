<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { CheckIcon, ExternalLinkIcon, EyeOffIcon, InboxIcon, UserXIcon, XIcon } from '@lucide/vue';
import { ENDINGS } from '../../shared/pipeline';
import type { Listing, MailMessage, MailSuggestion } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '../format';
import { acceptSuggestion, assignMessage, dismissSuggestion, gmailUrl, ignoreMessage, triage } from '../mail';
import { db, listingById, statusOf } from '../store';
import StatusBadge from './StatusBadge.vue';

/** What the mail sync could not decide alone: status changes to confirm and mail without a listing. */
const LIMIT = 5;
const showAll = ref(false);

type Item = { type: 'suggestion'; s: MailSuggestion & { message: MailMessage } } | { type: 'unmatched'; m: MailMessage };
const items = computed<Item[]>(() => [
  ...triage.value.suggestions.map((s) => ({ type: 'suggestion' as const, s })),
  ...triage.value.unmatched.map((m) => ({ type: 'unmatched' as const, m })),
]);
const shown = computed(() => (showAll.value ? items.value : items.value.slice(0, LIMIT)));

const label = (l: Listing | undefined) => (l ? `${l.company} – ${l.title}` : 'neznámá pozice');

// Listings still in play first, then the finished ones; each group by company.
const options = computed(() => {
  const active = (l: Listing) => l.open && !ENDINGS.includes(statusOf(l));
  const byName = (a: Listing, b: Listing) => label(a).localeCompare(label(b), 'cs');
  return {
    active: db.listings.filter(active).sort(byName),
    rest: db.listings.filter((l) => !active(l)).sort(byName),
  };
});
const picked = ref<Record<string, string>>({});

const busy = ref(new Set<string>());
async function act(id: string, p: () => Promise<unknown>, message?: string, description?: string) {
  busy.value = new Set(busy.value).add(id);
  try {
    await p();
    if (message) toast.success(message, description ? { description } : undefined);
  } catch (e) {
    toast.error('Nepovedlo se', { description: e instanceof Error ? e.message : String(e) });
  } finally {
    const s = new Set(busy.value);
    s.delete(id);
    busy.value = s;
  }
}

const accept = (s: MailSuggestion) =>
  act(s.id, () => acceptSuggestion(s.id), 'Stav změněn', s.status === 'interview' ? 'Doplň termín pohovoru v historii' : undefined);
const assign = (m: MailMessage, listingId: string | null | undefined) => listingId && act(m.id, () => assignMessage(m.id, listingId), 'Přiřazeno');
</script>

<template>
  <section v-if="items.length" class="flex flex-col gap-2">
    <h2 class="flex items-center gap-2 text-lg font-bold">
      <InboxIcon class="size-5 text-primary" /> Z pošty
      <span class="text-sm font-medium text-muted-foreground tabular-nums">{{ items.length }}</span>
    </h2>

    <ul class="divide-y overflow-hidden rounded-2xl border bg-card">
      <li v-for="x in shown" :key="x.type === 'suggestion' ? x.s.id : x.m.id" class="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center">
        <!-- Suggested status change -->
        <template v-if="x.type === 'suggestion'">
          <RouterLink :to="`/pozice/${x.s.listingId}`" class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-center gap-2 text-sm">
              <span class="truncate font-medium">{{ label(listingById.get(x.s.listingId)) }}</span>
              <StatusBadge :status="x.s.status" />
            </span>
            <span class="truncate text-xs text-muted-foreground">
              {{ x.s.message.fromName || x.s.message.from }} · {{ x.s.message.subject }}
            </span>
          </RouterLink>
          <div class="flex shrink-0 items-center gap-1.5">
            <Button size="sm" :disabled="busy.has(x.s.id)" @click="accept(x.s)"><CheckIcon /> Potvrdit</Button>
            <Button size="sm" variant="ghost" class="text-muted-foreground" :disabled="busy.has(x.s.id)" @click="act(x.s.id, () => dismissSuggestion(x.s.id))"><XIcon /> Zahodit</Button>
          </div>
        </template>

        <!-- Mail without a listing -->
        <template v-else>
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-center gap-2 text-xs text-muted-foreground">
              <span class="truncate font-medium text-foreground">{{ x.m.fromName || x.m.from }}</span>
              <span class="shrink-0 tabular-nums">{{ formatDateTime(x.m.sentAt) }}</span>
              <a :href="gmailUrl(x.m)" target="_blank" rel="noopener noreferrer" class="shrink-0 hover:text-foreground" aria-label="Otevřít v Gmailu" title="Otevřít v Gmailu"><ExternalLinkIcon class="size-3" /></a>
            </span>
            <span class="truncate text-sm">{{ x.m.subject || '(bez předmětu)' }}</span>
            <span class="truncate text-xs text-muted-foreground">{{ x.m.snippet }}</span>
            <div class="mt-1 flex flex-wrap items-center gap-1.5">
              <template v-if="x.m.listingId && listingById.get(x.m.listingId)">
                <span class="min-w-0 truncate text-xs">Patří k: <span class="font-medium">{{ label(listingById.get(x.m.listingId)) }}</span>?</span>
                <Button size="xs" variant="outline" :disabled="busy.has(x.m.id)" @click="assign(x.m, x.m.listingId)"><CheckIcon /> Ano</Button>
              </template>
              <template v-else>
                <select
                  v-model="picked[x.m.id]"
                  aria-label="Pozice"
                  class="h-6 max-w-64 min-w-0 flex-1 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  <option :value="undefined" disabled>Vyber pozici…</option>
                  <optgroup label="Rozjednané a otevřené">
                    <option v-for="l in options.active" :key="l.id" :value="l.id">{{ label(l) }}</option>
                  </optgroup>
                  <optgroup v-if="options.rest.length" label="Ostatní">
                    <option v-for="l in options.rest" :key="l.id" :value="l.id">{{ label(l) }}</option>
                  </optgroup>
                </select>
                <Button size="xs" variant="outline" :disabled="!picked[x.m.id] || busy.has(x.m.id)" @click="assign(x.m, picked[x.m.id])">Přiřadit</Button>
              </template>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-0.5 sm:flex-col sm:items-end">
            <Button size="xs" variant="ghost" class="text-muted-foreground" :disabled="busy.has(x.m.id)" @click="act(x.m.id, () => ignoreMessage(x.m.id))"><EyeOffIcon /> Skrýt</Button>
            <Button size="xs" variant="ghost" class="text-muted-foreground" :disabled="busy.has(x.m.id)" @click="act(x.m.id, () => ignoreMessage(x.m.id, true), 'Odesílatel skrytý')"><UserXIcon /> Skrýt odesílatele</Button>
          </div>
        </template>
      </li>
    </ul>
    <Button v-if="items.length > LIMIT" size="sm" variant="ghost" class="self-start text-muted-foreground" @click="showAll = !showAll">
      {{ showAll ? 'Zobrazit méně' : `Zobrazit vše (${items.length})` }}
    </Button>
  </section>
</template>
