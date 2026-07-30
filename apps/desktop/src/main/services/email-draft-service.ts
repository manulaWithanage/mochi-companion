/**
 * Local email draft generation and bounded background queue.
 *
 * Generated text is persisted locally. This service never writes to Gmail;
 * saving to Gmail Drafts remains an explicit user action.
 */

import {
  buildEmailReplyPrompt,
  parseEmailReplyResponse,
  type EmailStore,
  type GmailDraftResult,
  type GmailTone,
} from '@mochi/core';
import type { GmailCredentials } from '../storage/gmail-vault.js';
import type { SettingsStore } from '../storage/settings-store.js';
import type { GmailImapService } from './gmail-imap.js';
import type { LlmClient } from './llm-client.js';

export class EmailDraftService {
  private readonly queued = new Set<string>();
  private readonly active = new Set<string>();
  private running = false;

  constructor(
    private readonly llm: LlmClient,
    private readonly imap: GmailImapService,
    private readonly store: EmailStore,
    private readonly settings: SettingsStore,
    private readonly getCredentials: () => GmailCredentials | null,
    private readonly onChanged: (account: string) => void,
  ) {}

  async generate(
    account: string,
    emailId: string,
    tone: GmailTone,
    background = false,
  ): Promise<GmailDraftResult> {
    try {
      return await this.generateInternal(account, emailId, tone, background);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Draft generation failed.';
      await this.fail(account, emailId, message).catch(() => undefined);
      return { ok: false, error: message };
    }
  }

  private async generateInternal(
    account: string,
    emailId: string,
    tone: GmailTone,
    background: boolean,
  ): Promise<GmailDraftResult> {
    if (!this.settings.get().gmailAi.allowEmailBodyForAiDrafts) {
      return {
        ok: false,
        error: 'Enable “Allow email bodies in AI draft prompts” in Gmail settings first.',
      };
    }
    const credentials = this.getCredentials();
    const email = await this.store.getCachedEmail(account, emailId);
    if (credentials === null || email === null) {
      return { ok: false, error: 'Email is no longer available in the local inbox.' };
    }

    await this.store.saveEmailDraft({
      account,
      emailId,
      status: 'generating',
      subject: null,
      body: null,
      error: null,
    });
    this.onChanged(account);

    const full = await this.imap.fetchMessage(credentials, email.uid, email.category);
    if (full === null) {
      await this.fail(account, emailId, 'Could not download the email body.');
      return { ok: false, error: 'Could not download the email body.' };
    }

    const prompt = buildEmailReplyPrompt({
      fromEmail: email.replyToAddress || email.fromAddress,
      subject: email.subject,
      bodyText: full.bodyText,
      userName: this.settings.get().assistantName ?? 'Mochi User',
      tone,
    });
    const result = await this.llm.generate({
      task: background ? 'background-draft' : 'draft',
      system: prompt.system,
      prompt: prompt.prompt,
    });
    if (!result.ok) {
      await this.fail(account, emailId, result.reason);
      return { ok: false, error: result.reason };
    }

    const parsed = parseEmailReplyResponse(result.text);
    const draftReply = parsed?.draftReply ?? result.text.trim();
    const suggestedSubject = parsed?.suggestedSubject || `Re: ${email.subject}`;
    if (draftReply.length === 0) {
      await this.fail(account, emailId, 'The model returned an empty draft.');
      return { ok: false, error: 'The model returned an empty draft.' };
    }

    await this.store.saveEmailDraft({
      account,
      emailId,
      status: 'ready',
      subject: suggestedSubject,
      body: draftReply,
      error: null,
    });
    if (email.reminder !== null && email.reminder.state === 'pending') {
      await this.store.saveEmailReminder({ ...email.reminder, state: 'draft-ready' });
    }
    this.onChanged(account);
    return { ok: true, draftReply, suggestedSubject };
  }

  enqueueEligible(account: string): void {
    const preferences = this.settings.get().gmailAi;
    if (!preferences.backgroundDraftsEnabled || !preferences.allowEmailBodyForAiDrafts) return;
    void this.collect(account);
  }

  stop(): void {
    this.queued.clear();
  }

  private async collect(account: string): Promise<void> {
    const limit = this.settings.get().gmailAi.maxBackgroundDraftsPerSync;
    if (limit <= 0) return;
    const inbox = await this.store.listCachedEmails(account, {
      sort: 'priority',
      limit: 100,
    });
    for (const email of inbox) {
      if (
        this.queued.size >= limit ||
        email.priority?.tier !== 'urgent' ||
        !email.priority.replyLikely ||
        email.priority.confidence < 0.8 ||
        this.active.has(email.emailId) ||
        (email.draft !== null && email.draft.status !== 'failed' && email.draft.status !== 'none')
      ) {
        continue;
      }
      this.queued.add(email.emailId);
    }
    void this.drain(account);
  }

  private async drain(account: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queued.size > 0) {
        const emailId = this.queued.values().next().value as string | undefined;
        if (emailId === undefined) break;
        this.queued.delete(emailId);
        this.active.add(emailId);
        try {
          await this.generate(account, emailId, this.settings.get().gmailAi.defaultDraftTone, true);
        } finally {
          this.active.delete(emailId);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async fail(account: string, emailId: string, error: string): Promise<void> {
    await this.store.saveEmailDraft({
      account,
      emailId,
      status: 'failed',
      subject: null,
      body: null,
      error,
    });
    this.onChanged(account);
  }
}
