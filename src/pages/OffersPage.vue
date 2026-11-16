<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { HandshakeIcon, TrophyIcon } from '@lucide/vue';
import { daysBetween, emptyOffer } from '../../shared/pipeline';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import CompanyAvatar from '../components/CompanyAvatar.vue';
import PageHeader from '../components/PageHeader.vue';
import RatingStars from '../components/RatingStars.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { days, formatDate, salaryRange } from '../format';
import { companyById, db, offers, statusOf, todayIso } from '../store';

/** Offers side by side: one column per offer, one row per thing worth comparing. */
const cols = computed(() =>
  offers.value
    .map((l) => ({ l, o: { ...emptyOffer(), ...db.state[l.id]?.offer }, st: db.state[l.id]! }))
    .sort((a, b) => b.o.salary - a.o.salary),
);
const bestSalary = computed(() => Math.max(0, ...cols.value.map((c) => c.o.salary)));
const bestVacation = computed(() => Math.max(0, ...cols.value.map((c) => c.o.vacation)));
const thousands = (n: number) => (n ? `${n.toLocaleString('cs-CZ')} Kč` : '–');
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6 lg:px-10">
    <PageHeader title="Nabídky" description="Nabídky vedle sebe. Doplníš je v detailu pozice, jakmile je ve stavu Nabídka." />

    <Empty v-if="!cols.length" class="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><HandshakeIcon /></EmptyMedia>
        <EmptyTitle>Zatím žádná nabídka</EmptyTitle>
        <EmptyDescription>Až nějakou pozici posuneš do stavu Nabídka, objeví se tady a půjde porovnat.</EmptyDescription>
      </EmptyHeader>
    </Empty>

    <div v-else class="overflow-x-auto rounded-2xl border bg-card shadow-soft scrollbar-thin">
      <table class="w-full min-w-[640px] text-sm">
        <thead>
          <tr class="border-b">
            <th class="w-40 p-4" />
            <th v-for="c in cols" :key="c.l.id" class="p-4 text-left align-top">
              <RouterLink :to="`/pozice/${c.l.id}`" class="group flex items-start gap-3">
                <CompanyAvatar :name="c.l.company" />
                <span class="min-w-0">
                  <span class="block font-display text-base font-bold group-hover:underline underline-offset-4">{{ c.l.company }}</span>
                  <span class="block text-xs font-normal text-muted-foreground">{{ c.l.title }}</span>
                  <StatusBadge :status="statusOf(c.l)" class="mt-1.5" />
                </span>
              </RouterLink>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr>
            <th class="p-4 text-left text-xs font-medium text-muted-foreground">Hrubá mzda</th>
            <td v-for="c in cols" :key="c.l.id" class="p-4">
              <span :class="cn('inline-flex items-center gap-1.5 font-display text-lg font-bold tabular-nums', c.o.salary && c.o.salary === bestSalary && cols.length > 1 && 'text-(--st-interview-fg)')">
                <TrophyIcon v-if="c.o.salary && c.o.salary === bestSalary && cols.length > 1" class="size-4" />
                {{ thousands(c.o.salary) }}
              </span>
              <span v-if="companyById.get(c.l.companyId)?.salary" class="block text-xs text-muted-foreground">odhad {{ salaryRange(companyById.get(c.l.companyId)?.salary) }}</span>
            </td>
          </tr>
          <tr>
            <th class="p-4 text-left text-xs font-medium text-muted-foreground">Bonusy</th>
            <td v-for="c in cols" :key="c.l.id" class="p-4">{{ c.o.bonus || '–' }}</td>
          </tr>
          <tr>
            <th class="p-4 text-left text-xs font-medium text-muted-foreground">Home office</th>
            <td v-for="c in cols" :key="c.l.id" class="p-4">{{ c.o.remote || (c.l.mode !== 'neuvedeno' && c.l.mode) || '–' }}</td>
          </tr>
          <tr>
            <th class="p-4 text-left text-xs font-medium text-muted-foreground">Dovolená</th>
            <td v-for="c in cols" :key="c.l.id" :class="cn('p-4 tabular-nums', c.o.vacation && c.o.vacation === bestVacation && cols.length > 1 && 'font-semibold text-(--st-interview-fg)')">
              {{ c.o.vacation ? `${c.o.vacation} dní` : '–' }}
            </td>
          </tr>
          <tr>
            <th class="p-4 text-left text-xs font-medium text-muted-foreground">Smlouva</th>
            <td v-for="c in cols" :key="c.l.id" class="p-4">{{ c.o.contract || (c.l.contract !== 'neuvedeno' && c.l.contract) || '–' }}</td>
          </tr>
          <tr>
            <th class="p-4 text-left text-xs font-medium text-muted-foreground">Nástup</th>
            <td v-for="c in cols" :key="c.l.id" class="p-4 tabular-nums">{{ formatDate(c.o.start) || '–' }}</td>
          </tr>
          <tr>
            <th class="p-4 text-left text-xs font-medium text-muted-foreground">Odpovědět do</th>
            <td v-for="c in cols" :key="c.l.id" class="p-4 tabular-nums">
              <template v-if="c.o.deadline">
                {{ formatDate(c.o.deadline) }}
                <span :class="cn('block text-xs', daysBetween(todayIso, c.o.deadline) <= 2 ? 'font-semibold text-destructive' : 'text-muted-foreground')">
                  {{ daysBetween(todayIso, c.o.deadline) < 0 ? 'prošlo' : `za ${days(daysBetween(todayIso, c.o.deadline))}` }}
                </span>
              </template>
              <template v-else>–</template>
            </td>
          </tr>
          <tr>
            <th class="p-4 text-left text-xs font-medium text-muted-foreground">Jak moc chci</th>
            <td v-for="c in cols" :key="c.l.id" class="p-4"><RatingStars :model-value="c.st.rating ?? 0" readonly /></td>
          </tr>
          <tr>
            <th class="p-4 text-left text-xs font-medium text-muted-foreground">Poznámka</th>
            <td v-for="c in cols" :key="c.l.id" class="p-4 align-top text-muted-foreground whitespace-pre-wrap">{{ c.o.note || '–' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
