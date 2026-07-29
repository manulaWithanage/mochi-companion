/**
 * Encrypted storage for Gmail App Password credentials.
 *
 * Follows the exact same safeStorage pattern as KeyVault — DPAPI on Windows,
 * Keychain on macOS. The raw password never leaves this file and never crosses
 * the bridge (RULE 1). Only a redacted form is sent to the renderer.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';

export interface GmailCredentials {
  readonly email: string;
  readonly appPassword: string;
}

interface GmailVaultFile {
  readonly email?: string;
  readonly encryptedPassword?: string;
}

export class GmailVault {
  private readonly filePath: string;
  private cache: GmailVaultFile = {};

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(app.getPath('userData'), 'gmail.enc.json');
    this.load();
  }

  get available(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  get hasCredentials(): boolean {
    return this.cache.email !== undefined && this.cache.encryptedPassword !== undefined;
  }

  get email(): string | null {
    return this.cache.email ?? null;
  }

  /** Redacted form safe to send to the renderer. */
  get redactedPassword(): string {
    if (!this.hasCredentials) return '';
    return '••••  ••••  ••••  ••••';
  }

  private load(): void {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        this.cache = parsed as GmailVaultFile;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn('[gmail-vault] unreadable, starting empty');
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
      console.error('[gmail-vault] failed to persist:', error);
    }
  }

  store(email: string, rawAppPassword: string): boolean {
    if (!this.available) return false;
    const password = rawAppPassword.replace(/\s/g, '').trim();
    if (email.length === 0 || password.length === 0) return false;

    try {
      const encryptedPassword = safeStorage.encryptString(password).toString('base64');
      this.cache = { email: email.trim().toLowerCase(), encryptedPassword };
      this.persist();
      return true;
    } catch {
      console.error('[gmail-vault] could not encrypt app password');
      return false;
    }
  }

  /** Decrypt credentials for an outgoing IMAP connection. Main process only. */
  reveal(): GmailCredentials | null {
    if (!this.hasCredentials) return null;
    try {
      const appPassword = safeStorage.decryptString(
        Buffer.from(this.cache.encryptedPassword!, 'base64'),
      );
      return { email: this.cache.email!, appPassword };
    } catch {
      console.warn('[gmail-vault] could not decrypt credentials; discarding');
      this.clear();
      return null;
    }
  }

  clear(): void {
    this.cache = {};
    if (existsSync(this.filePath)) rmSync(this.filePath, { force: true });
  }
}
