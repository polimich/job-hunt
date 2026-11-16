<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { toast } from 'vue-sonner';
import { ExternalLinkIcon, MailIcon, PencilIcon, PhoneIcon, Trash2Icon, UserPlusIcon, UsersIcon } from '@lucide/vue';
import type { Contact } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { contactsOf, deleteContact, saveContact } from '../store';
import CompanyAvatar from './CompanyAvatar.vue';

/** People at one company: recruiters, hiring managers, the person who referred me. */
const props = defineProps<{ companyId: string; companyName: string }>();
const people = computed(() => contactsOf(props.companyId));

const open = ref(false);
const editing = ref<string>();
const blank = () => ({ name: '', role: '', email: '', phone: '', linkedin: '', note: '' });
const fields = reactive(blank());

function edit(c?: Contact) {
  editing.value = c?.id;
  Object.assign(fields, c ? { name: c.name, role: c.role, email: c.email, phone: c.phone, linkedin: c.linkedin, note: c.note } : blank());
  open.value = true;
}

async function save() {
  if (!fields.name.trim()) return;
  try {
    await saveContact({ ...fields, id: editing.value, companyId: props.companyId });
    open.value = false;
    toast.success(editing.value ? 'Kontakt upraven' : 'Kontakt přidán');
  } catch (e) {
    toast.error('Uložení selhalo', { description: e instanceof Error ? e.message : String(e) });
  }
}

async function remove(c: Contact) {
  if (!confirm(`Smazat kontakt ${c.name}?`)) return;
  try {
    await deleteContact(c.id);
  } catch (e) {
    toast.error('Smazání selhalo', { description: e instanceof Error ? e.message : String(e) });
  }
}

const linkedinUrl = (v: string) => (/^https?:\/\//.test(v) ? v : `https://www.linkedin.com/in/${v.replace(/^@/, '')}`);
</script>

<template>
  <section class="flex flex-col gap-2.5">
    <div class="flex items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"><UsersIcon class="size-3.5" /> Lidé ve firmě</h3>
      <Button size="sm" variant="ghost" @click="edit()"><UserPlusIcon /> Přidat</Button>
    </div>

    <p v-if="!people.length" class="rounded-2xl border border-dashed bg-card/60 p-3.5 text-sm text-muted-foreground">
      Zatím nikoho. Přidej recruitera, budoucího šéfa nebo toho, kdo tě doporučil, ať víš, komu psát.
    </p>
    <TransitionGroup v-else name="list" tag="ul" class="relative grid gap-2 sm:grid-cols-2">
      <li v-for="c in people" :key="c.id" class="group flex gap-3 rounded-2xl border bg-card p-3">
        <CompanyAvatar :name="c.name" size="sm" class="mt-0.5 size-9! rounded-xl!" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{{ c.name }}</p>
          <p v-if="c.role" class="truncate text-xs text-muted-foreground">{{ c.role }}</p>
          <div class="mt-1.5 flex flex-wrap gap-1">
            <Button v-if="c.email" as="a" :href="`mailto:${c.email}`" size="icon-xs" variant="outline" :aria-label="`E-mail ${c.email}`" :title="c.email"><MailIcon /></Button>
            <Button v-if="c.phone" as="a" :href="`tel:${c.phone.replace(/\s/g, '')}`" size="icon-xs" variant="outline" :aria-label="`Telefon ${c.phone}`" :title="c.phone"><PhoneIcon /></Button>
            <Button v-if="c.linkedin" as="a" :href="linkedinUrl(c.linkedin)" target="_blank" rel="noopener noreferrer" size="icon-xs" variant="outline" aria-label="LinkedIn" title="LinkedIn"><ExternalLinkIcon /></Button>
          </div>
          <p v-if="c.note" class="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{{ c.note }}</p>
        </div>
        <div class="flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button size="icon-xs" variant="ghost" :aria-label="`Upravit ${c.name}`" @click="edit(c)"><PencilIcon /></Button>
          <Button size="icon-xs" variant="ghost" :aria-label="`Smazat ${c.name}`" class="hover:text-destructive" @click="remove(c)"><Trash2Icon /></Button>
        </div>
      </li>
    </TransitionGroup>

    <Dialog v-model:open="open">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ editing ? 'Upravit kontakt' : 'Nový kontakt' }}</DialogTitle>
          <DialogDescription>{{ companyName }}</DialogDescription>
        </DialogHeader>
        <form id="contact-form" class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
          <div class="flex flex-col gap-1.5"><Label for="ct-name">Jméno *</Label><Input id="ct-name" v-model="fields.name" required placeholder="Jana Nováková" /></div>
          <div class="flex flex-col gap-1.5"><Label for="ct-role">Role</Label><Input id="ct-role" v-model="fields.role" placeholder="Recruiter, CTO…" /></div>
          <div class="flex flex-col gap-1.5"><Label for="ct-email">E-mail</Label><Input id="ct-email" v-model="fields.email" type="email" /></div>
          <div class="flex flex-col gap-1.5"><Label for="ct-phone">Telefon</Label><Input id="ct-phone" v-model="fields.phone" type="tel" /></div>
          <div class="flex flex-col gap-1.5 sm:col-span-2"><Label for="ct-li">LinkedIn</Label><Input id="ct-li" v-model="fields.linkedin" placeholder="odkaz nebo uživatelské jméno" /></div>
          <div class="flex flex-col gap-1.5 sm:col-span-2"><Label for="ct-note">Poznámka</Label><Textarea id="ct-note" v-model="fields.note" rows="2" placeholder="Jak jsme se poznali, co slíbil(a)…" /></div>
        </form>
        <DialogFooter>
          <Button variant="ghost" @click="open = false">Zrušit</Button>
          <Button type="submit" form="contact-form" :disabled="!fields.name.trim()">Uložit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
