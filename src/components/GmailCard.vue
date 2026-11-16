<script setup lang="ts">
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { InboxIcon, LoaderCircleIcon, MailIcon, RefreshCwIcon, Trash2Icon, UnplugIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '../format';
import { disconnectGmail, mailStatus, syncMail, wipeMailData } from '../mail';

/** Gmail connection in Settings. It sits inside the settings <form>, so every button is type="button". */
const syncing = ref(false);
const fail = (title: string) => (e: unknown) => toast.error(title, { description: e instanceof Error ? e.message : String(e) });

async function sync() {
  syncing.value = true;
  try {
    const added = await syncMail();
    toast.success(added ? `Načteno ${added} ${added === 1 ? 'nový e-mail' : added < 5 ? 'nové e-maily' : 'nových e-mailů'}` : 'Nic nového');
  } catch (e) {
    fail('Načtení pošty selhalo')(e);
  } finally {
    syncing.value = false;
  }
}

async function disconnect() {
  if (!confirm('Odpojit Gmail? Stažená pošta v aplikaci zůstane, nová se načítat nebude.')) return;
  await disconnectGmail().then(() => toast.success('Gmail odpojen'), fail('Odpojení selhalo'));
}

async function wipe() {
  if (!confirm('Smazat všechnu staženou poštu z aplikace? V Gmailu zůstane. Denní zálohy v data/backups ji drží ještě až 30 dní.')) return;
  await wipeMailData().then(() => toast.success('Stažená pošta smazána'), fail('Smazání selhalo'));
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2"><MailIcon class="size-4 text-muted-foreground" /> Gmail</CardTitle>
      <CardDescription>Odpovědi od firem se samy přiřadí k pozicím a e-maily posíláš přímo odsud i s CV.</CardDescription>
    </CardHeader>

    <!-- Not configured: needs the user's own OAuth client -->
    <CardContent v-if="!mailStatus.configured" class="flex flex-col gap-2 text-sm text-muted-foreground">
      <p>Potřebuješ vlastní přihlašovací klíč od Googlu (zdarma, ~15 min). Postup je v README v sekci Gmail.</p>
      <p>
        Pak do souboru <code class="rounded bg-muted px-1 font-mono text-xs">.env</code> doplň
        <code class="rounded bg-muted px-1 font-mono text-xs">GOOGLE_CLIENT_ID</code> a
        <code class="rounded bg-muted px-1 font-mono text-xs">GOOGLE_CLIENT_SECRET</code>, pak restartuj server.
      </p>
    </CardContent>

    <!-- Configured, not connected -->
    <CardContent v-else-if="!mailStatus.connected" class="flex flex-col items-start gap-3">
      <p class="text-sm text-muted-foreground">
        Aplikace bude číst jen poštu od náborových systémů a firem, se kterými jsi v kontaktu, a e-maily se štítkem job-hunt. Posílá jen to, co odešleš tady.
      </p>
      <Button as="a" href="/api/mail/connect" type="button"><MailIcon /> Připojit Gmail</Button>
      <p v-if="mailStatus.error" class="text-xs text-destructive">{{ mailStatus.error }}</p>
    </CardContent>

    <!-- Connected -->
    <CardContent v-else class="flex flex-col gap-3">
      <div class="flex flex-col gap-0.5 text-sm">
        <p class="font-medium">{{ mailStatus.email }}</p>
        <p class="text-xs text-muted-foreground">
          <template v-if="mailStatus.syncing">Načítám poštu…</template>
          <template v-else-if="mailStatus.lastSyncAt">Naposledy načteno {{ formatDateTime(mailStatus.lastSyncAt) }}</template>
          <template v-else>Zatím nenačteno</template>
        </p>
        <p v-if="mailStatus.error" class="text-xs text-destructive">{{ mailStatus.error }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" type="button" :disabled="syncing || mailStatus.syncing" @click="sync">
          <LoaderCircleIcon v-if="syncing || mailStatus.syncing" class="animate-spin" /><RefreshCwIcon v-else /> Načíst poštu
        </Button>
        <Button variant="ghost" type="button" @click="disconnect"><UnplugIcon /> Odpojit</Button>
        <Button variant="ghost" type="button" class="hover:text-destructive" @click="wipe"><Trash2Icon /> Smazat staženou poštu</Button>
      </div>
      <p class="flex items-start gap-1.5 text-xs text-muted-foreground">
        <InboxIcon class="mt-px size-3.5 shrink-0" />
        <span>Tip: Štítek <span class="font-medium text-foreground">job-hunt</span> v Gmailu přidá do aplikace i e-mail, který by sama nepoznala.</span>
      </p>
    </CardContent>
  </Card>
</template>
