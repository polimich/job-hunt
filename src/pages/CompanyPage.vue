<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { ArrowLeftIcon, Building2Icon, ExternalLinkIcon, MailIcon, NotebookPenIcon, TriangleAlertIcon, WalletIcon } from '@lucide/vue';
import CompanyAvatar from '../components/CompanyAvatar.vue';
import FitBadge from '../components/FitBadge.vue';
import SalaryRange from '../components/SalaryRange.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EMAIL_KIND_LABEL, formatDate, PLACE_LABEL } from '../format';
import { companyById, db, statusOf } from '../store';

const props = defineProps<{ id: string }>();
const router = useRouter();
const company = computed(() => companyById.value.get(props.id));
const roles = computed(() => db.listings.filter((l) => l.companyId === props.id).sort((a, b) => Number(b.open) - Number(a.open) || b.fit - a.fit));
const openCount = computed(() => roles.value.filter((l) => l.open).length);
const notes = computed(() => roles.value.filter((l) => db.state[l.id]?.note));
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 pt-6 pb-16">
    <Button as-child variant="ghost" size="sm" class="-ml-2 w-fit text-muted-foreground">
      <RouterLink to="/firmy"><ArrowLeftIcon /> Všechny firmy</RouterLink>
    </Button>

    <template v-if="company">
      <header class="flex items-center gap-4">
        <CompanyAvatar :name="company.name" size="lg" />
        <div class="flex flex-col gap-1">
          <h1 class="text-2xl font-semibold tracking-tight">{{ company.name }}</h1>
          <p class="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2Icon class="size-3.5" /> Firma {{ company.size }} · {{ openCount }} {{ openCount === 1 ? 'otevřená pozice' : openCount >= 2 && openCount <= 4 ? 'otevřené pozice' : 'otevřených pozic' }}
          </p>
        </div>
      </header>

      <div class="grid gap-4 md:grid-cols-2">
        <section class="flex flex-col gap-2 rounded-2xl border bg-card shadow-soft p-5">
          <h3 class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><WalletIcon class="size-3.5" /> Odhad mzdy</h3>
          <p class="text-xl"><SalaryRange :company="company" /></p>
          <p v-if="company.salary?.note" class="text-sm text-muted-foreground">{{ company.salary.note }}</p>
          <p v-if="company.salary?.basis === 'odhad'" class="text-xs text-muted-foreground">Tip podle trhu a typu firmy, ne údaj firmy. Ověř u recruitera.</p>
          <p v-if="company.salary && company.salary.max < db.settings.minSalary" class="mt-1 flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-destructive">
            <TriangleAlertIcon class="size-3.5" /> Horní mez je pod tvým minimem {{ Math.round(db.settings.minSalary / 1000) }} tis. Kč.
          </p>
        </section>
        <section class="flex flex-col gap-2 rounded-2xl border bg-card shadow-soft p-5">
          <h3 class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><MailIcon class="size-3.5" /> Kontakty</h3>
          <template v-if="company.emails.length">
            <p v-for="e in company.emails" :key="e.address" class="flex flex-wrap items-center gap-2 text-sm">
              <a :href="`mailto:${e.address}`" class="font-medium text-primary hover:underline underline-offset-4">{{ e.address }}</a>
              <Badge variant="outline" class="text-muted-foreground">{{ EMAIL_KIND_LABEL[e.kind] }}</Badge>
              <span v-if="e.note" class="text-xs text-muted-foreground">{{ e.note }}</span>
            </p>
          </template>
          <p v-else class="text-sm text-muted-foreground">Veřejný e-mail nenalezen. Firma bere přihlášky formulářem u inzerátu; oslovit jde recruitera na LinkedInu.</p>
        </section>
      </div>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold">Pozice <span class="font-normal text-muted-foreground">{{ roles.length }}</span></h2>
        <div class="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow class="bg-muted/40 hover:bg-muted/40">
                <TableHead class="w-14 pl-4">Shoda</TableHead>
                <TableHead>Pozice</TableHead>
                <TableHead>Místo</TableHead>
                <TableHead>Stav</TableHead>
                <TableHead>Osloveno</TableHead>
                <TableHead class="w-10 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="l in roles" :key="l.id" class="cursor-pointer" :class="{ 'opacity-55': !l.open }" @click="router.push(`/pozice/${l.id}`)">
                <TableCell class="pl-4"><FitBadge :fit="l.fit" :auto="l.fitSource === 'auto'" size="sm" /></TableCell>
                <TableCell class="max-w-sm whitespace-normal">
                  <RouterLink :to="`/pozice/${l.id}`" class="font-medium hover:underline underline-offset-4" @click.stop>{{ l.title }}</RouterLink>
                  <div class="truncate text-xs text-muted-foreground">{{ l.stack }}</div>
                </TableCell>
                <TableCell>{{ PLACE_LABEL[l.place] }}<div class="text-xs text-muted-foreground">{{ l.mode }}</div></TableCell>
                <TableCell><StatusBadge :status="statusOf(l)" /></TableCell>
                <TableCell class="tabular-nums text-muted-foreground">{{ formatDate(db.state[l.id]?.contactedAt ?? '') || '–' }}</TableCell>
                <TableCell class="pr-4">
                  <Button as="a" :href="l.url" target="_blank" rel="noopener noreferrer" variant="ghost" size="icon-sm" aria-label="Otevřít inzerát" @click.stop>
                    <ExternalLinkIcon />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <section v-if="notes.length" class="flex flex-col gap-3 rounded-2xl border bg-card shadow-soft p-5">
        <h3 class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><NotebookPenIcon class="size-3.5" /> Tvoje poznámky</h3>
        <p v-for="l in notes" :key="l.id" class="text-sm"><span class="font-medium">{{ l.title }}:</span> {{ db.state[l.id]?.note }}</p>
      </section>
    </template>

    <Empty v-else>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Building2Icon /></EmptyMedia>
        <EmptyTitle>Tuhle firmu v seznamu nemám</EmptyTitle>
      </EmptyHeader>
    </Empty>
  </div>
</template>
