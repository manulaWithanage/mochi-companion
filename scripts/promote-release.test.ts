import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs so the workflow can run it with no install.
import { isNewer, parseVersion, shouldPromote } from './promote-release.mjs';

/**
 * The trap: publishing a draft does not move GitHub's "latest" pointer once a
 * previous release has been pinned. v0.1.3 was published on 2026-08-05 and
 * v0.1.2 stayed latest, so `releases/latest/download/Mochi-Setup.exe` — the link
 * on the website and the URL the updater resolves — kept serving the old
 * installer. The release page looked correct and every download was the previous
 * version.
 */

describe('promoting a new release', () => {
  it('promotes a newer stable release', () => {
    expect(shouldPromote({ tag: 'v0.1.3', prerelease: false, currentLatestTag: 'v0.1.2' })).toEqual(
      { promote: true },
    );
  });

  it('promotes the very first release', () => {
    expect(shouldPromote({ tag: 'v0.1.0', prerelease: false, currentLatestTag: '' }).promote).toBe(
      true,
    );
  });
});

describe('what must not become latest', () => {
  it('refuses a prerelease', () => {
    // The download button should not hand a stranger a beta.
    const r = shouldPromote({ tag: 'v0.2.0-beta.1', prerelease: true, currentLatestTag: 'v0.1.3' });

    expect(r.promote).toBe(false);
    expect(r.because).toContain('prerelease');
  });

  it('refuses to move the pointer backwards', () => {
    // Re-publishing an old release is an easy way to serve an ancient build.
    const r = shouldPromote({ tag: 'v0.1.1', prerelease: false, currentLatestTag: 'v0.1.3' });

    expect(r.promote).toBe(false);
    expect(r.because).toContain('older');
  });

  it('does nothing when it is already latest', () => {
    const r = shouldPromote({ tag: 'v0.1.3', prerelease: false, currentLatestTag: 'v0.1.3' });

    expect(r.promote).toBe(false);
    expect(r.because).toContain('already');
  });

  it('refuses a tag that is not a version', () => {
    expect(shouldPromote({ tag: 'nightly', prerelease: false, currentLatestTag: '' }).promote).toBe(
      false,
    );
  });
});

describe('version comparison', () => {
  it('orders by major, then minor, then patch', () => {
    expect(isNewer('v1.0.0', 'v0.9.9')).toBe(true);
    expect(isNewer('v0.2.0', 'v0.1.9')).toBe(true);
    expect(isNewer('v0.1.10', 'v0.1.9')).toBe(true);
    expect(isNewer('v0.1.2', 'v0.1.3')).toBe(false);
  });

  it('sorts a prerelease below the release it precedes', () => {
    expect(isNewer('v1.0.0', 'v1.0.0-beta.1')).toBe(true);
    expect(isNewer('v1.0.0-beta.1', 'v1.0.0')).toBe(false);
  });

  it('still ranks a prerelease above an older stable version', () => {
    expect(isNewer('v0.2.0-beta.1', 'v0.1.3')).toBe(true);
  });

  it('treats an equal version as not newer', () => {
    expect(isNewer('v1.2.3', 'v1.2.3')).toBe(false);
  });

  it('tolerates a missing v', () => {
    expect(isNewer('1.0.1', 'v1.0.0')).toBe(true);
  });

  it('treats an unparseable current latest as no barrier', () => {
    expect(isNewer('v1.0.0', 'garbage')).toBe(true);
  });
});

describe('parseVersion', () => {
  it('reads the parts', () => {
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
    expect(parseVersion('0.2.0-beta.1')).toMatchObject({ minor: 2, prerelease: 'beta.1' });
  });

  it('returns null for a non-version', () => {
    expect(parseVersion('nightly')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});
