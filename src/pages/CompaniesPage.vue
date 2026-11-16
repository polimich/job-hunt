<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { ArrowUpDownIcon, MailIcon, SearchIcon } from '@lucide/vue';
import CompanyAvatar from '../components/CompanyAvatar.vue';
import FitBadge from '../components/FitBadge.vue';
import PageHeader from '../components/PageHeader.vue';
import SalaryRange from '../components/SalaryRange.vue';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bestEmail, EMAIL_KIND_LABEL } from '../format';
import { db, statusOf } from '../store';

const router = useRouter();
const sort = ref<'name' | 'salary' | 'roles'>('salary');
const query = ref('');

const rows = computed(() => {
  const q = query.value.trim().toLocaleLowerCase('cs');
  const list = db.companies
    .filter((c) => !q || c.name.toLocaleLowerCase('cs').includes(q))
    .map((c) => {
      const roles = db.listings.filter((l) => l.companyId === c.id);
      const open = roles.filter((l) => l.open && statusOf(l) !== 'passed');
      return { company: c, open: open.length, total: roles.length, bestFit: Math.max(0, ...open.map((l) => l.fit)), email: bestEmail(c) };
    });
  return list.sort((a, b) => {
    if (sort.value === 'name') return a.company.name.localeCompare(b.company.name, 'cs');
    if (sort.value === 'roles') return b.open - a.open || b.bestFit - a.bestFit;
    return (b.company.salary?.max ?? 0) - (a.company.salary?.max ?? 0);
  });
});
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 pt-8 pb-16">
    <PageHeader
      title="Firmy"
      description="Odhad mzdy je hrubá měsíční mzda. „Odhad“ je tip podle trhu, ne údaj firmy; „Levels.fyi“, „inzerát“ a „úřad práce“ mají zdroj."
    />

    <div class="flex flex-wrap items-center gap-2">
      <div class="relative min-w-56 flex-1 sm:max-w-xs">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="query" type="search" placeholder="Hledat firmu…" aria-label="Hledat firmu" class="bg-card pl-8" />
      </div>
      <div class="flex-1" />
      <Select v-model="sort">
        <SelectTrigger class="bg-card" aria-label="Řadit"><ArrowUpDownIcon class="text-muted-foreground" /><SelectValue /></SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="salary">Podle odhadu mzdy</SelectItem>
          <SelectItem value="roles">Podle počtu pozic</SelectItem>
          <SelectItem value="name">Podle názvu</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="overflow-hidden rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/40 hover:bg-muted/40">
            <TableHead class="pl-4">Firma</TableHead>
            <TableHead>Odhad mzdy</TableHead>
            <TableHead class="text-right">Otevřené pozice</TableHead>
            <TableHead class="text-center">Nejlepší shoda</TableHead>
            <TableHead class="pr-4">Kontakt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="r in rows"
            :key="r.company.id"
            class="cursor-pointer"
            @click="router.push(`/firmy/${r.company.id}`)"
          >
            <TableCell class="pl-4">
              <RouterLink :to="`/firmy/${r.company.id}`" class="flex items-center gap-3" @click.stop>
                <CompanyAvatar :name="r.company.name" size="sm" />
                <span class="flex flex-col">
                  <span class="font-medium">{{ r.company.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ r.company.size }}</span>
                </span>
              </RouterLink>
            </TableCell>
            <TableCell><SalaryRange :company="r.company" /></TableCell>
            <TableCell class="text-right tabular-nums">
              <span class="font-medium">{{ r.open }}</span>
              <span v-if="r.total !== r.open" class="text-muted-foreground"> / {{ r.total }}</span>
            </TableCell>
            <TableCell class="text-center">
              <FitBadge v-if="r.bestFit" :fit="r.bestFit" size="sm" />
              <span v-else class="text-muted-foreground">–</span>
            </TableCell>
            <TableCell class="pr-4">
              <span v-if="r.email" class="flex items-center gap-2">
                <a :href="`mailto:${r.email.address}`" class="inline-flex items-center gap-1.5 text-primary hover:underline underline-offset-4" @click.stop>
                  <MailIcon class="size-3.5" />{{ r.email.address }}
                </a>
                <Badge variant="outline" class="text-muted-foreground">{{ EMAIL_KIND_LABEL[r.email.kind] }}</Badge>
              </span>
              <span v-else class="text-muted-foreground">jen formulář</span>
            </TableCell>
          </TableRow>
          <TableRow v-if="!rows.length">
            <TableCell colspan="5" class="py-10 text-center text-muted-foreground">Žádná firma neodpovídá hledání.</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
