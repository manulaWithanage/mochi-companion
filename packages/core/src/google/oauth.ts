/**
 * Google OAuth for a desktop app — the pure half.
 *
 * URL construction, token parsing, and the wizard's own steps live here so
 * they are testable without a browser or a network. The loopback listener and
 * the crypto live in apps/desktop (RULE 2).
 *
 * The whole design exists because Mochi ships **no** Google credentials. The
 * user creates their own Cloud project, which makes them simultaneously the
 * developer and the only user of it — so verification, the 100-user cap and
 * the CASA assessment are all non-applicable. See gmail-access-strategy.
 */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Calendar only, and read-only.
 *
 * Calendar scopes are **sensitive**; every useful Gmail scope is
 * **restricted** and carries an annual paid assessment. The morning briefing
 * needs nothing more than this, so asking for more would buy compliance
 * burden for no feature.
 */
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const;

export interface AuthUrlParams {
  readonly clientId: string;
  /** Loopback URI, with the port bound at runtime. */
  readonly redirectUri: string;
  /** Base64url SHA-256 of the verifier. */
  readonly codeChallenge: string;
  /** Echoed back by Google; must match to reject a forged callback. */
  readonly state: string;
  readonly scopes?: readonly string[];
}

/**
 * Build the consent URL.
 *
 * `access_type=offline` plus `prompt=consent` is what actually yields a
 * refresh token. Without them Google returns only an access token and Mochi
 * would silently stop working an hour later.
 */
export function buildAuthUrl(params: AuthUrlParams): string {
  const url = new URL(GOOGLE_AUTH_URL);
  const q = url.searchParams;
  q.set('client_id', params.clientId);
  q.set('redirect_uri', params.redirectUri);
  q.set('response_type', 'code');
  q.set('scope', (params.scopes ?? CALENDAR_SCOPES).join(' '));
  q.set('code_challenge', params.codeChallenge);
  q.set('code_challenge_method', 'S256');
  q.set('state', params.state);
  q.set('access_type', 'offline');
  q.set('prompt', 'consent');
  return url.toString();
}

export interface GoogleTokens {
  readonly accessToken: string;
  /** Absent when Google declines to issue one — see parseTokenResponse. */
  readonly refreshToken: string | null;
  readonly expiresAt: number;
  readonly scopes: readonly string[];
}

export type TokenParseResult =
  | { readonly ok: true; readonly tokens: GoogleTokens }
  | { readonly ok: false; readonly error: string };

/**
 * Parse a token response.
 *
 * Google returns HTTP 200 with an `error` field for several failures, so a
 * successful status is not enough — the body has to be inspected.
 */
export function parseTokenResponse(payload: unknown, now: number): TokenParseResult {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'Google returned something unreadable.' };
  }
  const body = payload as Record<string, unknown>;

  if (typeof body['error'] === 'string') {
    const detail = typeof body['error_description'] === 'string' ? body['error_description'] : '';
    return { ok: false, error: describeTokenError(body['error'], detail) };
  }

  const accessToken = body['access_token'];
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return { ok: false, error: 'Google did not return an access token.' };
  }

  const expiresIn = typeof body['expires_in'] === 'number' ? body['expires_in'] : 3600;
  const refresh = body['refresh_token'];
  const scope = body['scope'];

  return {
    ok: true,
    tokens: {
      accessToken,
      refreshToken: typeof refresh === 'string' && refresh.length > 0 ? refresh : null,
      expiresAt: now + expiresIn * 1000,
      scopes: typeof scope === 'string' ? scope.split(' ').filter((s) => s.length > 0) : [],
    },
  };
}

/**
 * Translate Google's error codes into something actionable.
 *
 * `invalid_grant` in particular is the symptom of the Testing-mode trap, and
 * left as-is it tells the user nothing at all.
 */
export function describeTokenError(code: string, detail = ''): string {
  switch (code) {
    case 'invalid_grant':
      return 'That authorisation is no longer valid. If your consent screen is still in "Testing", refresh tokens expire after 7 days — set it to "In production" and connect again.';
    case 'invalid_client':
      return 'Google did not recognise that Client ID. Check it was copied in full, and that it is an OAuth client of type "Desktop app".';
    case 'redirect_uri_mismatch':
      return 'The redirect URI is not registered on your OAuth client. Add the loopback URI shown in the wizard.';
    case 'access_denied':
      return 'Access was declined on the Google consent screen.';
    default:
      return detail.length > 0 ? `${code}: ${detail}` : `Google returned "${code}".`;
  }
}

/** Google desktop client IDs end in this. Catches the commonest paste error. */
const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

export function looksLikeClientId(value: string): boolean {
  const id = value.trim();
  return id.length > CLIENT_ID_SUFFIX.length && id.endsWith(CLIENT_ID_SUFFIX);
}

/** A token is refreshed early, so a call never races the expiry. */
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

export function needsRefresh(tokens: GoogleTokens, now: number): boolean {
  return now >= tokens.expiresAt - TOKEN_REFRESH_MARGIN_MS;
}

// ---------------------------------------------------------------------------
// The wizard
// ---------------------------------------------------------------------------

export interface WizardStep {
  readonly n: number;
  readonly title: string;
  readonly body: string;
  /** Opened in the real browser — the exact page, never "navigate to…". */
  readonly link?: string;
  readonly linkLabel?: string;
  /**
   * Marks the step that silently breaks everything a week later if skipped.
   * Rendered in a warning colour with its own screen.
   */
  readonly critical?: boolean;
}

/**
 * Five deep-linked steps.
 *
 * Each links the exact console page rather than describing where to navigate.
 * Step 4 is the one that matters: leaving the consent screen in "Testing"
 * expires refresh tokens after 7 days, logging the user out every week with
 * an `invalid_grant` and no visible cause. Almost every tutorial online tells
 * people to add themselves as a test user, which produces exactly that bug.
 */
export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    n: 1,
    title: 'Create a Google Cloud project',
    body: 'Free, and takes a moment. Any name will do, it is only ever used by you.',
    link: 'https://console.cloud.google.com/projectcreate',
    linkLabel: 'Open project creation',
  },
  {
    n: 2,
    title: 'Turn on the Calendar API',
    body: 'Press Enable. This is the only API Mochi asks for (no Gmail, no Drive).',
    link: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
    linkLabel: 'Open Calendar API',
  },
  {
    n: 3,
    title: 'Configure the consent screen',
    body: 'Choose External as the audience, then fill in an app name and your own email. Nobody else ever sees this screen.',
    link: 'https://console.cloud.google.com/auth/overview',
    linkLabel: 'Open consent screen',
  },
  {
    n: 4,
    title: 'Publish the app',
    body: 'Press "Publish app" so the status reads In production. Leaving it in Testing makes Google expire your login every 7 days, with no warning and no obvious cause. You will see an "unverified app" notice once when you connect, that is expected, and it is your own project.',
    link: 'https://console.cloud.google.com/auth/audience',
    linkLabel: 'Open audience settings',
    critical: true,
  },
  {
    n: 5,
    title: 'Create the OAuth client',
    body: 'Create credentials → OAuth client ID → application type Desktop app. Copy the Client ID and paste it below.',
    link: 'https://console.cloud.google.com/auth/clients',
    linkLabel: 'Open credentials',
  },
];
