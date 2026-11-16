/**
 * Where the Gmail refresh token lives: the macOS Keychain when available, otherwise a file
 * readable only by this user in data/secrets/. Never in SQLite, so backups and exports
 * do not carry it.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../db.ts';

const SERVICE = 'job-hunt';
const DIR = join(DATA_DIR, 'secrets');
const useKeychain = process.platform === 'darwin' && !process.env.JOBHUNT_NO_KEYCHAIN;

export function getSecret(name: string): string | null {
  if (useKeychain) {
    try {
      return execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', name, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    } catch {
      return null;
    }
  }
  const file = join(DIR, name);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() || null : null;
}

export function setSecret(name: string, value: string): void {
  if (useKeychain) {
    execFileSync('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', name, '-w', value], { stdio: 'ignore' });
    return;
  }
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const file = join(DIR, name);
  writeFileSync(file, value, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function deleteSecret(name: string): void {
  if (useKeychain) {
    try {
      execFileSync('security', ['delete-generic-password', '-s', SERVICE, '-a', name], { stdio: 'ignore' });
    } catch {
      /* not there */
    }
    return;
  }
  rmSync(join(DIR, name), { force: true });
}
