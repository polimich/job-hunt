/**
 * Daily safety net: a copy of the SQLite database in data/backups/ (VACUUM INTO, consistent even
 * while the app writes), the last 30 kept. Plus a refresh that runs by itself once a day.
 */
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { today } from '../shared/pipeline.ts';
import { getProgress, startRefresh } from './refresh.ts';
import { queueSummaries } from './summary-queue.ts';
import { DATA_DIR, db, loadRuns, loadSettings } from './store.ts';

export const BACKUP_DIR = join(DATA_DIR, 'backups');
const KEEP = 30;

export const backupName = (day: string) => `jobhunt-${day}.db`;

/** Write today's backup unless it exists. Returns its path, or null when today already has one. */
export function backup(day = today(), force = false): string | null {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const files = readdirSync(BACKUP_DIR).filter((f) => /^jobhunt-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  const name = backupName(day);
  if (files.includes(name) && !force) return null;
  const file = join(BACKUP_DIR, name);
  if (files.includes(name)) rmSync(file);
  db().exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  for (const old of [...files.filter((f) => f !== name), name].sort().slice(0, -KEEP)) rmSync(join(BACKUP_DIR, old));
  return file;
}

export function listBackups(): string[] {
  try {
    return readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort().reverse();
  } catch {
    return [];
  }
}

const HOUR = 3_600_000;

/** A refresh is due when the last one is over 20 hours old, during waking hours. */
export function refreshDue(lastRunAt: string | undefined, now = new Date()): boolean {
  if (now.getHours() < 7 || now.getHours() >= 23) return false;
  return !lastRunAt || now.getTime() - Date.parse(lastRunAt) > 20 * HOUR;
}

function tick(): void {
  try {
    const file = backup();
    if (file) console.log(`backup written: ${file}`);
  } catch (e) {
    console.warn('backup failed:', e instanceof Error ? e.message : e);
  }
  if (!getProgress().running) queueSummaries();
  if (loadSettings().autoRefresh && !getProgress().running && refreshDue(loadRuns(1)[0]?.at)) {
    console.log('daily refresh starting');
    startRefresh();
  }
}

export function startDailyJobs(): void {
  setTimeout(tick, 10_000);
  setInterval(tick, HOUR / 2);
}
