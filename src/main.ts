import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import 'vue-sonner/style.css';
import './styles.css';
import './lib/theme';

createApp(App).use(router).mount('#app');
