/**
 * Deterministic-first email priority classification.
 *
 * Rules classify every uncached message for free. Only a small ambiguous
 * batch is allowed to reach the cheap `triage` LLM route.
 */

import {
  buildEmailPriorityPrompt,
  EMAIL_SCORER_VERSION,
  parseEmailPriorityResponse,
  priorityTier,
  scoreEmailPriority,
  shouldEscalatePriority,
  type CachedInboxItem,
  type EmailStore,
  type StoredEmailPriority,
} from '@mochi/core';
import type { GmailCredentials } from '../storage/gmail-vault.js';
import type { SettingsStore } from '../storage/settings-store.js';
import type { GmailImapService } from './gmail-imap.js';
import type { LlmClient } from './llm-client.js';

const LLM_BATCH_LIMIT = 10;

export class EmailTriageService {
  constructor(
    private readonly llm: LlmClient,
    private readonly imap: GmailImapService,
    private readonly store: EmailStore,
    private readonly settings: SettingsStore,
    private readonly getCredentials: () => GmailCredentials | null,
  ) {}

  async classifyInbox(account: string): Promise<void> {
    if (!this.settings.get().gmailAi.priorityEnabled) return;
    const inbox = await this.store.listCachedEmails(account, { limit: 100 });
    const pending = inbox.filter(
      (email) => email.priority === null || email.priority.scorerVersion !== EMAIL_SCORER_VERSION,
    );
    if (pending.length === 0) return;

    const ruleResults = new Map<string, StoredEmailPriority>();
    for (const email of pending) {
      const result = scoreEmailPriority(email, this.settings.get().gmailAi.vipSenders);
      const stored: StoredEmailPriority = {
        ...result,
        account,
        emailId: email.emailId,
        scorerVersion: EMAIL_SCORER_VERSION,
        classifiedAt: Date.now(),
      };
      ruleResults.set(email.emailId, stored);
      await this.store.saveEmailPriority(stored);
    }

    const credentials = this.getCredentials();
    if (credentials === null) return;
    const ambiguous = pending
      .filter((email) => {
        const result = ruleResults.get(email.emailId);
        return result !== undefined && shouldEscalatePriority(result);
      })
      .slice(0, LLM_BATCH_LIMIT);
    if (ambiguous.length === 0) return;

    const promptItems: {
      email: CachedInboxItem;
      snippet: string;
    }[] = [];
    for (const email of ambiguous) {
      const full = await this.imap.fetchMessage(credentials, email.uid, email.category);
      promptItems.push({
        email,
        snippet: full?.bodyText.slice(0, 150) ?? email.snippet,
      });
    }

    const prompt = buildEmailPriorityPrompt(promptItems);
    const response = await this.llm.generate({
      task: 'triage',
      system: prompt.system,
      prompt: prompt.prompt,
    });
    if (!response.ok) return;

    const decisions = parseEmailPriorityResponse(response.text);
    for (const decision of decisions) {
      if (decision.confidence < 0.75) continue;
      const rules = ruleResults.get(decision.id);
      if (rules === undefined) continue;
      const modelScore =
        decision.priority === 'high' ? 0.85 : decision.priority === 'medium' ? 0.55 : 0.2;
      const score = rules.score * 0.4 + modelScore * 0.6;
      await this.store.saveEmailPriority({
        ...rules,
        score,
        tier: priorityTier(score),
        confidence: decision.confidence,
        source: 'blended',
        signals: [...rules.signals, 'llm_refined'],
        reason: decision.reason,
        replyLikely: decision.replyLikely,
        classifiedAt: Date.now(),
      });
    }
  }
}
