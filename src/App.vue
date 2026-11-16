<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import {
  BriefcaseBusinessIcon,
  Building2Icon,
  ChartColumnIcon,
  HandshakeIcon,
  HistoryIcon,
  LayoutListIcon,
  PlusIcon,
  SquareKanbanIcon,
  SunriseIcon,
  MonitorIcon,
  MoonIcon,
  RefreshCwIcon,
  Settings2Icon,
  SunIcon,
  TriangleAlertIcon,
} from '@lucide/vue';
import type { Status } from '../shared/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { statusMeta } from '@/lib/status';
import { colorMode } from '@/lib/theme';
import { cn } from '@/lib/utils';
import AddListingDialog from './components/AddListingDialog.vue';
import { addOpen, db, due, dueTasks, filters, offers, load, loaded, loadError, progress, resumeRefresh, startRefresh, statusCounts } from './store';
import { formatDateTime } from './format';

onMounted(async () => {
  await load();
  await resumeRefresh();
});

const route = useRoute();
const router = useRouter();

const lastRun = computed(() => db.runs[0]);
const openCount = computed(() => db.listings.filter((l) => l.open).length);
const pct = computed(() => (progress.value.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0));

const nav = computed(() => [
  { to: '/', label: 'Dnes', icon: SunriseIcon, count: due.value.length + dueTasks.value.length || undefined, alert: due.value.length + dueTasks.value.length > 0, active: route.path === '/' },
  { to: '/pozice', label: 'Pozice', icon: LayoutListIcon, count: openCount.value, active: route.path.startsWith('/pozice') },
  { to: '/tabule', label: 'Tabule', icon: SquareKanbanIcon, count: undefined, active: route.path.startsWith('/tabule') },
  { to: '/prehled', label: 'Přehled', icon: ChartColumnIcon, count: undefined, active: route.path.startsWith('/prehled') },
  ...(offers.value.length
    ? [{ to: '/nabidky', label: 'Nabídky', icon: HandshakeIcon, count: offers.value.length, active: route.path.startsWith('/nabidky') }]
    : []),
  { to: '/firmy', label: 'Firmy', icon: Building2Icon, count: db.companies.length, active: route.path.startsWith('/firmy') },
  { to: '/zmeny', label: 'Změny', icon: HistoryIcon, count: undefined, active: route.path.startsWith('/zmeny') },
  { to: '/nastaveni', label: 'Nastavení', icon: Settings2Icon, count: undefined, active: route.path.startsWith('/nastaveni') },
]);

const activeIndex = computed(() => nav.value.findIndex((i) => i.active));

const pipeline: Status[] = ['applied', 'talking', 'interview', 'offer'];
const pipelineActive = (s: Status) => route.path === '/pozice' && filters.statuses.length === 1 && filters.statuses[0] === s;
function showOnly(s: Status) {
  filters.statuses = [s];
  void router.push('/pozice');
}

const themeIcon = computed(() => (colorMode.value === 'dark' ? MoonIcon : colorMode.value === 'light' ? SunIcon : MonitorIcon));
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex h-full">
      <!-- Sidebar (desktop) -->
      <aside class="hidden w-64 shrink-0 flex-col border-r bg-sidebar/70 backdrop-blur-xl md:flex">
        <RouterLink to="/" class="group flex items-center gap-3 px-4 pt-5 pb-6">
          <span
            class="flex size-10 -rotate-6 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-pop"
          >
            <BriefcaseBusinessIcon class="size-5" />
          </span>
          <span class="leading-tight">
            <span class="block font-display text-lg font-bold tracking-tight">Job hunt</span>
            <span class="block text-xs text-muted-foreground">Hledání práce</span>
          </span>
        </RouterLink>

        <nav class="relative flex flex-col gap-1 px-3">
          <!-- One highlight that slides to the active item. -->
          <span
            v-show="activeIndex >= 0"
            aria-hidden="true"
            class="absolute inset-x-3 top-0 h-9 rounded-xl bg-card shadow-soft ring-1 ring-foreground/5 transition-transform duration-200 ease-out"
            :style="{ transform: `translateY(${activeIndex * 40}px)` }"
          />
          <RouterLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            :class="cn(
              'group relative flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
              item.active ? 'text-foreground' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
            )"
          >
            <component
              :is="item.icon"
              :class="cn('size-4', item.active && 'text-primary')"
            />
            <span class="flex-1">{{ item.label }}</span>
            <span
              v-if="item.count !== undefined && loaded"
              :class="cn(
                'text-xs tabular-nums',
                item.alert ? 'rounded-full bg-primary px-1.5 py-px font-semibold text-primary-foreground' : 'text-muted-foreground',
              )"
            >{{ item.count }}</span>
          </RouterLink>
        </nav>

        <div class="mt-4 px-3">
          <Button variant="outline" class="h-9 w-full justify-start rounded-xl border-dashed" @click="addOpen = true">
            <PlusIcon /> Přidat pozici
          </Button>
        </div>

        <div v-if="loaded && pipeline.some((s) => statusCounts[s])" class="mt-7 px-3">
          <p class="px-3 pb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Rozjednané</p>
          <button
            v-for="s in pipeline"
            :key="s"
            type="button"
            :class="cn(
              'group flex h-8 w-full items-center gap-2.5 rounded-xl px-3 text-sm transition-colors',
              pipelineActive(s) ? cn(statusMeta(s).tone, 'font-medium') : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
            )"
            @click="showOnly(s)"
          >
            <span :class="cn('size-2.5 rounded-full ring-2 ring-sidebar', statusMeta(s).dot)" />
            <span class="flex-1 text-left">{{ statusMeta(s).label }}</span>
            <span class="text-xs font-medium tabular-nums">{{ statusCounts[s] }}</span>
          </button>
        </div>

        <div class="mt-auto flex flex-col gap-3 p-3">
          <div class="rounded-2xl border bg-card p-3 shadow-soft">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-medium">Inzeráty</p>
              <p v-if="!progress.running && lastRun" class="text-[11px] text-muted-foreground" :title="`Naposledy obnoveno ${formatDateTime(lastRun.at)}`">
                {{ formatDateTime(lastRun.at) }}
              </p>
            </div>
            <template v-if="progress.running">
              <p class="mt-1.5 truncate text-xs text-muted-foreground" aria-live="polite" :title="progress.step">{{ progress.step || 'Spouštím…' }}</p>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  :class="cn('h-full rounded-full bg-primary transition-all duration-500', !progress.total && 'w-1/3 animate-pulse')"
                  :style="progress.total ? { width: `${pct}%` } : undefined"
                />
              </div>
              <p v-if="progress.total" class="mt-1 text-[11px] tabular-nums text-muted-foreground">{{ progress.done }} / {{ progress.total }}</p>
            </template>
            <p v-if="progress.error && !progress.running" class="mt-1.5 line-clamp-2 text-xs text-destructive" :title="progress.error">
              Selhalo: {{ progress.error }}
            </p>
            <Button class="mt-2.5 w-full" size="sm" :disabled="progress.running" @click="startRefresh()">
              <RefreshCwIcon :class="cn(progress.running && 'animate-spin')" />
              {{ progress.running ? 'Obnovuji…' : 'Obnovit inzeráty' }}
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="sm" class="justify-start text-muted-foreground">
                <component :is="themeIcon" />
                Vzhled
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" class="w-44">
              <DropdownMenuLabel>Vzhled</DropdownMenuLabel>
              <DropdownMenuRadioGroup v-model="colorMode">
                <DropdownMenuRadioItem value="auto"><MonitorIcon /> Podle systému</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light"><SunIcon /> Světlý</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark"><MoonIcon /> Tmavý</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <!-- Top bar (mobile) -->
        <header class="flex items-center gap-1 border-b bg-sidebar/80 px-2 py-2 backdrop-blur-xl md:hidden">
          <RouterLink to="/" class="mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BriefcaseBusinessIcon class="size-4" />
          </RouterLink>
          <nav class="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]">
            <RouterLink
              v-for="item in nav"
              :key="item.to"
              :to="item.to"
              :aria-label="item.label"
              :class="cn('flex size-10 shrink-0 items-center justify-center rounded-lg', item.active ? 'bg-background text-primary shadow-xs' : 'text-muted-foreground')"
            >
              <component :is="item.icon" class="size-4" />
            </RouterLink>
          </nav>
          <Button size="icon-sm" variant="ghost" aria-label="Přidat pozici" @click="addOpen = true"><PlusIcon /></Button>
          <Button size="sm" :disabled="progress.running" @click="startRefresh()">
            <RefreshCwIcon :class="cn(progress.running && 'animate-spin')" />
            {{ progress.running ? `${pct || ''}${pct ? ' %' : '…'}` : 'Obnovit' }}
          </Button>
        </header>

        <div v-if="loadError" class="m-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-danger-soft p-4 text-sm text-destructive">
          <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
          <p>
            Nepodařilo se načíst data ({{ loadError }}). Běží server? Spusť
            <code class="rounded bg-background/60 px-1 py-0.5 font-mono text-xs">pnpm dev</code>.
          </p>
        </div>

        <main class="min-h-0 flex-1 overflow-auto scrollbar-thin">
          <RouterView v-if="loaded" v-slot="{ Component, route: r }">
            <Transition name="page" mode="out-in">
              <component :is="Component" :key="r.path" />
            </Transition>
          </RouterView>
          <div v-else-if="!loadError" class="flex h-full items-center justify-center text-sm text-muted-foreground">
            <RefreshCwIcon class="mr-2 size-4 animate-spin" /> Načítám…
          </div>
        </main>
      </div>
    </div>
    <AddListingDialog />
    <Toaster position="bottom-right" />
  </TooltipProvider>
</template>
