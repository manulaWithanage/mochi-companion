/**
 * Gmail manager — wires together GmailVault, GmailImapService and LlmClient
 * into the IPC-callable interface used by ipc.ts.
 *
 * Main process only. Never imported by the renderer.
 */

import type {
  CachedEmail,
  CachedEmailQuery,
  CachedInboxItem,
  EmailStore,
  EmailCategory,
  EventBus,
  GmailConnectResult,
  GmailDraftResult,
  GmailFetchResult,
  GmailSaveDraftRequest,
  GmailStatus,
  GmailSyncStatus,
  GmailTone,
} from '@mochi/core';
import { buildEmailReplyPrompt, makeEvent, parseEmailReplyResponse } from '@mochi/core';
import { GmailVault } from '../storage/gmail-vault.js';
import { GmailImapService } from './gmail-imap.js';
import type { LlmClient } from './llm-client.js';
import type { SettingsStore } from '../storage/settings-store.js';
import { EmailTriageService } from './email-triage-service.js';
import { EmailDraftService } from './email-draft-service.js';
import { EmailReminderService } from './email-reminder-service.js';
import { GmailSyncService } from './gmail-sync-service.js';

export class GmailManager {
  private readonly vault: GmailVault;
  private readonly imap: GmailImapService;
  private readonly triage: EmailTriageService;
  private readonly drafts: EmailDraftService;
  private readonly reminders: EmailReminderService;
  private readonly syncService: GmailSyncService;
  private readonly inboxListeners = new Set<
    (account: string, newEmails: readonly CachedEmail[]) => void
  >();
  private readonly syncStatusListeners = new Set<(status: GmailSyncStatus) => void>();
  /** Cache of the last fetched emails for the current session. */
  private emailCache: import('./gmail-imap.js').EmailSummary[] = [];

  constructor(
    private readonly llmClient: LlmClient,
    private readonly settings: SettingsStore,
    private readonly emailStore: EmailStore,
    private readonly bus: EventBus,
    vault?: GmailVault,
    imap?: GmailImapService,
  ) {
    this.vault = vault ?? new GmailVault();
    this.imap = imap ?? new GmailImapService();
    this.triage = new EmailTriageService(this.llmClient, this.emailStore, this.settings);
    this.drafts = new EmailDraftService(
      this.llmClient,
      this.imap,
      this.emailStore,
      this.settings,
      () => this.vault.reveal(),
      (account) => this.notifyInbox(account, []),
    );
    this.reminders = new EmailReminderService(
      this.bus,
      this.emailStore,
      this.imap,
      () => this.vault.reveal(),
      () => {
        const preferences = this.settings.get().gmailAi;
        const shortestDelay = Math.min(
          preferences.urgentReminderDelayMs,
          preferences.reviewReminderDelayMs,
        );
        return {
          enabled: preferences.remindersEnabled,
          timing: {
            urgentFirstReminderMs: preferences.urgentReminderDelayMs,
            reviewFirstReminderMs: preferences.reviewReminderDelayMs,
            urgentFollowUpMs: preferences.urgentFollowUpDelayMs,
            replanGraceMs: shortestDelay <= 30_000 ? 1_000 : 60_000,
          },
        };
      },
    );
    this.syncService = new GmailSyncService(() => this.vault.reveal(), this.imap, emailStore, {
      onInboxChanged: async (account, newEmails) => {
        await this.enforceRetention(account);
        // Publish the durable metadata snapshot immediately. LLM triage can be
        // slower or unavailable and must never delay a newly arrived message
        // from appearing in the Gmail tab.
        this.notifyInbox(account, newEmails);
        await this.triage.classifyInbox(account);
        await this.reminders.reconcile(account);
        this.drafts.enqueueEligible(account);
        // Publish again once priority, reminder, and draft state is enriched.
        this.notifyInbox(account, newEmails);
      },
      onStatus: (status) => {
        for (const listener of this.syncStatusListeners) listener(status);
      },
    });
  }

  start(): void {
    if (this.vault.hasCredentials) this.syncService.start();
  }

  async stop(): Promise<void> {
    this.drafts.stop();
    this.reminders.stop();
    await this.syncService.stop();
  }

  status(): GmailStatus {
    return {
      connected: this.vault.hasCredentials,
      email: this.vault.email,
      redactedPassword: this.vault.redactedPassword,
    };
  }

  /**
   * Test connection and save credentials if valid.
   */
  async connect(email: string, rawAppPassword: string): Promise<GmailConnectResult> {
    if (!email.includes('@')) {
      return { ok: false, error: 'Please enter a valid Gmail address.' };
    }
    if (rawAppPassword.replace(/\s/g, '').length < 16) {
      return { ok: false, error: 'App Password must be 16 characters.' };
    }

    const cleanPassword = rawAppPassword.replace(/\s/g, '');
    const test = await this.imap.testConnection({
      email: email.trim().toLowerCase(),
      appPassword: cleanPassword,
    });
    if (!test.ok) {
      return { ok: false, error: test.error ?? 'Gmail rejected those credentials.' };
    }

    const stored = this.vault.store(email, rawAppPassword);
    if (!stored) {
      return {
        ok: false,
        error: 'Could not encrypt credentials. This system may not support encrypted storage.',
      };
    }

    this.syncService.start();
    return { ok: true };
  }

  async disconnect(): Promise<void> {
    const account = this.vault.email;
    this.drafts.stop();
    this.reminders.stop();
    await this.syncService.stop();
    try {
      if (account !== null && this.settings.get().gmailAi.deleteCachedDataOnDisconnect) {
        await this.emailStore.deleteEmailData(account);
      }
    } finally {
      this.vault.clear();
      this.emailCache = [];
    }
  }

  async clearLocalData(): Promise<number> {
    const account = this.vault.email;
    if (account === null) return 0;
    this.drafts.stop();
    this.reminders.stop();
    const deleted = await this.emailStore.deleteEmailData(account);
    this.emailCache = [];
    this.notifyInbox(account, []);
    return deleted;
  }

  async refresh(): Promise<GmailSyncStatus> {
    await this.syncService.sync('manual');
    return this.syncService.status;
  }

  async listCached(query: CachedEmailQuery = {}): Promise<readonly CachedInboxItem[]> {
    const account = this.vault.email;
    if (account === null) return [];
    return this.emailStore.listCachedEmails(account, query);
  }

  get syncStatus(): GmailSyncStatus {
    return this.syncService.status;
  }

  onInboxChanged(
    listener: (account: string, newEmails: readonly CachedEmail[]) => void,
  ): () => void {
    this.inboxListeners.add(listener);
    return () => this.inboxListeners.delete(listener);
  }

  onSyncStatus(listener: (status: GmailSyncStatus) => void): () => void {
    this.syncStatusListeners.add(listener);
    return () => this.syncStatusListeners.delete(listener);
  }

  async snoozeReminder(emailId: string, until: number): Promise<boolean> {
    const account = this.vault.email;
    if (account === null) return false;
    const changed = await this.reminders.snooze(account, emailId, until);
    if (changed) this.notifyInbox(account, []);
    return changed;
  }

  async dismissReminder(emailId: string): Promise<boolean> {
    const account = this.vault.email;
    if (account === null) return false;
    const changed = await this.reminders.dismissEmail(account, emailId);
    if (changed) this.notifyInbox(account, []);
    return changed;
  }

  async dismissReminderThread(threadId: string): Promise<void> {
    const account = this.vault.email;
    if (account === null) return;
    await this.reminders.dismissThread(account, threadId);
    this.notifyInbox(account, []);
  }

  async applyPreferences(rescorePriority = false): Promise<void> {
    const account = this.vault.email;
    if (account === null) return;
    await this.enforceRetention(account);
    if (rescorePriority) await this.triage.classifyInbox(account, true);
    await this.reminders.reconcile(account);
    this.drafts.enqueueEligible(account);
    this.notifyInbox(account, []);
  }

  private async enforceRetention(account: string, now = Date.now()): Promise<number> {
    const days = this.settings.get().gmailAi.localCacheRetentionDays;
    const cutoff = now - days * 24 * 60 * 60_000;
    return this.emailStore.deleteExpiredEmailData(account, cutoff);
  }

  async fetchMessageBody(emailId: string): Promise<string | null> {
    const credentials = this.vault.reveal();
    const account = this.vault.email;
    if (credentials === null || account === null) return null;
    const email = await this.emailStore.getCachedEmail(account, emailId);
    if (email === null) return null;
    const full = await this.imap.fetchMessage(credentials, email.uid, email.category);
    return full?.bodyText ?? (email.snippet.length > 0 ? email.snippet : null);
  }

  previewAlert(): void {
    this.bus.emit(
      makeEvent({
        source: 'mail',
        kind: 'reply-reminder',
        priority: 'high',
        at: Date.now(),
        subject: `mail-preview:${Date.now()}`,
        text: 'A quick nudge — this is how an important email reminder will appear',
        // Scheduled: the user turned reply reminders on, but not for this
        // moment. Recurring, because the reminder is re-planned and comes back.
        origin: 'scheduled',
        recurring: true,
      }),
    );
  }

  async generateDraft(
    emailId: string,
    tone: GmailTone = 'professional',
  ): Promise<GmailDraftResult> {
    const account = this.vault.email;
    if (account === null) return { ok: false, error: 'No Gmail account connected.' };
    return this.drafts.generate(account, emailId, tone, false);
  }

  async saveGeneratedDraft(
    emailId: string,
    subject: string,
    body: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const credentials = this.vault.reveal();
    const account = this.vault.email;
    if (credentials === null || account === null) {
      return { ok: false, error: 'No Gmail account connected.' };
    }
    const email = await this.emailStore.getCachedEmail(account, emailId);
    if (email === null) return { ok: false, error: 'Email is no longer in the local inbox.' };
    const full = await this.imap.fetchMessage(credentials, email.uid, email.category);
    if (full === null) return { ok: false, error: 'Could not download the source email.' };
    return this.imap.saveDraft(credentials, {
      toEmail: email.replyToAddress || email.fromAddress,
      subject,
      body,
      inReplyTo: full.messageId,
      references: full.threadReferences,
    });
  }

  private notifyInbox(account: string, newEmails: readonly CachedEmail[]): void {
    for (const listener of this.inboxListeners) listener(account, newEmails);
  }

  async fetchUnread(
    limit = 10,
    only: readonly EmailCategory[] = ['primary'],
  ): Promise<GmailFetchResult> {
    const credentials = this.vault.reveal();
    if (!credentials) {
      return { ok: false, error: 'No Gmail account connected. Please add your credentials first.' };
    }

    const result = await this.imap.fetchUnread(credentials, limit, only);
    if (result.ok && result.emails) {
      // Cache emails so generateAndSaveDraft can look them up by uid
      this.emailCache = [...result.emails];
    }
    return result;
  }

  async generateAndSaveDraft(
    emailUid: number,
    tone: GmailTone = 'professional',
  ): Promise<GmailDraftResult> {
    if (!this.settings.get().gmailAi.allowEmailBodyForAiDrafts) {
      return {
        ok: false,
        error: 'Enable “Allow email bodies in AI draft prompts” in Gmail settings first.',
      };
    }
    const credentials = this.vault.reveal();
    if (!credentials) {
      return { ok: false, error: 'No Gmail account connected.' };
    }

    // Look up the email from cache (fetched in the same session)
    let email = this.emailCache.find((entry) => entry.uid === emailUid);
    if (!email) {
      const cached = (await this.listCached({ limit: 100 })).find(
        (entry) => entry.uid === emailUid,
      );
      if (cached !== undefined) {
        email =
          (await this.imap.fetchMessage(credentials, cached.uid, cached.category)) ?? undefined;
      }
    }
    if (!email) {
      return {
        ok: false,
        error: `Email UID ${emailUid} not found. Please refresh your inbox first.`,
      };
    }

    const userName = this.settings.get().userName || 'User';
    const promptInput = buildEmailReplyPrompt({
      fromEmail: email.from,
      subject: email.subject,
      bodyText: email.bodyText,
      userName,
      tone,
    });

    // Use the LLM to generate the draft
    const llmResult = await this.llmClient.generate({
      task: 'draft',
      system: promptInput.system,
      prompt: promptInput.prompt,
    });

    if (!llmResult.ok) {
      return { ok: false, error: `LLM generation failed: ${llmResult.reason}` };
    }

    // Parse the structured JSON response
    const parsed = parseEmailReplyResponse(llmResult.text);
    if (!parsed) {
      // Fall back to using the raw text if JSON parsing fails
      const fallbackDraft = llmResult.text.trim();
      const saveResult = await this.imap.saveDraft(credentials, {
        toEmail: email.from,
        subject: `Re: ${email.subject}`,
        body: fallbackDraft,
        inReplyTo: email.messageId,
        references: email.threadReferences,
      });
      return {
        ok: saveResult.ok,
        draftReply: fallbackDraft,
        suggestedSubject: `Re: ${email.subject}`,
        ...(saveResult.error !== undefined ? { error: saveResult.error } : {}),
      };
    }

    const saveResult = await this.imap.saveDraft(credentials, {
      toEmail: email.from,
      subject: parsed.suggestedSubject || `Re: ${email.subject}`,
      body: parsed.draftReply,
      inReplyTo: email.messageId,
      references: email.threadReferences,
    });

    return {
      ok: saveResult.ok,
      draftReply: parsed.draftReply,
      suggestedSubject: parsed.suggestedSubject,
      ...(saveResult.error !== undefined ? { error: saveResult.error } : {}),
    };
  }

  async saveDraft(request: GmailSaveDraftRequest): Promise<{ ok: boolean; error?: string }> {
    const credentials = this.vault.reveal();
    if (!credentials) {
      return { ok: false, error: 'No Gmail account connected.' };
    }
    return this.imap.saveDraft(credentials, request);
  }
}
