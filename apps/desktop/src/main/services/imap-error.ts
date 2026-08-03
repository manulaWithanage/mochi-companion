/**
 * Turning an IMAP failure into something a human can act on.
 *
 * This exists because of a real dead end. Gmail sync failed on a loop and
 * logged:
 *
 *     [gmail-imap] metadata sync failed:
 *     [gmail-sync] startup failed: Gmail sync error:
 *
 * Nothing after the colon. The logging was not at fault — it read
 * `error.message`, which is the correct thing to read. The problem is that
 * Node's AggregateError, which is exactly what a socket connect failure
 * produces once every resolved address has been tried, is an `instanceof
 * Error` whose `message` is the empty string. The real reasons were sitting
 * in `.errors[].code`, unread.
 *
 * Two consequences, both addressed here:
 *
 *  1. A repeating failure reported nothing at all — in a codebase that has
 *     been bitten more than once by a broken state that looks exactly like
 *     "nothing happened".
 *
 *  2. Auth failures were detected by regex over the message text, and an
 *     empty string matches no regex. So a wrong App Password — the one
 *     failure the user can actually do something about — was reported as a
 *     generic connection error.
 *
 * Properties are read by name rather than by dumping the error object.
 * That is deliberate: the Gmail App Password lives in the main process and
 * must never reach a log line, so this never serialises an object whose
 * contents it has not decided on.
 */

export type ImapFailureKind = 'auth' | 'network' | 'not-gmail' | 'unknown';

export interface ImapFailure {
  readonly kind: ImapFailureKind;
  /** The technical reason, for logs. Human-readable and **never** empty — that is the whole point. */
  readonly detail: string;
  /** What the user is shown. Also never empty, and never trails off after a colon. */
  readonly message: string;
}

/**
 * Error properties worth reporting, in the order they read best.
 *
 * An allowlist rather than "everything enumerable": imapflow attaches the
 * command it was running to some errors, and a credential must never be one
 * unlucky property name away from a log file.
 */
const REPORTED_KEYS = [
  'code',
  'serverResponseCode',
  'responseText',
  'response',
  'hostname',
] as const;

/** Long enough to diagnose, short enough not to flood a log with server prose. */
const MAX_DETAIL = 300;

/**
 * The user-facing form is much shorter.
 *
 * A real connect failure carries one reason per resolved address — six lines
 * of IPv4 and IPv6 for Gmail alone. That belongs in a log, not in a status
 * bar, so `message` is built from the distinct error codes instead.
 */
const MAX_SUMMARY = 120;

/** Guards against a cause/errors cycle and against unbounded nesting. */
const MAX_DEPTH = 3;

interface Gathered {
  readonly parts: string[];
  readonly codes: string[];
  authFlagged: boolean;
}

function gather(error: unknown, depth: number, seen: Set<object>, into: Gathered): void {
  if (error === null || error === undefined || depth > MAX_DEPTH) return;

  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed.length > 0) into.parts.push(trimmed);
    return;
  }
  if (typeof error !== 'object') {
    into.parts.push(String(error));
    return;
  }
  if (seen.has(error)) return;
  seen.add(error);

  const record = error as Record<string, unknown>;
  const before = into.parts.length;

  if (record['authenticationFailed'] === true) into.authFlagged = true;

  const message = typeof record['message'] === 'string' ? record['message'].trim() : '';
  if (message.length > 0) into.parts.push(message);

  for (const key of REPORTED_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) into.parts.push(value.trim());
  }

  // Tracked separately as well as reported: the code is the one part short
  // enough to show someone without burying the sentence around it.
  const code = record['code'];
  if (typeof code === 'string' && code.trim().length > 0) into.codes.push(code.trim());

  // AggregateError holds the reasons that matter here and has an empty
  // message of its own. Node produces one per connect attempt when a host
  // resolves to several addresses and none of them answer.
  const inner = record['errors'];
  if (Array.isArray(inner)) {
    for (const each of inner) gather(each, depth + 1, seen, into);
  }

  if (record['cause'] !== undefined) gather(record['cause'], depth + 1, seen, into);

  // Last resort. "AggregateError" alone is a poor report, but it is a report,
  // and it beats a line that trails off after the colon.
  if (into.parts.length === before) {
    const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
    into.parts.push(name.length > 0 ? name : 'Error');
  }
}

const AUTH_TEXT =
  /authenticationfailed|authentication failed|\b535\b|invalid credentials|application-specific password|web login required/i;
const NETWORK_TEXT =
  /etimedout|econnrefused|enotfound|eai_again|ehostunreach|enetunreach|econnreset|econnaborted|epipe|socket timeout|connection closed|connection not available|timed out|getaddrinfo/i;
const NOT_GMAIL_TEXT = /x-gm-ext-1|missingserverextension/i;

/**
 * Describe an IMAP failure without ever returning an empty string.
 *
 * Auth is checked on imapflow's `authenticationFailed` flag before falling
 * back to matching text, so classification no longer depends on the server
 * having phrased its rejection the way a regex expects.
 *
 * `context` names the operation that failed. It is only used when nothing
 * else could be determined, so an unclassified error still says which part of
 * Gmail sync gave up rather than only what went wrong.
 */
export function describeImapFailure(error: unknown, context = 'Gmail error'): ImapFailure {
  const gathered: Gathered = { parts: [], codes: [], authFlagged: false };
  gather(error, 0, new Set(), gathered);

  // Deduplicated: twenty addresses timing out should read as one ETIMEDOUT,
  // not twenty, and the useful part must survive the length cap.
  const parts = [...new Set(gathered.parts)];
  const codes = [...new Set(gathered.codes)];

  const joined = parts.join('; ');
  const detail =
    joined.length > MAX_DETAIL ? `${joined.slice(0, MAX_DETAIL - 1)}…` : joined || 'Unknown error';

  const short = codes.length > 0 ? codes.join(', ') : (parts[0] ?? 'Unknown error');
  const summary = short.length > MAX_SUMMARY ? `${short.slice(0, MAX_SUMMARY - 1)}…` : short;

  const kind: ImapFailureKind = gathered.authFlagged
    ? 'auth'
    : AUTH_TEXT.test(detail)
      ? 'auth'
      : NOT_GMAIL_TEXT.test(detail)
        ? 'not-gmail'
        : NETWORK_TEXT.test(detail)
          ? 'network'
          : 'unknown';

  return { kind, detail, message: userMessage(kind, summary, context) };
}

/**
 * A reason is kept even for recognised failures. "Could not reach Gmail" on
 * its own is exactly the kind of message that leaves someone with no next
 * step; "(ETIMEDOUT)" tells them whether to look at their firewall or their
 * password.
 */
function userMessage(kind: ImapFailureKind, summary: string, context: string): string {
  switch (kind) {
    case 'auth':
      return 'Authentication failed. Check your Gmail App Password.';
    case 'not-gmail':
      return 'This server is not Gmail — inbox categories need Gmail’s IMAP extensions.';
    case 'network':
      return `Could not reach Gmail (${summary}). Check your internet connection.`;
    case 'unknown':
      return `${context}: ${summary}`;
  }
}
