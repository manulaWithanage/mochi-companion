import { describe, expect, it } from 'vitest';
import { buildRawEmail } from './gmail-imap.js';

/**
 * These exist for one bug: header values were interpolated into the raw
 * RFC-822 message with no CR/LF sanitisation. A newline in a subject — which
 * arrives from the renderer, an IMAP envelope, or LLM output — ended the
 * header early and let the remainder inject arbitrary headers, or an early
 * blank line that turned attacker text into the message body.
 */

const raw = (opts: Parameters<typeof buildRawEmail>[0]): string =>
  buildRawEmail(opts).toString('utf8');

const base = {
  from: 'me@example.com',
  to: 'you@example.com',
  subject: 'Hello',
  body: 'Body text.',
};

describe('buildRawEmail', () => {
  it('builds a plain draft with headers and body separated by a blank line', () => {
    const message = raw(base);
    const [head, body] = message.split('\r\n\r\n');
    expect(head).toContain('From: me@example.com');
    expect(head).toContain('To: you@example.com');
    expect(head).toContain('Subject: Hello');
    expect(body).toBe('Body text.');
  });

  it('flattens CR/LF out of the subject, so it cannot inject headers', () => {
    const message = raw({ ...base, subject: 'Hi\r\nBcc: victim@example.com\r\n\r\nInjected body' });
    const [head, ...rest] = message.split('\r\n\r\n');
    // 'Bcc:' survives only as inert text inside the Subject line — never as a
    // header of its own — and the body is still the caller's body.
    expect(head).not.toMatch(/^Bcc:/m);
    expect(head).toContain('Subject: Hi Bcc: victim@example.com Injected body');
    expect(rest.join('\r\n\r\n')).toBe('Body text.');
  });

  it('flattens CR/LF out of every header-bound value', () => {
    const message = raw({
      ...base,
      from: 'a@example.com\nX-Evil: 1',
      to: 'b@example.com\rX-Evil: 2',
      inReplyTo: '<id@example.com>\r\nX-Evil: 3',
      references: '<one@example.com>\n<two@example.com>\nX-Evil: 4',
    });
    const [head] = message.split('\r\n\r\n');
    // Nothing an injected line could add survives as its own header.
    expect(head).not.toMatch(/^X-Evil:/m);
  });

  it('leaves the body alone — only headers are single-line by definition', () => {
    const message = raw({ ...base, body: 'Line one.\r\nLine two.' });
    expect(message.endsWith('Line one.\r\nLine two.')).toBe(true);
  });
});
