/**
 * Plans reply reminders from the durable inbox and emits them through the
 * single governed event bus. No reminder reaches the overlay directly.
 */

import {
  afterEmailReminderFired,
  EMAIL_REMINDER_PREFIX,
  emailReminderEventPriority,
  makeEvent,
  needsReplyReminder,
  planEmailReminder,
  Scheduler,
  type CachedInboxItem,
  type EmailReminderTiming,
  type EmailReminderState,
  type EmailStore,
  type EventBus,
  type MochiEvent,
} from '@mochi/core';
import type { GmailCredentials } from '../storage/gmail-vault.js';
import type { GmailImapService } from './gmail-imap.js';

const SENT_LOOKBACK_MS = 30 * 24 * 60 * 60_000;
const EVENT_EXPIRY_MS = 30 * 60_000;

interface ScheduledContext {
  readonly email: CachedInboxItem;
  readonly state: EmailReminderState;
}

interface EmailReminderPreferences {
  readonly enabled: boolean;
  readonly timing: EmailReminderTiming;
}

export class EmailReminderService {
  private readonly scheduler: Scheduler;
  private readonly contexts = new Map<string, ScheduledContext>();

  constructor(
    private readonly bus: EventBus,
    private readonly store: EmailStore,
    private readonly imap: GmailImapService,
    private readonly getCredentials: () => GmailCredentials | null,
    private readonly getPreferences: () => EmailReminderPreferences,
  ) {
    this.scheduler = new Scheduler({
      onFire: (event, reason) => {
        if (reason === 'missed') return;
        void this.handleFire(event);
      },
    });
  }

  async reconcile(account: string, now = Date.now()): Promise<void> {
    const preferences = this.getPreferences();
    if (!preferences.enabled) {
      this.contexts.clear();
      this.scheduler.replaceNamespace(EMAIL_REMINDER_PREFIX, []);
      return;
    }
    const inbox = await this.store.listCachedEmails(account, {
      sort: 'priority',
      limit: 100,
    });
    const candidates = inbox.filter(needsReplyReminder);
    if (candidates.length === 0) {
      this.contexts.clear();
      this.scheduler.replaceNamespace(EMAIL_REMINDER_PREFIX, []);
      return;
    }
    const credentials = this.getCredentials();
    const sent = credentials
      ? await this.imap.fetchSentThreadActivity(credentials, new Date(now - SENT_LOOKBACK_MS))
      : [];
    const latestSent = new Map(sent.map((activity) => [activity.threadId, activity.sentAt]));
    const items: {
      key: string;
      at: number;
      event: MochiEvent;
    }[] = [];
    this.contexts.clear();

    for (const email of candidates) {
      const repliedAt = latestSent.get(email.threadId);
      if (repliedAt !== undefined && repliedAt > email.receivedAt) {
        await this.store.saveEmailReminder({
          account,
          emailId: email.emailId,
          threadId: email.threadId,
          state: 'replied',
          nextReminderAt: null,
          lastRemindedAt: email.reminder?.lastRemindedAt ?? null,
          reminderCount: email.reminder?.reminderCount ?? 0,
          snoozedUntil: null,
          dismissedAt: null,
          repliedAt,
        });
        continue;
      }

      const planned = planEmailReminder(email, email.reminder, now, preferences.timing);
      if (planned === null) continue;
      await this.store.saveEmailReminder(planned.state);
      const item = this.scheduledItem(email, planned.state, planned.at);
      items.push(item);
      this.contexts.set(item.event.id, { email, state: planned.state });
    }

    this.scheduler.replaceNamespace(EMAIL_REMINDER_PREFIX, items);
  }

  stop(): void {
    this.scheduler.cancelAll();
    this.contexts.clear();
  }

  async snooze(account: string, emailId: string, until: number): Promise<boolean> {
    const email = await this.store.getCachedEmail(account, emailId);
    if (email === null) return false;
    const existing = email.reminder;
    await this.store.saveEmailReminder({
      account,
      emailId,
      threadId: email.threadId,
      state: existing?.state === 'draft-ready' ? 'draft-ready' : 'pending',
      nextReminderAt: until,
      lastRemindedAt: existing?.lastRemindedAt ?? null,
      reminderCount: existing?.reminderCount ?? 0,
      snoozedUntil: until,
      dismissedAt: null,
      repliedAt: null,
    });
    this.scheduler.cancel(this.keyFor(email));
    await this.reconcile(account);
    return true;
  }

  async dismissEmail(account: string, emailId: string, at = Date.now()): Promise<boolean> {
    const email = await this.store.getCachedEmail(account, emailId);
    if (email === null) return false;
    await this.dismiss(email, at);
    return true;
  }

  async dismissThread(account: string, threadId: string, at = Date.now()): Promise<void> {
    const inbox = await this.store.listCachedEmails(account, { limit: 100 });
    for (const email of inbox) {
      if (email.threadId === threadId) await this.dismiss(email, at);
    }
  }

  private scheduledItem(
    email: CachedInboxItem,
    state: EmailReminderState,
    at: number,
  ): { key: string; at: number; event: MochiEvent } {
    const key = this.keyFor(email);
    return {
      key,
      at,
      event: makeEvent({
        id: `mail:reply:${email.emailId}:${state.reminderCount}`,
        source: 'mail',
        kind: 'reply-reminder',
        priority: emailReminderEventPriority(email.priority?.tier ?? 'low'),
        at,
        subject: `mail-thread:${email.threadId}`,
        text: 'A quick nudge — an important email may be waiting for your reply',
        expiresAt: at + EVENT_EXPIRY_MS,
      }),
    };
  }

  private keyFor(email: Pick<CachedInboxItem, 'account' | 'emailId'>): string {
    return `${EMAIL_REMINDER_PREFIX}${email.account}:${email.emailId}`;
  }

  private async dismiss(email: CachedInboxItem, at: number): Promise<void> {
    await this.store.saveEmailReminder({
      account: email.account,
      emailId: email.emailId,
      threadId: email.threadId,
      state: 'dismissed',
      nextReminderAt: null,
      lastRemindedAt: email.reminder?.lastRemindedAt ?? null,
      reminderCount: email.reminder?.reminderCount ?? 0,
      snoozedUntil: null,
      dismissedAt: at,
      repliedAt: null,
    });
    this.scheduler.cancel(this.keyFor(email));
  }

  private async handleFire(event: MochiEvent): Promise<void> {
    const context = this.contexts.get(event.id);
    if (context === undefined || context.email.priority === null) return;
    this.contexts.delete(event.id);

    const preferences = this.getPreferences();
    if (!preferences.enabled) return;
    const next = afterEmailReminderFired(
      context.state,
      context.email.priority.tier,
      Date.now(),
      preferences.timing,
    );
    await this.store.saveEmailReminder(next);
    this.bus.emit(event);

    if (next.nextReminderAt !== null) {
      const item = this.scheduledItem(context.email, next, next.nextReminderAt);
      this.contexts.set(item.event.id, { email: context.email, state: next });
      this.scheduler.schedule(item);
    }
  }
}
