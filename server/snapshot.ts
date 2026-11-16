/**
 * Daily safety net for data/: a git history kept in .data-history/ (separate from the project's
 * own repository, never pushed), and a refresh that runs by itself once a day.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { today } from '../shared/pipeline.ts';
import { getProgress, startRefresh } from './refresh.ts';
import { DATA_DIR, loadRuns, loadSettings } from './store.ts';

const run = promisify(execFile);
export const HISTORY_DIR = join(DATA_DIR, '..', '.data-history');

const git = (...args: string[]) =>
  run('git', [`--git-dir=${HISTORY_DIR}`, `--work-tree=${DATA_DIR}`, ...args], {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'job-hunt',
      GIT_AUTHOR_EMAIL: 'job-hunt@localhost',
      GIT_COMMITTER_NAME: 'job-hunt',
      GIT_COMMITTER_EMAIL: 'job-hunt@localhost',
    },
  });

/** Commit data/ when it changed and today has no snapshot yet. Returns what it did. */
export async function snapshot(force = false): Promise<'created' | 'unchanged' | 'skipped'> {
  if (!existsSync(HISTORY_DIR)) {
    await git('init', '--quiet');
  }
  const day = today();
  if (!force) {
    const last = await git('log', '-1', '--format=%s').catch(() => ({ stdout: '' }));
    if (last.stdout.trim() === `data ${day}`) return 'skipped';
  }
  await git('add', '--all', '--', '.', ':!*.tmp');
  const { stdout } = await git('status', '--porcelain');
  if (!stdout.trim()) return 'unchanged';
  await git('commit', '--quiet', '-m', `data ${day}`);
  return 'created';
}

const HOUR = 3_600_000;

/** A refresh is due when the last one is over 20 hours old, during waking hours. */
export function refreshDue(lastRunAt: string | undefined, now = new Date()): boolean {
  if (now.getHours() < 7 || now.getHours() >= 23) return false;
  return !lastRunAt || now.getTime() - Date.parse(lastRunAt) > 20 * HOUR;
}

function tick(): void {
  snapshot().catch((e: unknown) => console.warn('data snapshot failed:', e instanceof Error ? e.message : e));
  if (loadSettings().autoRefresh && !getProgress().running && refreshDue(loadRuns()[0]?.at)) {
    console.log('daily refresh starting');
    startRefresh();
  }
}

export function startDailyJobs(): void {
  setTimeout(tick, 10_000);
  setInterval(tick, HOUR / 2);
}
