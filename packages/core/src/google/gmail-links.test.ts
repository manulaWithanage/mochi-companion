import { describe, expect, it } from 'vitest';
import { gmailDraftsUrl, gmailThreadUrl } from './gmail-links.js';

/**
 * A thread id arrives from an IMAP server and ends up inside a URL opened on the
 * user's machine. That is remote input reaching an action, so it is validated
 * rather than escaped: Gmail ids are plain hex and anything else is refused.
 */

describe('gmailThreadUrl', () => {
  it('builds a link to the conversation', () => {
    expect(gmailThreadUrl('18c9a2f4b1e07d3a')).toBe(
      'https://mail.google.com/mail/u/0/#all/18c9a2f4b1e07d3a',
    );
  });

  it('uses #all so an archived thread still resolves', () => {
    // The email you dealt with is exactly the one you may want to look back at.
    expect(gmailThreadUrl('abc123')).toContain('#all/');
  });

  it('supports a second signed-in account', () => {
    expect(gmailThreadUrl('abc123', 1)).toContain('/mail/u/1/');
  });

  it('lowercases and trims, so one thread is one URL', () => {
    expect(gmailThreadUrl('  ABC123  ')).toBe('https://mail.google.com/mail/u/0/#all/abc123');
  });
});

describe('what it refuses', () => {
  it('refuses anything that is not hex', () => {
    for (const bad of ['../../evil', 'abc/def', 'abc?x=1', 'abc#frag', 'javascript:alert(1)']) {
      expect(gmailThreadUrl(bad), bad).toBeNull();
    }
  });

  it('refuses empty and absurdly long ids', () => {
    expect(gmailThreadUrl('')).toBeNull();
    expect(gmailThreadUrl('a'.repeat(200))).toBeNull();
  });

  it('returns null rather than a best guess', () => {
    // The same rule the calendar's conference links follow: a link built from a
    // malformed id is worse than no link.
    expect(gmailThreadUrl('not a thread')).toBeNull();
  });

  it('ignores a nonsense account index instead of putting it in the path', () => {
    expect(gmailDraftsUrl(-3)).toBe('https://mail.google.com/mail/u/0/#drafts');
    expect(gmailThreadUrl('abc123', 1.5)).toContain('/mail/u/0/');
  });
});
