import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'today', component: () => import('./pages/TodayPage.vue') },
    { path: '/pozice', name: 'list', component: () => import('./pages/ListPage.vue') },
    { path: '/tabule', name: 'board', component: () => import('./pages/BoardPage.vue') },
    { path: '/prehled', name: 'stats', component: () => import('./pages/StatsPage.vue') },
    { path: '/pozice/:id', name: 'listing', component: () => import('./pages/ListingPage.vue'), props: true },
    { path: '/firmy', name: 'companies', component: () => import('./pages/CompaniesPage.vue') },
    { path: '/firmy/:id', name: 'company', component: () => import('./pages/CompanyPage.vue'), props: true },
    { path: '/zmeny', name: 'changes', component: () => import('./pages/ChangesPage.vue') },
    { path: '/nastaveni', name: 'settings', component: () => import('./pages/SettingsPage.vue') },
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});
