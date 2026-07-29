/**
 * Encrypted storage for API keys.
 *
 * RULE 1: keys live in the main process only. This module is the single place
 * a plaintext key exists in memory, and nothing it returns to the renderer
 * contains one — the bridge exposes redacted strings and provider ids.
 *
 * Uses Electron `safeStorage`: DPAPI on Windows, Keychain on macOS, libsecret
 * on Linux, and no native dependency. Deliberately not `keytar`, which is
 * archived.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';
import { redactKey, type ProviderId } from '@mochi/core';

interface VaultFile {
  /** provider → base64 of the safeStorage-encrypted key. */
  readonly keys: Partial<Record<ProviderId, string>>;
}

export interface StoredKeySummary {
  readonly provider: ProviderId;
  /** Safe to display and log. Never the key itself. */
  readonly redacted: string;
}

export class KeyVault {
  private readonly filePath: string;
  private cache: VaultFile = { keys: {} };

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(app.getPath('userData'), 'keys.enc.json');
    this.load();
  }

  /**
   * Whether the OS can actually encrypt.
   *
   * False on a Linux box with no keyring. Storing a key in plaintext instead
   * would silently break the promise made in the UI, so callers must refuse
   * to store rather than degrade.
   */
  get available(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  private load(): void {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && 'keys' in parsed) {
        const keys = (parsed as VaultFile).keys;
        if (typeof keys === 'object' && keys !== null) this.cache = { keys };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        // A corrupt vault must not stop Mochi starting; the user re-enters
        // the key, which is recoverable. Refusing to launch is not.
        console.warn('[vault] unreadable, starting empty');
      }
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.cache), 'utf8');
      renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('[vault] failed to persist:', error);
    }
  }

  /** Returns false when the platform cannot encrypt. Never stores plaintext. */
  store(provider: ProviderId, rawKey: string): boolean {
    if (!this.available) return false;
    const key = rawKey.trim();
    if (key.length === 0) return false;

    try {
      const encrypted = safeStorage.encryptString(key).toString('base64');
      this.cache = { keys: { ...this.cache.keys, [provider]: encrypted } };
      this.persist();
      return true;
    } catch (error) {
      // Never log the key, even on failure.
      console.error(`[vault] could not encrypt key for ${provider}`);
      void error;
      return false;
    }
  }

  /**
   * Decrypt a key for use.
   *
   * Main process only, and the result must never cross the bridge. Callers
   * should use it immediately rather than holding it.
   */
  reveal(provider: ProviderId): string | null {
    const encrypted = this.cache.keys[provider];
    if (encrypted === undefined) return null;
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      // Usually means the OS user or machine changed — the ciphertext is no
      // longer decryptable. Drop it so the UI prompts for a fresh key.
      console.warn(`[vault] stored key for ${provider} could not be decrypted; discarding`);
      this.forget(provider);
      return null;
    }
  }

  forget(provider: ProviderId): void {
    const keys = { ...this.cache.keys };
    delete keys[provider];
    this.cache = { keys };
    this.persist();
  }

  has(provider: ProviderId): boolean {
    return this.cache.keys[provider] !== undefined;
  }

  get providers(): readonly ProviderId[] {
    return Object.keys(this.cache.keys) as ProviderId[];
  }

  /** Redacted view for the renderer. Contains no secret. */
  summaries(): readonly StoredKeySummary[] {
    return this.providers.map((provider) => {
      const key = this.reveal(provider);
      return { provider, redacted: key === null ? '••••' : redactKey(key) };
    });
  }

  /** Remove everything, including the file. */
  clear(): void {
    this.cache = { keys: {} };
    if (existsSync(this.filePath)) rmSync(this.filePath, { force: true });
  }
}
