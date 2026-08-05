/**
 * Deep links into Gmail.
 *
 * Mochi could tell you an email needed a reply and had no way to take you to it.
 * You read the subject, pressed Draft reply, it saved into Gmail Drafts — and
 * then you went and found it yourself. Identifying work without handing you to it
 * leaves the loop open.
 *
 * **The id is validated, not trusted.** A thread id arrives from an IMAP server
 * as `X-GM-THRID`, which is remote input, and it ends up inside a URL that gets
 * opened on the user's machine. Gmail's ids are plain hex, so anything else is
 * refused rather than escaped — there is no legitimate thread id containing a
 * slash, a quote or a scheme, and guessing what a malformed one meant is how a
 * link becomes an attack.
 *
 * Returns null rather than a best guess, the same rule the calendar's conference
 * links follow.
 */

/** Gmail's `X-GM-THRID` is a 64-bit integer, rendered as hex. */
const THREAD_ID = /^[0-9a-f]{1,20}$/i;

/**
 * The conversation, in the Gmail web client.
 *
 * `#all/` rather than `#inbox/` so the link still resolves after the thread has
 * been archived — an email you dealt with is exactly the one you might want to
 * look back at.
 */
export function gmailThreadUrl(threadId: string, accountIndex = 0): string | null {
  if (!THREAD_ID.test(threadId.trim())) return null;
  const index = Number.isInteger(accountIndex) && accountIndex >= 0 ? accountIndex : 0;
  return `https://mail.google.com/mail/u/${index}/#all/${threadId.trim().toLowerCase()}`;
}

/** The Drafts folder, for after Mochi has written one. */
export function gmailDraftsUrl(accountIndex = 0): string {
  const index = Number.isInteger(accountIndex) && accountIndex >= 0 ? accountIndex : 0;
  return `https://mail.google.com/mail/u/${index}/#drafts`;
}
