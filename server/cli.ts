/** `pnpm refresh` — run one refresh from the terminal. `pnpm refresh --check-only` skips the search for new postings. */
import './env.ts';
import { refreshAndWait } from './refresh.ts';
import { loadRuns } from './store.ts';

const checkOnly = process.argv.includes('--check-only');
await refreshAndWait((p) => console.log(`${p.step}${p.total ? ` ${p.done}/${p.total}` : ''}`), !checkOnly);
const run = loadRuns()[0];
if (run) {
  console.log(`\nNové: ${run.added.length} · uzavřené: ${run.closed.length} · změněný text: ${run.changed.length}`);
  for (const e of run.errors) console.log(`! ${e}`);
}
