import { describe, expect, it } from 'vitest';
import { describeImapFailure } from './imap-error.js';

/**
 * The bug these cover: `[gmail-imap] metadata sync failed:` with nothing after
 * the colon, repeating every sync cycle, because Node's AggregateError is an
 * Error whose `message` is the empty string.
 */
describe('describeImapFailure', () => {
  it('reads the reasons out of an AggregateError whose own message is empty', () => {
    const timeout = Object.assign(new Error('connect ETIMEDOUT 142.250.1.109:993'), {
      code: 'ETIMEDOUT',
    });
    const refused = Object.assign(new Error('connect ECONNREFUSED 142.250.1.108:993'), {
      code: 'ECONNREFUSED',
    });
    const aggregate = new AggregateError([timeout, refused]);

    // The precondition. If this ever stops holding, the bug is gone upstream.
    expect(aggregate.message).toBe('');

    const failure = describeImapFailure(aggregate);
    expect(failure.detail).toContain('ETIMEDOUT');
    expect(failure.detail).toContain('ECONNREFUSED');
    expect(failure.kind).toBe('network');
  });

  it('never returns an empty detail, whatever it is handed', () => {
    const inputs: unknown[] = [
      new Error(''),
      new AggregateError([]),
      null,
      undefined,
      '',
      '   ',
      {},
      Object.assign(new Error(''), { name: '' }),
    ];
    for (const input of inputs) {
      expect(describeImapFailure(input).detail.trim().length).toBeGreaterThan(0);
    }
  });

  it('falls back to the constructor name when there is nothing else', () => {
    // An empty message with no code at all still has to say something.
    expect(describeImapFailure(new AggregateError([])).detail).toBe('AggregateError');
  });

  it('classifies an imapflow auth failure by its flag, not by its prose', () => {
    // imapflow throws Error('Command failed') and decorates it. The message
    // says nothing about authentication, which is why the old regex missed it.
    const error = Object.assign(new Error('Command failed'), {
      authenticationFailed: true,
      serverResponseCode: 'AUTHENTICATIONFAILED',
    });

    expect(describeImapFailure(error).kind).toBe('auth');
    expect(describeImapFailure(error, 'Gmail sync error').message).toBe(
      'Authentication failed. Check your Gmail App Password.',
    );
  });

  it('still classifies auth from text when the flag is absent', () => {
    const error = new Error('535-5.7.8 Username and Password not accepted');
    expect(describeImapFailure(error).kind).toBe('auth');
  });

  it('finds an auth flag nested inside an AggregateError', () => {
    const inner = Object.assign(new Error('Command failed'), { authenticationFailed: true });
    expect(describeImapFailure(new AggregateError([inner])).kind).toBe('auth');
  });

  it('recognises a server that is not Gmail', () => {
    const error = new Error('Server does not support X-GM-EXT-1');
    expect(describeImapFailure(error).kind).toBe('not-gmail');
  });

  it('prefers auth over network when an auth failure also mentions a closed connection', () => {
    const error = Object.assign(new Error('Connection closed'), { authenticationFailed: true });
    expect(describeImapFailure(error).kind).toBe('auth');
  });

  it('deduplicates identical reasons', () => {
    // A host resolving to a dozen addresses produces a dozen identical
    // timeouts. Reported once, they leave room for anything else that matters.
    const many = Array.from({ length: 12 }, () =>
      Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    );
    const detail = describeImapFailure(new AggregateError(many)).detail;
    expect(detail.match(/ETIMEDOUT/g)?.length).toBe(2); // once in the message, once as the code
  });

  it('survives a cause cycle', () => {
    const a: Error & { cause?: unknown } = new Error('outer');
    const b: Error & { cause?: unknown } = new Error('inner');
    a.cause = b;
    b.cause = a;
    expect(describeImapFailure(a).detail).toContain('outer');
    expect(describeImapFailure(a).detail).toContain('inner');
  });

  it('caps a long server response', () => {
    const error = new Error('x'.repeat(5000));
    expect(describeImapFailure(error).detail.length).toBeLessThanOrEqual(300);
  });

  it('does not report properties outside the allowlist', () => {
    // The App Password is main-process-only and must never reach a log line,
    // so this reads named fields rather than serialising the error.
    const error = Object.assign(new Error(''), {
      code: 'EAUTH',
      pass: 'abcd efgh ijkl mnop',
      auth: { user: 'someone@gmail.com', pass: 'abcd efgh ijkl mnop' },
    });
    const detail = describeImapFailure(error).detail;
    expect(detail).toContain('EAUTH');
    expect(detail).not.toContain('abcd');
    expect(detail).not.toContain('someone@gmail.com');
  });

  it('handles a thrown non-Error', () => {
    expect(describeImapFailure('socket hang up').detail).toBe('socket hang up');
    expect(describeImapFailure(42).detail).toBe('42');
  });
});

describe('the message shown to the user', () => {
  it('names the failing operation when the cause is unrecognised', () => {
    const failure = describeImapFailure(new Error('something odd'), 'Gmail sync error');
    expect(failure.message).toBe('Gmail sync error: something odd');
  });

  it('keeps the network detail rather than only saying it failed', () => {
    const error = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const failure = describeImapFailure(error, 'Gmail sync error');
    expect(failure.message).toContain('Could not reach Gmail');
    expect(failure.message).toContain('ETIMEDOUT');
  });

  it('stays short when a host resolves to many addresses', () => {
    // Taken from a real failed connect to imap.gmail.com: one reason per
    // resolved address, IPv4 and IPv6. Fine in a log, unreadable in a status
    // bar, so the message is built from the distinct codes instead.
    const addresses = [
      '74.125.206.108:993',
      '2a00:1450:400c:c04::6d:993',
      '74.125.206.109:993',
      '2a00:1450:400c:c04::6c:993',
    ];
    const aggregate = new AggregateError(
      addresses.map((address) =>
        Object.assign(new Error(`connect ETIMEDOUT ${address}`), {
          code: 'ETIMEDOUT',
          syscall: 'connect',
        }),
      ),
    );

    const failure = describeImapFailure(aggregate, 'Gmail sync error');
    expect(failure.message).toBe(
      'Could not reach Gmail (ETIMEDOUT). Check your internet connection.',
    );
    // The log still gets everything, addresses included.
    expect(failure.detail).toContain('74.125.206.108');
  });

  it('never produces a message that trails off after the colon', () => {
    // The original symptom, asserted directly.
    for (const input of [new AggregateError([]), new Error(''), null, undefined]) {
      expect(describeImapFailure(input, 'Gmail sync error').message).not.toMatch(/:\s*$/);
    }
  });
});
