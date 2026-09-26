/**
 * Which URLs a window is allowed to navigate to.
 *
 * Split from the Electron wiring so the rule is testable without an app object:
 * this file must stay electron-free (see vitest.config.ts). `renderer-source.ts`
 * supplies the inputs; `index.ts` applies the answer to `will-navigate` and
 * `will-redirect`.
 *
 * The renderer shows LLM output and email content, both attacker-influenced, so
 * a navigation request is treated as untrusted input. The rule is an allowlist
 * of exactly two things: the dev server's origin (in development only) and the
 * app's own bundled pages. Everything else is refused.
 */

export interface NavigationContext {
  /**
   * The electron-vite dev server, or undefined in a packaged build. Callers get
   * it from `devRendererUrl()`, which already refuses it when packaged.
   */
  readonly devUrl: string | undefined;
  /** `file://` URLs of the bundled renderer pages, as `pathToFileURL(...).href`. */
  readonly bundledPages: readonly string[];
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * A file URL reduced to what identifies the file: no query, no hash, and the
 * path decoded so `%20` and a literal space compare equal. Chromium and
 * `pathToFileURL` do not always agree on which characters to escape.
 */
function fileIdentity(url: URL): string | null {
  if (url.protocol !== 'file:') return null;
  try {
    return `${url.host}|${decodeURIComponent(url.pathname)}`;
  } catch {
    return null;
  }
}

export function isAllowedNavigation(url: string, ctx: NavigationContext): boolean {
  const target = parse(url);
  if (target === null) return false;

  // Exact origin, not a string prefix. `startsWith('http://localhost:5173')`
  // also matched `http://localhost:5173.evil.com`, a different host entirely.
  if (ctx.devUrl !== undefined) {
    const dev = parse(ctx.devUrl);
    // `origin` is the string "null" for opaque schemes; never let two of those
    // compare equal and count as a match.
    if (dev !== null && dev.origin !== 'null' && target.origin === dev.origin) return true;
  }

  // Only our own pages, not "anything on disk". A blanket file:// allowance let
  // a compromised renderer navigate itself to any local HTML file, which then
  // ran with this window's preload bridge attached.
  const targetFile = fileIdentity(target);
  if (targetFile === null) return false;
  return ctx.bundledPages.some((page) => {
    const bundled = parse(page);
    return bundled !== null && fileIdentity(bundled) === targetFile;
  });
}
