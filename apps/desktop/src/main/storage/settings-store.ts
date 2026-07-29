/**
 * Settings persistence — a plain JSON file in userData.
 *
 * No dependency needed: normalizeSettings in @mochi/core already treats the
 * file contents as untrusted and always yields a usable object, so a
 * hand-edited or truncated file cannot stop Mochi from starting.
 *
 * V1 holds no secrets here. The BYOK vault (V2) goes in safeStorage in the
 * main process and never touches this file (RULE 1).
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { DEFAULT_SETTINGS, normalizeSettings, type MochiSettings } from '@mochi/core';

export class SettingsStore {
  private readonly filePath: string;
  private cache: MochiSettings;
  private readonly listeners = new Set<(settings: MochiSettings) => void>();

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(app.getPath('userData'), 'settings.json');
    this.cache = this.read();
  }

  private read(): MochiSettings {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const { settings, issues } = normalizeSettings(JSON.parse(raw));
      for (const issue of issues) {
        console.warn(`[settings] ${issue.field}: ${issue.message}`);
      }
      return settings;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn('[settings] unreadable, falling back to defaults:', error);
      }
      return DEFAULT_SETTINGS;
    }
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      // Write-then-rename so a crash mid-write cannot leave a truncated file.
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf8');
      renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('[settings] failed to persist:', error);
    }
  }

  get(): MochiSettings {
    return this.cache;
  }

  update(patch: Partial<MochiSettings>): MochiSettings {
    const { settings } = normalizeSettings({ ...this.cache, ...patch });
    this.cache = settings;
    this.write();
    for (const listener of this.listeners) listener(settings);
    return settings;
  }

  onChange(listener: (settings: MochiSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
