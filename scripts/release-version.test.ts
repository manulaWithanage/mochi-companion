import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs on purpose, so it runs before pnpm install.
import { checkReleaseVersion, tagFromRef } from './release-version.mjs';

/**
 * The failure this guards is silent, which is why it is worth testing at all.
 *
 * electron-builder reads the version from `package.json` and ignores git tags
 * completely. Tagging `v1.0.1` against a `0.1.0` manifest builds
 * `…-0.1.0-x64.exe` and writes a `latest.yml` advertising 0.1.0 — so the release
 * succeeds, the assets appear on GitHub, and every user already on 0.1.0 is told
 * there is nothing new. For ever, with no error anywhere.
 */

const VERSION = '1.0.1';

describe('a tag that matches the manifest', () => {
  it('passes', () => {
    expect(checkReleaseVersion({ tag: 'v1.0.1', version: VERSION })).toEqual({
      ok: true,
      version: '1.0.1',
    });
  });

  it('allows a prerelease, so testers can be shipped to', () => {
    expect(checkReleaseVersion({ tag: 'v0.2.0-beta.1', version: '0.2.0-beta.1' }).ok).toBe(true);
  });

  it('allows build metadata', () => {
    expect(checkReleaseVersion({ tag: 'v1.0.1+build.7', version: '1.0.1+build.7' }).ok).toBe(true);
  });
});

describe('a tag that does not match', () => {
  it('fails, and names both numbers', () => {
    const result = checkReleaseVersion({ tag: 'v1.0.1', version: '0.1.0' });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('1.0.1');
    expect(result.reason).toContain('0.1.0');
  });

  it('says what to do about it', () => {
    // An error that states the problem and not the fix gets worked around.
    const result = checkReleaseVersion({ tag: 'v1.0.1', version: '0.1.0' });

    expect(result.reason).toContain('apps/desktop/package.json');
    expect(result.reason).toContain('move the tag');
  });

  it('explains why it matters, since the failure is otherwise invisible', () => {
    const result = checkReleaseVersion({ tag: 'v2.0.0', version: '0.1.0' });

    expect(result.reason).toContain('no user would ever be offered the update');
  });
});

describe('what is not a release tag', () => {
  it('rejects a tag with no v', () => {
    expect(checkReleaseVersion({ tag: '1.0.1', version: VERSION }).ok).toBe(false);
  });

  it('rejects a two-part version rather than guessing the third', () => {
    // Treating v1.0 as 1.0.0 is how the wrong number reaches users.
    expect(checkReleaseVersion({ tag: 'v1.0', version: '1.0.0' }).ok).toBe(false);
  });

  it('rejects a non-release tag', () => {
    expect(checkReleaseVersion({ tag: 'nightly', version: VERSION }).ok).toBe(false);
  });

  it('rejects an empty or missing tag rather than passing', () => {
    expect(checkReleaseVersion({ tag: '', version: VERSION }).ok).toBe(false);
    expect(checkReleaseVersion({ tag: undefined, version: VERSION }).ok).toBe(false);
  });

  it('does not accept a leading-zero or letter version', () => {
    expect(checkReleaseVersion({ tag: 'vX.Y.Z', version: VERSION }).ok).toBe(false);
  });
});

describe('tagFromRef', () => {
  it('strips the refs/tags prefix GitHub Actions provides', () => {
    expect(tagFromRef('refs/tags/v1.0.1')).toBe('v1.0.1');
  });

  it('passes a bare tag through, so it works locally too', () => {
    expect(tagFromRef('v1.0.1')).toBe('v1.0.1');
  });

  it('returns empty for nothing, rather than throwing', () => {
    expect(tagFromRef(undefined)).toBe('');
    expect(tagFromRef('')).toBe('');
  });
});
