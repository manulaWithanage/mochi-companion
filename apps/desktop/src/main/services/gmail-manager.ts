/**
 * Gmail manager — wires together GmailVault, GmailImapService and LlmClient
 * into the IPC-callable interface used by ipc.ts.
 *
 * Main process only. Never imported by the renderer.
 */

import type {
  GmailConnectResult,
  GmailDraftResult,
  GmailFetchResult,
  GmailSaveDraftRequest,
  GmailStatus,
  GmailTone,
} from '@mochi/core';
import {
  buildEmailReplyPrompt,
  parseEmailReplyResponse,
} from '@mochi/core';
import { GmailVault } from '../storage/gmail-vault.js';
import { GmailImapService } from './gmail-imap.js';
import type { LlmClient } from './llm-client.js';
import type { SettingsStore } from '../storage/settings-store.js';

export class GmailManager {
  private readonly vault: GmailVault;
  private readonly imap: GmailImapService;
  /** Cache of the last fetched emails for the current session. */
  private emailCache: import('./gmail-imap.js').EmailSummary[] = [];

  constructor(
    private readonly llmClient: LlmClient,
    private readonly settings: SettingsStore,
    vault?: GmailVault,
    imap?: GmailImapService,
  ) {
    this.vault = vault ?? new GmailVault();
    this.imap = imap ?? new GmailImapService();
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
    const test = await this.imap.testConnection({ email: email.trim().toLowerCase(), appPassword: cleanPassword });
    if (!test.ok) {
      return { ok: false, error: test.error };
    }

    const stored = this.vault.store(email, rawAppPassword);
    if (!stored) {
      return { ok: false, error: 'Could not encrypt credentials. This system may not support encrypted storage.' };
    }

    return { ok: true };
  }

  disconnect(): void {
    this.vault.clear();
    this.emailCache = [];
  }

  async fetchUnread(limit = 10): Promise<GmailFetchResult> {
    const credentials = this.vault.reveal();
    if (!credentials) {
      return { ok: false, error: 'No Gmail account connected. Please add your credentials first.' };
    }

    const result = await this.imap.fetchUnread(credentials, limit);
    if (result.ok && result.emails) {
      // Cache emails so generateAndSaveDraft can look them up by uid
      this.emailCache = [...result.emails];
    }
    return result;
  }

  async generateAndSaveDraft(emailUid: number, tone: GmailTone = 'professional'): Promise<GmailDraftResult> {
    const credentials = this.vault.reveal();
    if (!credentials) {
      return { ok: false, error: 'No Gmail account connected.' };
    }

    // Look up the email from cache (fetched in the same session)
    const email = this.emailCache.find((e) => e.uid === emailUid);
    if (!email) {
      return { ok: false, error: `Email UID ${emailUid} not found. Please refresh your inbox first.` };
    }

    const userName = this.settings.get().assistantName ?? 'Mochi User';
    const promptInput = buildEmailReplyPrompt({
      fromEmail: email.from,
      subject: email.subject,
      bodyText: email.bodyText,
      userName,
      tone,
    });

    // Use the LLM to generate the draft
    const llmResult = await this.llmClient.generate({
      task: 'BRIEFING',
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
        error: saveResult.error,
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
      error: saveResult.error,
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
