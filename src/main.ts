import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import 'vue-sonner/style.css';
import './styles.css';
import './lib/theme';

// A hosted copy sits behind a login; when the session ends, any API call goes back to it.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const res = await nativeFetch(input, init);
  if (res.status === 401 && String(input instanceof Request ? input.url : input).includes('/api/')) location.href = '/login';
  return res;
};

createApp(App).use(router).mount('#app');
