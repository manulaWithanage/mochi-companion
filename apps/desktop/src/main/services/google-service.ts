/**
 * Owns the Google connection: Client ID, tokens, and refresh.
 *
 * The refresh token is the most sensitive thing Mochi stores after LLM keys,
 * so it lives in `safeStorage` and never crosses the bridge. The renderer
 * only ever learns *whether* an account is connected and which one.
 */

import { safeStorage, shell } from 'electron';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { needsRefresh, type GoogleStatus, type GoogleTokens } from '@mochi/core';
import { authorizeWithGoogle, refreshAccessToken } from './google-auth.js';

interface VaultFile {
  readonly clientId: string;
  /** base64 of the safeStorage-encrypted refresh token. */
  readonly refresh: string;
  readonly account: string | null;
  readonly scopes: readonly string[];
  readonly expiresAt: number;
}

export class GoogleService {
  private state: VaultFile | null = null;
  private accessToken: string | null = null;
  private readonly listeners = new Set<(s: GoogleStatus) => void>();

  constructor(private readonly filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null && 'refresh' in parsed) {
        this.state = parsed as VaultFile;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') console.warn('[google] stored connection unreadable; starting clean');
    }
  }

  private persist(): void {
    try {
      if (this.state === null) {
        if (existsSync(this.filePath)) rmSync(this.filePath, { force: true });
        return;
      }
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state), 'utf8');
      renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('[google] failed to persist:', error);
    }
  }

  /** Opens a wizard step in the real browser, never inside the app. */
  openStep(url: string): void {
    if (url.startsWith('https://console.cloud.google.com/')) void shell.openExternal(url);
  }

  async connect(clientId: string): Promise<{ ok: boolean; error?: string }> {
    if (!safeStorage.isEncryptionAvailable()) {
      return {
        ok: false,
        error: 'This system cannot encrypt secrets, so the connection was not saved.',
      };
    }

    const result = await authorizeWithGoogle(clientId.trim());
    if (!result.ok) return { ok: false, error: result.error };

    this.store(clientId.trim(), result.tokens);
    this.emit();
    return { ok: true };
  }

  private store(clientId: string, tokens: GoogleTokens): void {
    this.accessToken = tokens.accessToken;
    this.state = {
      clientId,
      refresh: safeStorage.encryptString(tokens.refreshToken ?? '').toString('base64'),
      account: this.state?.account ?? null,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
    };
    this.persist();
  }

  /**
   * A valid access token, refreshed if it is close to expiring.
   *
   * Returns null rather than throwing — callers are usually background work
   * and should degrade quietly, not crash a briefing.
   */
  async getAccessToken(): Promise<string | null> {
    if (this.state === null) return null;

    const stillGood =
      this.accessToken !== null &&
      !needsRefresh(
        {
          accessToken: this.accessToken,
          refreshToken: null,
          expiresAt: this.state.expiresAt,
          scopes: [],
        },
        Date.now(),
      );
    if (stillGood) return this.accessToken;

    let refresh: string;
    try {
      refresh = safeStorage.decryptString(Buffer.from(this.state.refresh, 'base64'));
    } catch {
      console.warn('[google] stored token could not be decrypted; disconnecting');
      this.disconnect();
      return null;
    }

    const result = await refreshAccessToken(this.state.clientId, refresh);
    if (!result.ok) {
      console.warn(`[google] refresh failed: ${result.error}`);
      return null;
    }

    this.store(this.state.clientId, result.tokens);
    return result.tokens.accessToken;
  }

  disconnect(): GoogleStatus {
    this.state = null;
    this.accessToken = null;
    this.persist();
    return this.emit();
  }

  status(): GoogleStatus {
    return {
      connected: this.state !== null,
      account: this.state?.account ?? null,
      scopes: this.state?.scopes ?? [],
      hasClientId: this.state !== null,
    };
  }

  onChange(listener: (s: GoogleStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): GoogleStatus {
    const status = this.status();
    for (const l of this.listeners) l(status);
    return status;
  }
}
