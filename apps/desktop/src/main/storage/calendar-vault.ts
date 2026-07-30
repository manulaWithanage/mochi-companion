/**
 * Encrypted storage for the calendar feed URL.
 *
 * The same safeStorage pattern as KeyVault and GmailVault — DPAPI on Windows,
 * Keychain on macOS.
 *
 * **The URL itself is the credential.** A Google secret iCal address embeds a
 * private token that grants read access to the entire calendar to anyone
 * holding it. There is no password beside it to protect, so the URL gets
 * exactly the treatment a password would: encrypted at rest, never logged, and
 * never sent across the bridge in full (RULE 1). The renderer only ever
 * receives the redacted host.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';
import { looksLikeIcsUrl, normaliseIcsUrl, redactIcsUrl } from '../services/ics.js';

interface CalendarVaultFile {
  readonly encryptedUrl?: string;
  /** Kept in the clear so status can be shown without decrypting. */
  readonly redacted?: string;
  /** The owner's address, used to find their own RSVP among attendees. */
  readonly selfEmail?: string;
}

export class CalendarVault {
  private readonly filePath: string;
  private cache: CalendarVaultFile = {};

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(app.getPath('userData'), 'calendar.enc.json');
    this.load();
  }

  get available(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  get hasFeed(): boolean {
    return this.cache.encryptedUrl !== undefined;
  }

  /** Safe to show and to log. Never the token. */
  get redacted(): string {
    return this.cache.redacted ?? '';
  }

  get selfEmail(): string | null {
    return this.cache.selfEmail ?? null;
  }

  private load(): void {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null) {
        this.cache = parsed as CalendarVaultFile;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') console.warn('[calendar-vault] unreadable, starting empty');
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.cache), 'utf8');
      renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('[calendar-vault] failed to persist:', error);
    }
  }

  /**
   * Store a feed URL. Returns false rather than degrading to plaintext if the
   * platform cannot encrypt — a token this powerful is not written in the clear.
   */
  store(rawUrl: string, selfEmail?: string): boolean {
    if (!this.available) return false;
    if (!looksLikeIcsUrl(rawUrl)) return false;

    const url = normaliseIcsUrl(rawUrl);
    try {
      this.cache = {
        encryptedUrl: safeStorage.encryptString(url).toString('base64'),
        redacted: redactIcsUrl(url),
        ...(selfEmail !== undefined && selfEmail.trim().length > 0
          ? { selfEmail: selfEmail.trim().toLowerCase() }
          : {}),
      };
      this.persist();
      return true;
    } catch {
      console.error('[calendar-vault] could not encrypt the feed URL');
      return false;
    }
  }

  /** Decrypt for an outgoing fetch. Main process only; never returned upward. */
  reveal(): string | null {
    if (this.cache.encryptedUrl === undefined) return null;
    try {
      return safeStorage.decryptString(Buffer.from(this.cache.encryptedUrl, 'base64'));
    } catch {
      // A vault written under a different OS user or machine key cannot be
      // recovered. Discard rather than retry forever.
      console.warn('[calendar-vault] could not decrypt the feed URL; discarding');
      this.clear();
      return null;
    }
  }

  clear(): void {
    this.cache = {};
    if (existsSync(this.filePath)) rmSync(this.filePath, { force: true });
  }
}
