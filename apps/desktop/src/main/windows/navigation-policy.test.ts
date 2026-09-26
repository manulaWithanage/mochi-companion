import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isAllowedNavigation, type NavigationContext } from './navigation-policy.js';

// Built the way renderer-source.ts builds them, from a path with a space in it:
// the default Windows install directory has one, and escaping is where a
// hand-written file:// comparison goes wrong.
const rendererDir = join(import.meta.dirname, 'Program Files', 'out', 'renderer');
const overlay = pathToFileURL(join(rendererDir, 'overlay.html')).href;
const setup = pathToFileURL(join(rendererDir, 'setup.html')).href;

const dev: NavigationContext = {
  devUrl: 'http://localhost:5173',
  bundledPages: [overlay, setup],
};
const packaged: NavigationContext = { devUrl: undefined, bundledPages: [overlay, setup] };

describe('isAllowedNavigation', () => {
  it('allows the dev server origin, on any path', () => {
    expect(isAllowedNavigation('http://localhost:5173/setup.html', dev)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5173/', dev)).toBe(true);
  });

  it('rejects a host that merely starts with the dev URL', () => {
    expect(isAllowedNavigation('http://localhost:5173.evil.com/setup.html', dev)).toBe(false);
  });

  it('rejects the dev server port on a different scheme or port', () => {
    expect(isAllowedNavigation('https://localhost:5173/setup.html', dev)).toBe(false);
    expect(isAllowedNavigation('http://localhost:5174/setup.html', dev)).toBe(false);
  });

  it('rejects the dev server origin when there is no dev URL (packaged)', () => {
    expect(isAllowedNavigation('http://localhost:5173/setup.html', packaged)).toBe(false);
  });

  it('allows a bundled page, including with a hash or query', () => {
    expect(isAllowedNavigation(overlay, packaged)).toBe(true);
    expect(isAllowedNavigation(`${setup}#/settings`, packaged)).toBe(true);
    expect(isAllowedNavigation(`${setup}?tab=gmail#top`, packaged)).toBe(true);
  });

  it('rejects any other file:// URL', () => {
    const elsewhere = pathToFileURL(join(rendererDir, '..', 'evil.html')).href;
    expect(isAllowedNavigation(elsewhere, packaged)).toBe(false);
    expect(isAllowedNavigation('file:///C:/Users/Public/evil.html', dev)).toBe(false);
    // A sibling that shares the bundled page as a prefix.
    expect(isAllowedNavigation(`${overlay}.evil.html`, packaged)).toBe(false);
  });

  it('rejects external https', () => {
    expect(isAllowedNavigation('https://example.com/', dev)).toBe(false);
    expect(isAllowedNavigation('https://example.com/', packaged)).toBe(false);
  });

  it('rejects a malformed URL', () => {
    expect(isAllowedNavigation('not a url', dev)).toBe(false);
    expect(isAllowedNavigation('', dev)).toBe(false);
    expect(isAllowedNavigation('http://', dev)).toBe(false);
  });

  it('never matches when the dev URL itself is malformed or opaque', () => {
    expect(isAllowedNavigation('about:blank', { devUrl: 'about:blank', bundledPages: [] })).toBe(
      false,
    );
    expect(isAllowedNavigation('http://localhost:5173/', { devUrl: '::', bundledPages: [] })).toBe(
      false,
    );
  });
});
