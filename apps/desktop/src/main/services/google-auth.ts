/**
 * The Google OAuth loopback flow.
 *
 * Binds an **ephemeral** port on 127.0.0.1, serves exactly one response, and
 * shuts down immediately. This is a loopback listener, not a local web
 * server, and it must never grow into one: a long-lived localhost server
 * holding OAuth tokens is a real attack surface — any page in the user's
 * browser can reach it.
 *
 * Never a fixed port. `localhost:3000` collides with Vite, Next and most dev
 * servers, and a busy port would break the flow with no obvious cause.
 */

import { createServer, type Server } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { shell } from 'electron';
import {
  buildAuthUrl,
  describeTokenError,
  GOOGLE_TOKEN_URL,
  parseTokenResponse,
  type GoogleTokens,
} from '@mochi/core';

/** Long enough to read a consent screen, short enough not to linger. */
const AUTH_TIMEOUT_MS = 5 * 60_000;

const base64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
}

function createPkce(): Pkce {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: base64url(createHash('sha256').update(verifier).digest()) };
}

const PAGE = (title: string, message: string): string => `<!doctype html>
<meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui;background:#1b1720;color:#f4eef6;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="font-size:20px;margin:0 0 8px">${title}</h1>
<p style="opacity:.65;font-size:14px;margin:0">${message}</p></div>`;

export type AuthOutcome =
  | { readonly ok: true; readonly tokens: GoogleTokens }
  | { readonly ok: false; readonly error: string };

/**
 * Run the whole flow: listen, open the browser, capture the code, exchange it.
 *
 * Resolves rather than throwing, because every failure here has a message the
 * user needs to see in the wizard.
 */
export async function authorizeWithGoogle(clientId: string): Promise<AuthOutcome> {
  const pkce = createPkce();
  const state = base64url(randomBytes(16));

  let server: Server | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const { port, code } = await new Promise<{ port: number; code: string }>((resolve, reject) => {
      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://127.0.0.1`);
        if (url.pathname !== '/callback') {
          res.statusCode = 404;
          res.end();
          return;
        }

        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const authCode = url.searchParams.get('code');

        res.setHeader('content-type', 'text/html; charset=utf-8');

        // A callback that does not carry our state did not come from the
        // request we made. Refuse it.
        if (returnedState !== state) {
          res.end(PAGE('Something went wrong', 'That response did not match this request.'));
          reject(new Error('state mismatch'));
          return;
        }
        if (error !== null) {
          res.end(PAGE('Not connected', 'You can close this tab and try again.'));
          reject(new Error(describeTokenError(error)));
          return;
        }
        if (authCode === null) {
          res.end(PAGE('Something went wrong', 'Google did not return an authorisation code.'));
          reject(new Error('no code returned'));
          return;
        }

        res.end(PAGE('Connected 🍡', 'You can close this tab and go back to Mochi.'));
        const address = server?.address();
        resolve({
          port: typeof address === 'object' && address !== null ? address.port : 0,
          code: authCode,
        });
      });

      server.on('error', reject);
      // Port 0 asks the OS for a free one.
      server.listen(0, '127.0.0.1', () => {
        const address = server?.address();
        const bound = typeof address === 'object' && address !== null ? address.port : 0;
        const redirectUri = `http://127.0.0.1:${bound}/callback`;

        void shell.openExternal(
          buildAuthUrl({
            clientId,
            redirectUri,
            codeChallenge: pkce.challenge,
            state,
          }),
        );
      });

      timer = setTimeout(() => reject(new Error('Timed out waiting for Google.')), AUTH_TIMEOUT_MS);
    });

    return await exchangeCode(clientId, code, pkce.verifier, `http://127.0.0.1:${port}/callback`);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Authorisation failed.' };
  } finally {
    // Shut the listener down whatever happened — success, failure or timeout.
    if (timer !== undefined) clearTimeout(timer);
    server?.close();
  }
}

async function exchangeCode(
  clientId: string,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<AuthOutcome> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  const parsed = parseTokenResponse(await response.json(), Date.now());
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // No refresh token means Mochi works for an hour and then quietly stops.
  // Better to fail now, loudly, with the actual cause.
  if (parsed.tokens.refreshToken === null) {
    return {
      ok: false,
      error:
        'Google did not return a refresh token. This usually means the account has authorised this client before — remove Mochi at myaccount.google.com/permissions and connect again.',
    };
  }

  return { ok: true, tokens: parsed.tokens };
}

/** Swap a refresh token for a fresh access token. */
export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
): Promise<AuthOutcome> {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const parsed = parseTokenResponse(await response.json(), Date.now());
    if (!parsed.ok) return { ok: false, error: parsed.error };

    // A refresh response omits the refresh token; keep the one we have.
    return {
      ok: true,
      tokens: { ...parsed.tokens, refreshToken: parsed.tokens.refreshToken ?? refreshToken },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not reach Google.',
    };
  }
}
