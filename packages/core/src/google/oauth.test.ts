import { describe, expect, it } from 'vitest';
import {
  buildAuthUrl,
  CALENDAR_SCOPES,
  describeTokenError,
  looksLikeClientId,
  needsRefresh,
  parseTokenResponse,
  TOKEN_REFRESH_MARGIN_MS,
  WIZARD_STEPS,
  type GoogleTokens,
} from './oauth.js';

const NOW = 1_800_000_000_000;

const params = {
  clientId: '123-abc.apps.googleusercontent.com',
  redirectUri: 'http://127.0.0.1:49731/callback',
  codeChallenge: 'CHALLENGE',
  state: 'STATE',
};

describe('buildAuthUrl', () => {
  const url = new URL(buildAuthUrl(params));
  const q = url.searchParams;

  it('targets Google', () => {
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('requests a refresh token explicitly', () => {
    // Without both of these Google returns only an access token, and Mochi
    // silently stops working an hour later.
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
  });

  it('uses PKCE with S256', () => {
    expect(q.get('code_challenge')).toBe('CHALLENGE');
    expect(q.get('code_challenge_method')).toBe('S256');
  });

  it('carries state, so a forged callback can be rejected', () => {
    expect(q.get('state')).toBe('STATE');
  });

  it('asks only for read-only Calendar', () => {
    const scopes = (q.get('scope') ?? '').split(' ');
    expect(scopes).toEqual([...CALENDAR_SCOPES]);
    // Requesting a restricted scope would drag in the paid annual assessment.
    expect(q.get('scope')).not.toContain('gmail');
    for (const s of scopes) expect(s).toContain('readonly');
  });

  it('uses a loopback redirect, never a fixed dev port', () => {
    expect(q.get('redirect_uri')).toContain('127.0.0.1');
    expect(q.get('redirect_uri')).not.toContain(':3000');
  });

  it('percent-encodes rather than concatenating', () => {
    const weird = buildAuthUrl({ ...params, state: 'a b&c=d' });
    expect(weird).not.toContain('a b&c=d');
    expect(new URL(weird).searchParams.get('state')).toBe('a b&c=d');
  });
});

describe('parseTokenResponse', () => {
  it('reads a successful exchange', () => {
    const r = parseTokenResponse(
      {
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: CALENDAR_SCOPES.join(' '),
      },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.refreshToken).toBe('rt');
    expect(r.tokens.expiresAt).toBe(NOW + 3_600_000);
    expect(r.tokens.scopes).toHaveLength(2);
  });

  it('treats a 200 body carrying an error as a failure', () => {
    // Google returns HTTP 200 with an error field for several cases, so
    // status alone is not enough.
    const r = parseTokenResponse({ error: 'invalid_grant' }, NOW);
    expect(r.ok).toBe(false);
  });

  it('surfaces a missing refresh token rather than inventing one', () => {
    const r = parseTokenResponse({ access_token: 'at', expires_in: 60 }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.refreshToken).toBeNull();
  });

  it('defaults a missing expiry rather than producing NaN', () => {
    const r = parseTokenResponse({ access_token: 'at' }, NOW);
    if (!r.ok) return;
    expect(Number.isFinite(r.tokens.expiresAt)).toBe(true);
    expect(r.tokens.expiresAt).toBeGreaterThan(NOW);
  });

  it('rejects junk without throwing', () => {
    for (const junk of [null, undefined, 'nope', 42, []]) {
      expect(parseTokenResponse(junk, NOW).ok).toBe(false);
    }
  });
});

describe('describeTokenError', () => {
  it('explains invalid_grant in terms of the Testing-mode trap', () => {
    // The single most likely failure, and the least self-explanatory.
    const msg = describeTokenError('invalid_grant');
    expect(msg).toContain('Testing');
    expect(msg).toContain('7 days');
    expect(msg).toContain('In production');
  });

  it('points invalid_client at the Client ID', () => {
    expect(describeTokenError('invalid_client')).toContain('Client ID');
  });

  it('falls back to the detail Google supplied', () => {
    expect(describeTokenError('weird_code', 'something specific')).toContain('something specific');
  });
});

describe('looksLikeClientId', () => {
  it('accepts a real desktop client id', () => {
    expect(looksLikeClientId('123456-abc.apps.googleusercontent.com')).toBe(true);
  });

  it('rejects the usual paste mistakes', () => {
    expect(looksLikeClientId('')).toBe(false);
    expect(looksLikeClientId('123456')).toBe(false);
    // The secret, not the id.
    expect(looksLikeClientId('GOCSPX-abcdefg')).toBe(false);
    expect(looksLikeClientId('.apps.googleusercontent.com')).toBe(false);
  });
});

describe('needsRefresh', () => {
  const tokens = (expiresAt: number): GoogleTokens => ({
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt,
    scopes: [],
  });

  it('refreshes early, so a call never races the expiry', () => {
    expect(needsRefresh(tokens(NOW + TOKEN_REFRESH_MARGIN_MS - 1000), NOW)).toBe(true);
  });

  it('leaves a fresh token alone', () => {
    expect(needsRefresh(tokens(NOW + 60 * 60_000), NOW)).toBe(false);
  });

  it('treats an expired token as needing refresh', () => {
    expect(needsRefresh(tokens(NOW - 1000), NOW)).toBe(true);
  });
});

describe('WIZARD_STEPS', () => {
  it('numbers every step and deep-links the exact page', () => {
    WIZARD_STEPS.forEach((s, i) => {
      expect(s.n).toBe(i + 1);
      // "Navigate to APIs & Services" is how people get lost.
      expect(s.link).toMatch(/^https:\/\/console\.cloud\.google\.com\//);
    });
  });

  it('marks exactly one step critical, and it is Publish app', () => {
    const critical = WIZARD_STEPS.filter((s) => s.critical === true);
    expect(critical).toHaveLength(1);
    expect(critical[0]!.title).toContain('Publish');
  });

  it('warns about the 7-day expiry on that step', () => {
    const step = WIZARD_STEPS.find((s) => s.critical === true)!;
    expect(step.body).toContain('7 days');
    expect(step.body).toContain('Testing');
  });

  it('never tells the user to add themselves as a test user', () => {
    // That advice is what produces the weekly-logout bug.
    const all = WIZARD_STEPS.map((s) => s.body.toLowerCase()).join(' ');
    expect(all).not.toContain('test user');
  });

  it('asks for a Desktop app client', () => {
    expect(WIZARD_STEPS.some((s) => s.body.includes('Desktop app'))).toBe(true);
  });
});
