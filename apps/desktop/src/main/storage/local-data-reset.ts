import { existsSync, rmSync } from 'node:fs';
import { parse, resolve, sep } from 'node:path';

/** Files and directories Mochi itself owns below Electron's userData path. */
export const OWNED_LOCAL_DATA_ENTRIES = [
  'mochi.db',
  'mochi.db-wal',
  'mochi.db-shm',
  'settings.json',
  'settings.json.tmp',
  'user-routines.json',
  'user-routines.json.tmp',
  'keys.enc.json',
  'keys.enc.json.tmp',
  'gmail.enc.json',
  'gmail.enc.json.tmp',
  'google.enc.json',
  'google.enc.json.tmp',
  'calendar.enc.json',
  'calendar.enc.json.tmp',
  'brain',
  'skins',
] as const;

/**
 * Delete application-owned persistence after live services have been stopped.
 *
 * The base path must be a concrete application directory, never a filesystem
 * root. Each resolved child is checked again before deletion.
 */
export function deleteOwnedLocalData(userDataPath: string): readonly string[] {
  const base = resolve(userDataPath);
  if (base === parse(base).root) {
    throw new Error('Refusing to delete local data from a filesystem root.');
  }

  const prefix = `${base}${sep}`;
  const deleted: string[] = [];
  for (const entry of OWNED_LOCAL_DATA_ENTRIES) {
    const target = resolve(base, entry);
    if (!target.startsWith(prefix)) {
      throw new Error(`Refusing to delete a path outside Mochi user data: ${target}`);
    }
    if (!existsSync(target)) continue;
    rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50,
    });
    deleted.push(entry);
  }
  return deleted;
}
