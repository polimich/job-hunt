/** Keeps the application kits on a page fresh while the server prepares them. */
import { onMounted, onUnmounted } from 'vue';
import { kitQueue, refreshKits } from './store';

export function useKitPolling(): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let n = 0;
  const tick = () => void refreshKits().catch(() => undefined);
  onMounted(() => {
    tick();
    // Every 4 s while something is being prepared, otherwise once a minute.
    timer = setInterval(() => {
      n++;
      if (kitQueue.value.running || kitQueue.value.ids.length || n % 15 === 0) tick();
    }, 4000);
  });
  onUnmounted(() => clearInterval(timer));
}
