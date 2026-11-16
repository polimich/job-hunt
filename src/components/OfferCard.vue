<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { ArrowRightIcon, HandshakeIcon } from '@lucide/vue';
import { daysBetween, emptyOffer } from '../../shared/pipeline';
import type { Offer } from '../../shared/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { days } from '../format';
import { companyById, db, listingById, offers, setState, stateOf, todayIso } from '../store';

/** The details of an offer, saved field by field. */
const props = defineProps<{ id: string }>();
const offer = computed<Offer>(() => ({ ...emptyOffer(), ...stateOf(props.id).offer }));
const estimate = computed(() => companyById.value.get(listingById.value.get(props.id)?.companyId ?? '')?.salary);
const left = computed(() => (offer.value.deadline ? daysBetween(todayIso.value, offer.value.deadline) : null));

function save<K extends keyof Offer>(key: K, raw: string) {
  const value = (typeof emptyOffer()[key] === 'number' ? Number(raw.replace(/\s/g, '')) || 0 : raw) as Offer[K];
  if (value === offer.value[key]) return;
  setState(props.id, { offer: { [key]: value } }).catch((e: unknown) =>
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) }),
  );
}
const val = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<template>
  <section class="rounded-2xl border border-(--st-offer-dot)/30 bg-(--st-offer-bg)/50 p-4 shadow-soft">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 font-display text-base font-bold text-(--st-offer-fg)"><HandshakeIcon class="size-4" /> Nabídka</h3>
      <span v-if="left !== null" :class="cn('rounded-full px-2 py-0.5 text-xs font-bold', left <= 2 ? 'bg-destructive text-white' : 'bg-card text-(--st-offer-fg)')">
        {{ left < 0 ? 'termín odpovědi prošel' : left === 0 ? 'odpovědět dnes' : `na odpověď ${days(left)}` }}
      </span>
      <RouterLink v-if="offers.length > 1" to="/nabidky" class="inline-flex items-center gap-1 text-xs font-semibold text-(--st-offer-fg) hover:underline underline-offset-4">
        Porovnat {{ offers.length }} {{ offers.length < 5 ? "nabídky" : "nabídek" }} <ArrowRightIcon class="size-3.5" />
      </RouterLink>
    </div>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="flex flex-col gap-1.5">
        <Label :for="`of-sal-${id}`" class="text-xs">Hrubá mzda / měsíc</Label>
        <div class="relative">
          <Input :id="`of-sal-${id}`" :model-value="offer.salary || ''" inputmode="numeric" placeholder="např. 95000" class="h-8 bg-card pr-9 tabular-nums" @change="save('salary', val($event))" />
          <span class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">Kč</span>
        </div>
        <p v-if="estimate && offer.salary" class="text-[11px] text-muted-foreground">
          Odhad firmy {{ Math.round(estimate.min / 1000) }}–{{ Math.round(estimate.max / 1000) }} tis.
          <template v-if="db.settings.minSalary && offer.salary < db.settings.minSalary"> · <span class="font-semibold text-destructive">pod tvým minimem</span></template>
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label :for="`of-bonus-${id}`" class="text-xs">Bonusy</Label>
        <Input :id="`of-bonus-${id}`" :model-value="offer.bonus" placeholder="13. plat, akcie…" class="h-8 bg-card" @change="save('bonus', val($event))" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label :for="`of-remote-${id}`" class="text-xs">Home office</Label>
        <Input :id="`of-remote-${id}`" :model-value="offer.remote" placeholder="2 dny / full remote" class="h-8 bg-card" @change="save('remote', val($event))" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label :for="`of-vac-${id}`" class="text-xs">Dovolená (dní)</Label>
        <Input :id="`of-vac-${id}`" :model-value="offer.vacation || ''" inputmode="numeric" placeholder="25" class="h-8 bg-card tabular-nums" @change="save('vacation', val($event))" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label :for="`of-contract-${id}`" class="text-xs">Smlouva</Label>
        <Input :id="`of-contract-${id}`" :model-value="offer.contract" placeholder="HPP / IČO" class="h-8 bg-card" @change="save('contract', val($event))" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label :for="`of-start-${id}`" class="text-xs">Nástup</Label>
        <Input :id="`of-start-${id}`" :model-value="offer.start" type="date" class="h-8 bg-card" @change="save('start', val($event))" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label :for="`of-dl-${id}`" class="text-xs">Odpovědět do</Label>
        <Input :id="`of-dl-${id}`" :model-value="offer.deadline" type="date" class="h-8 bg-card" @change="save('deadline', val($event))" />
      </div>
      <div class="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
        <Label :for="`of-note-${id}`" class="text-xs">Poznámka</Label>
        <Textarea :id="`of-note-${id}`" :model-value="offer.note" rows="2" placeholder="Co se mi líbí, co ne, na co se ještě zeptat…" class="min-h-14 bg-card" @change="save('note', val($event))" />
      </div>
    </div>
  </section>
</template>
