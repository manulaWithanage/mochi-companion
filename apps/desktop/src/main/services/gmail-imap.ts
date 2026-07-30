/**
 * Gmail IMAP service.
 *
 * Connects to Gmail over TLS using an App Password (no Google Cloud required).
 * Fetches unread emails from the Primary inbox, parses MIME bodies cleanly,
 * and appends LLM-generated drafts directly to [Gmail]/Drafts.
 *
 * Main process only — never imported by the renderer.
 */

import type { GmailCredentials } from '../storage/gmail-vault.js';

export interface EmailSummary {
  readonly uid: number;
  readonly messageId: string;
  readonly from: string;
  readonly subject: string;
  readonly date: string;
  readonly bodyText: string;
  readonly threadReferences: string;
}

export interface GmailFetchResult {
  readonly ok: boolean;
  readonly emails?: readonly EmailSummary[];
  readonly error?: string;
}

export interface GmailDraftResult {
  readonly ok: boolean;
  readonly error?: string;
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
   * Connect to Gmail and fetch up to `limit` unread emails from Primary inbox.
   * Dynamically imports ImapFlow to keep the module tree clean.
   */
  async fetchUnread(
    credentials: GmailCredentials,
    limit = 10,
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

      // Search for unseen messages in Primary (Gmail's Primary tab).
      // ImapFlow returns `false` rather than throwing when the search itself
      // fails, which is indistinguishable from an empty inbox here.
      const uids = await client.search({ seen: false }, { uid: true });

      // Take the most recent `limit` messages
      const toFetch = (uids === false ? [] : uids).slice(-limit).reverse();

      for (const uid of toFetch) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (msg === false || msg.source === undefined) continue;

        const parsed = await simpleParser(msg.source);

        const fromAddr =
          parsed.from?.text ?? parsed.from?.value?.[0]?.address ?? 'Unknown';
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
        });
      }

      await client.logout();
      return { ok: true, emails };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[gmail-imap] fetch failed:', message);

      // Friendly error messages for common auth failures
      const friendlyError = /authentication|535|AUTHENTICATIONFAILED/i.test(message)
        ? 'Authentication failed. Check your Gmail App Password.'
        : /ENOTFOUND|ECONNREFUSED/i.test(message)
          ? 'Could not reach Gmail. Check your internet connection.'
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
