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
  unreadInCategory,
  type CachedEmail,
  type EmailCategory,
} from '@mochi/core';
import type { GmailCredentials } from '../storage/gmail-vault.js';

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
 * Build an RFC-822 MIME message suitable for appending to Gmail Drafts.
 */
function buildRawEmail(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): Buffer {
  const now = new Date().toUTCString();
  const lines: string[] = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Date: ${now}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
  ];
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
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
      const wanted = new Set(only);
      const uids = [
        ...new Set(
          perCategory
            .filter((result) => wanted.has(result.category))
            .flatMap((result) => result.ids),
        ),
      ]
        .sort((a, b) => b - a)
        .slice(0, Math.min(100, Math.max(1, limit)));

      const syncedAt = Date.now();
      const emails: CachedEmail[] = [];
      if (uids.length > 0) {
        for await (const message of client.fetch(
          uids,
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
            envelope?.date instanceof Date
              ? envelope.date.getTime()
              : message.internalDate instanceof Date
                ? message.internalDate.getTime()
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
      const message = error instanceof Error ? error.message : String(error);
      console.error('[gmail-imap] metadata sync failed:', message);
      if (client) {
        try {
          await client.logout();
        } catch {
          /* ignore logout errors */
        }
      }
      return {
        ok: false,
        error: /authentication|535|AUTHENTICATIONFAILED/i.test(message)
          ? 'Authentication failed. Check your Gmail App Password.'
          : `Gmail sync error: ${message}`,
      };
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
      const message = error instanceof Error ? error.message : String(error);
      console.error('[gmail-imap] single-message fetch failed:', message);
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
      const message = error instanceof Error ? error.message : String(error);
      console.error('[gmail-imap] fetch failed:', message);

      // Friendly error messages for common auth failures
      const friendlyError = /authentication|535|AUTHENTICATIONFAILED/i.test(message)
        ? 'Authentication failed. Check your Gmail App Password.'
        : /ENOTFOUND|ECONNREFUSED/i.test(message)
          ? 'Could not reach Gmail. Check your internet connection.'
          : // Category filtering is built on X-GM-RAW, a Gmail-only extension.
            // Anything else answering on this host is not Gmail.
            /X-GM-EXT-1|MissingServerExtension/i.test(message)
            ? 'This server is not Gmail — inbox categories need Gmail’s IMAP extensions.'
            : `Gmail connection error: ${message}`;

      if (client) {
        try {
          await client.logout();
        } catch {
          /* ignore logout errors */
        }
      }
      return { ok: false, error: friendlyError };
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
      const message = error instanceof Error ? error.message : String(error);
      console.error('[gmail-imap] save draft failed:', message);

      if (client) {
        try {
          await client.logout();
        } catch {
          /* ignore */
        }
      }
      return { ok: false, error: `Failed to save draft: ${message}` };
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
      const message = error instanceof Error ? error.message : String(error);
      const friendlyError = /authentication|535|AUTHENTICATIONFAILED/i.test(message)
        ? 'Authentication failed. Make sure IMAP is enabled in Gmail and the App Password is correct.'
        : `Connection error: ${message}`;
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
