/**
 * Durable Gmail inbox synchronisation.
 *
 * One long-lived IMAP connection listens for mailbox changes through IDLE.
 * Separate short-lived connections perform metadata reconciliation, so a
 * slow fetch never leaves the watcher unable to receive a notification.
 */

import { powerMonitor } from 'electron';
import type { CachedEmail, EmailStore } from '@mochi/core';
import type { GmailCredentials } from '../storage/gmail-vault.js';
import type { GmailImapService } from './gmail-imap.js';

const RECONCILE_INTERVAL_MS = 15 * 60_000;
const IDLE_RESTART_MS = 25 * 60_000;
const CHANGE_DEBOUNCE_MS = 3_000;
const RECONNECT_DELAY_MS = 30_000;
const SNAPSHOT_LIMIT = 100;

export type GmailSyncReason = 'startup' | 'idle' | 'interval' | 'resume' | 'manual';

export interface GmailSyncStatus {
  readonly running: boolean;
  readonly syncing: boolean;
  readonly watching: boolean;
  readonly lastSyncedAt: number | null;
  readonly lastError: string | null;
}

export interface GmailSyncCallbacks {
  onInboxChanged(
    account: string,
    newEmails: readonly CachedEmail[],
    status: GmailSyncStatus,
  ): void | Promise<void>;
  onStatus?(status: GmailSyncStatus): void;
}

export class GmailSyncService {
  private watcher: import('imapflow').ImapFlow | null = null;
  private interval: NodeJS.Timeout | null = null;
  private changeDebounce: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private syncPromise: Promise<void> | null = null;
  private rerunRequested = false;
  private running = false;
  private watching = false;
  private lastSyncedAt: number | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly getCredentials: () => GmailCredentials | null,
    private readonly imap: GmailImapService,
    private readonly store: EmailStore,
    private readonly callbacks: GmailSyncCallbacks,
  ) {}

  get status(): GmailSyncStatus {
    return {
      running: this.running,
      syncing: this.syncPromise !== null,
      watching: this.watching,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.emitStatus();
    this.interval = setInterval(() => {
      void this.sync('interval');
    }, RECONCILE_INTERVAL_MS);
    this.interval.unref?.();

    powerMonitor.on('resume', this.onResume);
    powerMonitor.on('unlock-screen', this.onResume);
    void this.sync('startup');
    void this.startWatcher();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.interval !== null) clearInterval(this.interval);
    if (this.changeDebounce !== null) clearTimeout(this.changeDebounce);
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.interval = null;
    this.changeDebounce = null;
    this.reconnectTimer = null;
    powerMonitor.removeListener('resume', this.onResume);
    powerMonitor.removeListener('unlock-screen', this.onResume);

    const watcher = this.watcher;
    this.watcher = null;
    this.watching = false;
    if (watcher !== null) {
      try {
        await watcher.logout();
      } catch {
        watcher.close();
      }
    }
    this.emitStatus();
  }

  async sync(reason: GmailSyncReason = 'manual'): Promise<void> {
    if (!this.running && reason !== 'manual') return;
    if (this.syncPromise !== null) {
      this.rerunRequested = true;
      return this.syncPromise;
    }

    this.syncPromise = this.performSync();
    this.emitStatus();
    try {
      await this.syncPromise;
    } finally {
      this.syncPromise = null;
      this.emitStatus();
      if (this.rerunRequested && this.running) {
        this.rerunRequested = false;
        void this.sync('idle');
      }
    }
  }

  private async performSync(): Promise<void> {
    const credentials = this.getCredentials();
    if (credentials === null) return;

    const previous = await this.store.listCachedEmails(credentials.email, {
      limit: SNAPSHOT_LIMIT,
    });
    const previousIds = new Set(previous.map((email) => email.emailId));
    const result = await this.imap.fetchInboxSnapshot(credentials, SNAPSHOT_LIMIT);
    const now = Date.now();

    if (!result.ok) {
      this.lastError = result.error;
      await this.store.saveGmailSyncState({
        account: credentials.email,
        uidValidity: (await this.store.getGmailSyncState(credentials.email))?.uidValidity ?? null,
        lastSyncedAt: this.lastSyncedAt ?? 0,
        lastError: result.error,
      });
      return;
    }

    const newEmails = result.emails.filter((email) => !previousIds.has(email.emailId));
    await this.store.replaceInboxSnapshot(credentials.email, result.emails, now);
    await this.store.saveGmailSyncState({
      account: credentials.email,
      uidValidity: result.uidValidity,
      lastSyncedAt: now,
      lastError: null,
    });
    this.lastSyncedAt = now;
    this.lastError = null;
    await this.callbacks.onInboxChanged(credentials.email, newEmails, this.status);
  }

  private async startWatcher(): Promise<void> {
    if (!this.running || this.watcher !== null) return;
    const credentials = this.getCredentials();
    if (credentials === null) return;

    try {
      const { ImapFlow } = await import('imapflow');
      const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user: credentials.email,
          pass: credentials.appPassword,
        },
        logger: false,
        maxIdleTime: IDLE_RESTART_MS,
      });
      this.watcher = client;
      client.on('exists', () => this.scheduleChangeSync());
      client.on('error', (error) => {
        this.lastError = `Gmail watcher error: ${error.message}`;
        this.emitStatus();
      });
      client.on('close', () => {
        if (this.watcher === client) this.watcher = null;
        this.watching = false;
        this.emitStatus();
        this.scheduleReconnect();
      });

      await client.connect();
      await client.mailboxOpen('INBOX');
      this.watching = true;
      this.lastError = null;
      this.emitStatus();
      // ImapFlow automatically enters IDLE after the connection is inactive.
    } catch (error) {
      if (this.watcher !== null) {
        this.watcher.close();
        this.watcher = null;
      }
      this.watching = false;
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = `Gmail watcher error: ${message}`;
      this.emitStatus();
      this.scheduleReconnect();
    }
  }

  private scheduleChangeSync(): void {
    if (this.changeDebounce !== null) clearTimeout(this.changeDebounce);
    this.changeDebounce = setTimeout(() => {
      this.changeDebounce = null;
      void this.sync('idle');
    }, CHANGE_DEBOUNCE_MS);
    this.changeDebounce.unref?.();
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.startWatcher();
      void this.sync('resume');
    }, RECONNECT_DELAY_MS);
    this.reconnectTimer.unref?.();
  }

  private readonly onResume = (): void => {
    if (!this.running) return;
    const watcher = this.watcher;
    this.watcher = null;
    this.watching = false;
    watcher?.close();
    void this.startWatcher();
    void this.sync('resume');
  };

  private emitStatus(): void {
    this.callbacks.onStatus?.(this.status);
  }
}
