import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'start', component: () => import('./pages/StartPage.vue') },
    { path: '/tridit', name: 'deck', component: () => import('./pages/DeckPage.vue') },
    { path: '/vyber', name: 'shortlist', component: () => import('./pages/ShortlistPage.vue') },
    { path: '/prihlaska/:id', name: 'apply', component: () => import('./pages/ApplyPage.vue'), props: true },
    { path: '/priprava/:id', name: 'prep', component: () => import('./pages/PrepPage.vue'), props: true },
    { path: '/cv/:id', name: 'cv', component: () => import('./pages/CvPage.vue'), props: true },
    { path: '/dnes', name: 'today', component: () => import('./pages/TodayPage.vue') },
    { path: '/pozice', name: 'list', component: () => import('./pages/ListPage.vue') },
    { path: '/tabule', name: 'board', component: () => import('./pages/BoardPage.vue') },
    { path: '/prehled', name: 'stats', component: () => import('./pages/StatsPage.vue') },
    { path: '/nabidky', name: 'offers', component: () => import('./pages/OffersPage.vue') },
    { path: '/pozice/:id', name: 'listing', component: () => import('./pages/ListingPage.vue'), props: true },
    { path: '/firmy', name: 'companies', component: () => import('./pages/CompaniesPage.vue') },
    { path: '/firmy/:id', name: 'company', component: () => import('./pages/CompanyPage.vue'), props: true },
    { path: '/zmeny', name: 'changes', component: () => import('./pages/ChangesPage.vue') },
    { path: '/nastaveni', name: 'settings', component: () => import('./pages/SettingsPage.vue') },
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});
