<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowLeftIcon, FileQuestionIcon, PrinterIcon } from '@lucide/vue';
import { fold } from '../../shared/search';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { db, listingById } from '../store';

/**
 * The CV written for one posting, as a plain one-column page to print or save as PDF (text, not
 * a picture, so application systems can read it). The text can be corrected in place before
 * printing; such corrections are not stored.
 */
const props = defineProps<{ id: string }>();
const cv = computed(() => db.kits[props.id]?.cvDoc);
const listing = computed(() => listingById.value.get(props.id));

const T = computed(() =>
  cv.value?.lang === 'en'
    ? { summary: 'Summary', experience: 'Experience', projects: 'Projects', skills: 'Skills', education: 'Education', languages: 'Languages' }
    : { summary: 'Shrnutí', experience: 'Praxe', projects: 'Projekty', skills: 'Dovednosti', education: 'Vzdělání', languages: 'Jazyky' },
);

// The browser offers the page title as the file name: "prijmeni-cv".
const before = document.title;
const fileName = computed(() => {
  const surname = fold(cv.value?.name.trim().split(/\s+/).pop() ?? '').replace(/[^a-z0-9]+/g, '');
  return `${surname || 'cv'}${surname ? '-cv' : ''}`;
});
onMounted(() => (document.title = fileName.value));
onUnmounted(() => (document.title = before));
const print = () => {
  document.title = fileName.value;
  window.print();
};
const short = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
</script>

<template>
  <div class="mx-auto flex max-w-[230mm] flex-col gap-4 px-4 pt-6 pb-16 print:max-w-none print:p-0">
    <div class="flex flex-wrap items-center gap-2 print:hidden">
      <Button variant="ghost" size="sm" class="-ml-2 text-muted-foreground" as-child>
        <RouterLink :to="`/prihlaska/${encodeURIComponent(id)}`"><ArrowLeftIcon /> Přihláška</RouterLink>
      </Button>
      <p class="min-w-48 flex-1 text-sm text-muted-foreground">
        <template v-if="listing">CV pro {{ listing.company }}. </template>Chybu oprav rovnou v textu (klikni a piš); oprava platí jen do zavření stránky.
      </p>
      <Button v-if="cv" @click="print"><PrinterIcon /> Uložit jako PDF</Button>
    </div>

    <Empty v-if="!cv">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileQuestionIcon /></EmptyMedia>
        <EmptyTitle>CV pro tuhle pozici ještě není</EmptyTitle>
        <EmptyDescription>Vygeneruj ho v kroku 2 na stránce přihlášky.</EmptyDescription>
      </EmptyHeader>
    </Empty>

    <article
      v-else
      contenteditable="plaintext-only"
      spellcheck="false"
      class="cv rounded-lg bg-white p-[14mm] text-[10.5pt] leading-[1.4] text-black shadow-soft outline-none print:rounded-none print:p-0 print:shadow-none"
    >
      <header class="mb-3 border-b border-black/20 pb-2">
        <h1 class="text-[20pt] leading-tight font-bold">{{ cv.name }}</h1>
        <p v-if="cv.headline" class="text-[11.5pt]">{{ cv.headline }}</p>
        <p class="mt-1 text-[9.5pt]">
          <template v-for="(c, i) in cv.contact" :key="c"><template v-if="i"> · </template>{{ c }}</template>
          <template v-for="u in cv.links" :key="u"> · <a :href="u" class="underline">{{ short(u) }}</a></template>
        </p>
      </header>

      <section v-if="cv.summary">
        <h2>{{ T.summary }}</h2>
        <p>{{ cv.summary }}</p>
      </section>

      <section v-if="cv.experience.length">
        <h2>{{ T.experience }}</h2>
        <div v-for="e in cv.experience" :key="e.company + e.period" class="mb-2 break-inside-avoid">
          <p class="flex justify-between gap-4"><span><strong>{{ e.role }}</strong><template v-if="e.company">, {{ e.company }}</template></span><span class="shrink-0 tabular-nums">{{ e.period }}</span></p>
          <ul v-if="e.bullets.length" class="list-disc pl-[5mm]"><li v-for="b in e.bullets" :key="b">{{ b }}</li></ul>
        </div>
      </section>

      <section v-if="cv.projects.length">
        <h2>{{ T.projects }}</h2>
        <p v-for="p in cv.projects" :key="p.name" class="mb-1 break-inside-avoid">
          <strong>{{ p.name }}</strong><template v-if="p.url"> · <a :href="p.url" class="underline">{{ short(p.url) }}</a></template><br />{{ p.text }}
        </p>
      </section>

      <section v-if="cv.skills.length">
        <h2>{{ T.skills }}</h2>
        <p v-for="k in cv.skills" :key="k.label"><strong>{{ k.label }}:</strong> {{ k.items.join(', ') }}</p>
      </section>

      <section v-if="cv.education.length">
        <h2>{{ T.education }}</h2>
        <p v-for="e in cv.education" :key="e.school" class="flex justify-between gap-4"><span><strong>{{ e.school }}</strong><template v-if="e.degree">, {{ e.degree }}</template></span><span class="shrink-0 tabular-nums">{{ e.period }}</span></p>
      </section>

      <section v-if="cv.languages.length">
        <h2>{{ T.languages }}</h2>
        <p>{{ cv.languages.join(' · ') }}</p>
      </section>
    </article>
  </div>
</template>

<style scoped>
.cv {
  font-family: Helvetica, Arial, sans-serif;
}
.cv h1 {
  font-family: inherit;
}
.cv h2 {
  margin: 3.5mm 0 1.2mm;
  font-size: 9.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
</style>
