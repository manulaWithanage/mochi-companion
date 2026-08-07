/**
 * Gmail IMAP service.
 *
 * Connects to Gmail over TLS using an App Password (no Google Cloud required).
 * Fetches unread emails from the Primary inbox, parses MIME bodies cleanly,
 * and appends LLM-generated drafts directly to [Gmail]/Drafts.
 *
 * Main process only — never imported by the renderer.
 */

import {
  assignCategories,
  CATEGORY_IDS,
  selectNewestInboxUids,
  unreadInCategory,
  type CachedEmail,
  type EmailCategory,
} from '@mochi/core';
import type { GmailCredentials } from '../storage/gmail-vault.js';
import { describeImapFailure } from './imap-error.js';

export interface EmailSummary {
  readonly uid: number;
  readonly messageId: string;
  readonly from: string;
  readonly subject: string;
  readonly date: string;
  readonly bodyText: string;
  readonly threadReferences: string;
  /** Which inbox tab Gmail filed this under. */
  readonly category: EmailCategory;
}

export interface GmailFetchResult {
  readonly ok: boolean;
  readonly emails?: readonly EmailSummary[];
  readonly error?: string;
  /**
   * Unread counts per category across the whole inbox, not just the messages
   * returned. The filter chips need to show "Promotions 34" while only a
   * handful of bodies were downloaded.
   */
  readonly counts?: readonly { readonly category: EmailCategory; readonly count: number }[];
}

export interface GmailDraftResult {
  readonly ok: boolean;
  readonly error?: string;
}

export type GmailInboxSnapshotResult =
  | {
      readonly ok: true;
      readonly emails: readonly CachedEmail[];
      readonly uidValidity: string;
      readonly counts: readonly { readonly category: EmailCategory; readonly count: number }[];
    }
  | { readonly ok: false; readonly error: string };

export interface SentThreadActivity {
  readonly threadId: string;
  readonly sentAt: number;
}

/**
 * Strip HTML tags and collapse whitespace for a clean plain-text body.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Truncate body to a sensible length for LLM context.
 * Strips quoted reply chains (lines starting with >) to avoid feeding
 * ancient history into the prompt.
 */
function cleanBody(raw: string): string {
  const lines = raw.split('\n').filter((l) => !l.trim().startsWith('>'));
  const text = lines.join('\n').trim();
  return text.length > 3000 ? text.slice(0, 3000) + '\n[... truncated]' : text;
}

/**
 * Flatten a value destined for an RFC-822 header onto a single line.
 *
 * A CR or LF here would end the header and let the rest of the value inject
 * arbitrary headers — or an early blank line, turning attacker text into the
 * message body. None of the values that reach a header are trusted: the
 * subject comes from the renderer, addresses come from IMAP envelopes and
 * mailparser, and suggested subjects come from LLM output. Sanitised at the
 * message-building level so every call site is covered.
 */
function headerValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build an RFC-822 MIME message suitable for appending to Gmail Drafts.
 *
 * Exported for tests; production callers go through GmailImapService.
 */
export function buildRawEmail(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): Buffer {
  const now = new Date().toUTCString();
  const lines: string[] = [
    `From: ${headerValue(opts.from)}`,
    `To: ${headerValue(opts.to)}`,
    `Subject: ${headerValue(opts.subject)}`,
    `Date: ${now}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
  ];
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${headerValue(opts.inReplyTo)}`);
  if (opts.references) lines.push(`References: ${headerValue(opts.references)}`);
  lines.push('', opts.body);
  return Buffer.from(lines.join('\r\n'), 'utf8');
}

export class GmailImapService {
  /**
   * Fetch a durable, metadata-only view of the newest unread inbox messages.
   *
   * Unlike fetchUnread(), this does not download complete RFC-822 bodies.
   * It is safe to run on startup and during periodic reconciliation.
   */
  async fetchInboxSnapshot(
    credentials: GmailCredentials,
    limit = 100,
    only: readonly EmailCategory[] = CATEGORY_IDS,
  ): Promise<GmailInboxSnapshotResult> {
    let client: import('imapflow').ImapFlow | null = null;
    try {
      const { ImapFlow } = await import('imapflow');
      client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user: credentials.email,
          pass: credentials.appPassword,
        },
        logger: false,
      });

      await client.connect();
      const mailbox = await client.mailboxOpen('INBOX');
      const unread = await client.search({ seen: false }, { uid: true });
      const unreadUids = unread === false ? [] : unread;

      const perCategory: { category: EmailCategory; ids: readonly number[] }[] = [];
      for (const category of CATEGORY_IDS) {
        const found = await client.search({ gmraw: unreadInCategory(category) }, { uid: true });
        perCategory.push({ category, ids: found === false ? [] : found });
      }

      const categoryOf = assignCategories(perCategory);
      const counts = perCategory.map((result) => ({
        category: result.category,
        count: result.ids.length,
      }));
      const uids = selectNewestInboxUids(unreadUids, categoryOf, only, limit);

      const syncedAt = Date.now();
      const emails: CachedEmail[] = [];
      if (uids.length > 0) {
        for await (const message of client.fetch(
          [...uids],
          {
            uid: true,
            envelope: true,
            flags: true,
            labels: true,
            threadId: true,
            internalDate: true,
          },
          { uid: true },
        )) {
          const envelope = message.envelope;
          const from = envelope?.from?.[0];
          const replyTo = envelope?.replyTo?.[0] ?? from;
          const fromAddress = from?.address?.trim().toLowerCase() ?? '';
          const received =
            message.internalDate instanceof Date
              ? message.internalDate.getTime()
              : envelope?.date instanceof Date
                ? envelope.date.getTime()
                : syncedAt;
          const messageId = envelope?.messageId ?? `uid-${message.uid}`;

          emails.push({
            account: credentials.email,
            emailId: message.emailId ?? `${mailbox.uidValidity.toString()}:${message.uid}`,
            threadId: message.threadId ?? message.emailId ?? messageId,
            uid: message.uid,
            messageId,
            fromName: from?.name?.trim() ?? '',
            fromAddress,
            replyToAddress: replyTo?.address?.trim().toLowerCase() ?? fromAddress,
            toAddresses: (envelope?.to ?? [])
              .map((address) => address.address?.trim().toLowerCase() ?? '')
              .filter((address) => address.length > 0),
            ccAddresses: (envelope?.cc ?? [])
              .map((address) => address.address?.trim().toLowerCase() ?? '')
              .filter((address) => address.length > 0),
            subject: envelope?.subject ?? '(no subject)',
            receivedAt: received,
            category: categoryOf.get(message.uid) ?? 'primary',
            labels: [...(message.labels ?? [])],
            snippet: '',
            unread: !(message.flags?.has('\\Seen') ?? false),
            inInbox: true,
            syncedAt,
          });
        }
      }

      await client.logout();
      emails.sort((a, b) => b.receivedAt - a.receivedAt);
      return {
        ok: true,
        emails,
        uidValidity: mailbox.uidValidity.toString(),
        counts,
      };
    } catch (error) {
      const failure = describeImapFailure(error, 'Gmail sync error');
      console.error('[gmail-imap] metadata sync failed:', failure.detail);
      if (client) {
        try {
          await client.logout();
        } catch {
          /* ignore logout errors */
        }
      }
      return { ok: false, error: failure.message };
    }
  }

  /** Download and parse one complete message after the user opens or drafts it. */
  async fetchMessage(
    credentials: GmailCredentials,
    uid: number,
    category: EmailCategory,
  ): Promise<EmailSummary | null> {
    let client: import('imapflow').ImapFlow | null = null;
    try {
      const { ImapFlow } = await import('imapflow');
      const { simpleParser } = await import('mailparser');
      client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user: credentials.email,
          pass: credentials.appPassword,
        },
        logger: false,
      });
      await client.connect();
      await client.mailboxOpen('INBOX');
      const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (message === false || message.source === undefined) {
        await client.logout();
        return null;
      }

      const parsed = await simpleParser(message.source);
      const from = parsed.from?.text ?? parsed.from?.value?.[0]?.address ?? 'Unknown';
      const messageId = parsed.messageId ?? `uid-${uid}`;
      const references = Array.isArray(parsed.references)
        ? parsed.references.join(' ')
        : (parsed.references ?? '');
      const bodyText = parsed.text
        ? cleanBody(parsed.text)
        : parsed.html
          ? cleanBody(stripHtml(parsed.html))
          : '';

      await client.logout();
      return {
        uid,
        messageId,
        from,
        subject: parsed.subject ?? '(no subject)',
        date: parsed.date?.toISOString() ?? new Date().toISOString(),
        bodyText,
        threadReferences: `${references} ${messageId}`.trim(),
        category,
      };
    } catch (error) {
      console.error('[gmail-imap] single-message fetch failed:', describeImapFailure(error).detail);
      if (client) {
        try {
          await client.logout();
        } catch {
          /* ignore logout errors */
        }
      }
      return null;
    }
  }

  /** Retrieve recent sent-thread timestamps without downloading sent bodies. */
  async fetchSentThreadActivity(
    credentials: GmailCredentials,
    since: Date,
    limit = 200,
  ): Promise<readonly SentThreadActivity[]> {
    let client: import('imapflow').ImapFlow | null = null;
    try {
      const { ImapFlow } = await import('imapflow');
      client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user: credentials.email,
          pass: credentials.appPassword,
        },
        logger: false,
      });
      await client.connect();
      const mailboxes = await client.list();
      const sentPath =
        mailboxes.find((mailbox) => mailbox.specialUse === '\\Sent')?.path ?? '[Gmail]/Sent Mail';
      await client.mailboxOpen(sentPath);
      const found = await client.search({ since }, { uid: true });
      const uids = (found === false ? [] : found)
        .sort((a, b) => b - a)
        .slice(0, Math.min(500, Math.max(1, limit)));
      const latest = new Map<string, number>();

      if (uids.length > 0) {
        for await (const message of client.fetch(
          uids,
          { uid: true, threadId: true, envelope: true, internalDate: true },
          { uid: true },
        )) {
          if (message.threadId === undefined) continue;
          const sentAt =
            message.envelope?.date instanceof Date
              ? message.envelope.date.getTime()
              : message.internalDate instanceof Date
                ? message.internalDate.getTime()
                : 0;
          if (sentAt > (latest.get(message.threadId) ?? 0)) {
            latest.set(message.threadId, sentAt);
          }
        }
      }

      await client.logout();
      return [...latest].map(([threadId, sentAt]) => ({ threadId, sentAt }));
    } catch (error) {
      console.error('[gmail-imap] sent-thread sync failed:', describeImapFailure(error).detail);
      if (client) {
        try {
          await client.logout();
        } catch {
          /* ignore logout errors */
        }
      }
      return [];
    }
  }

  /**
   * Connect to Gmail and fetch up to `limit` unread emails.
   *
   * `only` restricts which inbox tabs are downloaded, defaulting to Primary.
   * That default is a performance decision as much as a product one: every
   * message costs a full RFC822 download plus a MIME parse, and on a normal
   * account most unread mail is promotions. Categorising first turns a
   * fourteen-body fetch into a three-body fetch.
   *
   * Dynamically imports ImapFlow to keep the module tree clean.
   */
  async fetchUnread(
    credentials: GmailCredentials,
    limit = 10,
    only: readonly EmailCategory[] = ['primary'],
  ): Promise<GmailFetchResult> {
    let client: import('imapflow').ImapFlow | null = null;
    try {
      const { ImapFlow } = await import('imapflow');
      const { simpleParser } = await import('mailparser');

      client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user: credentials.email,
          pass: credentials.appPassword,
        },
        logger: false,
      });

      await client.connect();

      const emails: EmailSummary[] = [];

      await client.mailboxOpen('INBOX');

      // One UID search per category, via the X-GM-RAW extension. UID lists are
      // cheap; message bodies are not, which is why this happens before any
      // fetch. ImapFlow returns `false` rather than throwing when a search
      // fails, and that is indistinguishable from an empty result here.
      const perCategory: { category: EmailCategory; ids: readonly number[] }[] = [];
      for (const category of CATEGORY_IDS) {
        const found = await client.search({ gmraw: unreadInCategory(category) }, { uid: true });
        perCategory.push({ category, ids: found === false ? [] : found });
      }

      const categoryOf = assignCategories(perCategory);
      const counts = perCategory.map((r) => ({ category: r.category, count: r.ids.length }));

      // Newest first, restricted to the requested tabs, then capped. Capping
      // last means `limit` counts messages the user will actually see rather
      // than being spent on promotions that get filtered out.
      const wanted = new Set(only);
      const toFetch = perCategory
        .filter((r) => wanted.has(r.category))
        .flatMap((r) => r.ids)
        .sort((a, b) => b - a)
        .slice(0, limit);

      for (const uid of toFetch) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (msg === false || msg.source === undefined) continue;

        const parsed = await simpleParser(msg.source);

        const fromAddr = parsed.from?.text ?? parsed.from?.value?.[0]?.address ?? 'Unknown';
        const subject = parsed.subject ?? '(no subject)';
        const messageId = parsed.messageId ?? `uid-${uid}`;
        const date = parsed.date?.toISOString() ?? new Date().toISOString();
        const references = Array.isArray(parsed.references)
          ? parsed.references.join(' ')
          : (parsed.references ?? '');

        let bodyText = '';
        if (parsed.text) {
          bodyText = cleanBody(parsed.text);
        } else if (parsed.html) {
          bodyText = cleanBody(stripHtml(parsed.html));
        }

        emails.push({
          uid,
          messageId,
          from: fromAddr,
          subject,
          date,
          bodyText,
          threadReferences: `${references} ${messageId}`.trim(),
          // Every fetched uid came out of a category search, so the lookup
          // hits; primary is the safe fallback because it is the only tab
          // Mochi will interrupt about, and guessing it wrong would either
          // silence a real email or promote a newsletter.
          category: categoryOf.get(uid) ?? 'primary',
        });
      }

      await client.logout();
      return { ok: true, emails, counts };
    } catch (error) {
      // Auth, unreachable-host and not-actually-Gmail are all told apart by
      // describeImapFailure — including the case where the error carries no
      // message at all, which is what a failed connect actually looks like.
      const failure = describeImapFailure(error, 'Gmail connection error');
      console.error('[gmail-imap] fetch failed:', failure.detail);

      if (client) {
        try {
          await client.logout();
        } catch {
          /* ignore logout errors */
        }
      }
      return { ok: false, error: failure.message };
    }
  }

  /**
   * Append an LLM-generated reply draft to [Gmail]/Drafts.
   * The draft appears natively in the user's Gmail Drafts folder.
   */
  async saveDraft(
    credentials: GmailCredentials,
    opts: {
      toEmail: string;
      subject: string;
      body: string;
      inReplyTo?: string;
      references?: string;
    },
  ): Promise<GmailDraftResult> {
    let client: import('imapflow').ImapFlow | null = null;
    try {
      const { ImapFlow } = await import('imapflow');

      client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user: credentials.email,
          pass: credentials.appPassword,
        },
        logger: false,
      });

      await client.connect();

      const rawEmail = buildRawEmail({
        from: credentials.email,
        to: opts.toEmail,
        subject: opts.subject.startsWith('Re:') ? opts.subject : `Re: ${opts.subject}`,
        body: opts.body,
        // Spread rather than assign: exactOptionalPropertyTypes distinguishes
        // "absent" from "present and undefined", and these headers must be
        // omitted entirely when there is no thread to reply into.
        ...(opts.inReplyTo !== undefined ? { inReplyTo: opts.inReplyTo } : {}),
        ...(opts.references !== undefined ? { references: opts.references } : {}),
      });

      await client.append('[Gmail]/Drafts', rawEmail, ['\\Draft'], new Date());
      await client.logout();

      return { ok: true };
    } catch (error) {
      const failure = describeImapFailure(error, 'Failed to save draft');
      console.error('[gmail-imap] save draft failed:', failure.detail);

      if (client) {
        try {
          await client.logout();
        } catch {
          /* ignore */
        }
      }
      return { ok: false, error: failure.message };
    }
  }

  /**
   * Quick connectivity test — connects, opens INBOX, disconnects.
   * Used to validate credentials before saving them.
   */
  async testConnection(credentials: GmailCredentials): Promise<{ ok: boolean; error?: string }> {
    let client: import('imapflow').ImapFlow | null = null;
    try {
      const { ImapFlow } = await import('imapflow');
      client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user: credentials.email, pass: credentials.appPassword },
        logger: false,
      });
      await client.connect();
      await client.mailboxOpen('INBOX');
      await client.logout();
      return { ok: true };
    } catch (error) {
      // Deliberately not the shared auth wording. This runs while the user is
      // setting the account up, when "IMAP is switched off" is as likely as a
      // mistyped password and is the harder of the two to guess at.
      const failure = describeImapFailure(error, 'Connection error');
      const friendlyError =
        failure.kind === 'auth'
          ? 'Authentication failed. Make sure IMAP is enabled in Gmail and the App Password is correct.'
          : failure.message;
      if (client) {
        try {
          await client.logout();
        } catch {
          /* ignore */
        }
      }
      return { ok: false, error: friendlyError };
    }
  }
}
