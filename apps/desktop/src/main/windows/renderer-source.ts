/**
 * Where the renderer pages come from: the dev server, or the bundled files.
 *
 * One place for both answers, because the windows that load the pages and the
 * navigation guard that polices them must agree exactly. When the loader and
 * the guard each derived the path themselves, nothing kept them in step.
 */

import { app } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export type RendererPage = 'overlay' | 'setup';

const PAGES: readonly RendererPage[] = ['overlay', 'setup'];

/**
 * The electron-vite dev server URL, honoured only in an unpackaged build.
 *
 * A packaged app used to obey ELECTRON_RENDERER_URL too, so anyone able to set
 * an environment variable for the user could point the windows — preload bridge
 * and all — at a page of their choosing.
 * The variable only exists to wire up `electron-vite dev`; a shipped build has
 * no reason to read it.
 */
export function devRendererUrl(): string | undefined {
  if (app.isPackaged) return undefined;
  const url = process.env['ELECTRON_RENDERER_URL'];
  return url === undefined || url === '' ? undefined : url;
}

/**
 * Absolute path of a bundled page.
 *
 * `import.meta.dirname` is out/main at runtime: electron-vite bundles the whole
 * main process into out/main/index.mjs, so this resolves the same from here as
 * it did from overlay.ts and setup.ts.
 */
export function bundledRendererPath(page: RendererPage): string {
  return join(import.meta.dirname, '../renderer', `${page}.html`);
}

/** Every bundled page as a file:// URL, for the navigation allowlist. */
export function bundledRendererUrls(): string[] {
  return PAGES.map((page) => pathToFileURL(bundledRendererPath(page)).href);
}
