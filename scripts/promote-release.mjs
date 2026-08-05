#!/usr/bin/env node
/**
 * Decide whether a newly published release should become "latest".
 *
 * **The trap this closes.** Publishing a draft does not move GitHub's "latest"
 * pointer once a previous release has been pinned explicitly. On 2026-08-05,
 * v0.1.3 was published and v0.1.2 remained latest — so
 * `releases/latest/download/Mochi-Setup.exe`, which the website links to and the
 * updater resolves against, kept serving the old installer. Nothing failed.
 * The release page showed v0.1.3, the assets were all there, and every download
 * was the previous version.
 *
 * Left to a human this is one forgettable step whose failure is invisible, so a
 * workflow does it on the `release: published` event instead.
 *
 * **Two guards, because "always promote" is its own footgun.**
 *
 * A prerelease must never become latest — `0.2.0-beta.1` is not what the download
 * button should hand a stranger. And re-publishing an old release must not drag
 * the pointer backwards, which is otherwise an easy way to serve an ancient build
 * by clicking the wrong Publish button.
 *
 * Plain `.mjs` with no dependencies so the workflow can run it with no install.
 */

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

/** `[major, minor, patch, prerelease | null]`, or null when unparseable. */
export function parseVersion(tag) {
  if (typeof tag !== 'string') return null;
  const m = SEMVER.exec(tag.trim());
  if (m === null) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  };
}

/**
 * Is `a` a higher version than `b`?
 *
 * Prerelease ordering is deliberately coarse: `1.0.0-beta` sorts below `1.0.0`
 * and no attempt is made to rank `beta.2` against `rc.1`. Anything finer would be
 * guessing at intent, and this only has to answer "should the pointer move".
 */
export function isNewer(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === null) return false;
  if (right === null) return true;

  for (const part of ['major', 'minor', 'patch']) {
    if (left[part] !== right[part]) return left[part] > right[part];
  }
  if (left.prerelease === right.prerelease) return false;
  if (left.prerelease === null) return true;
  if (right.prerelease === null) return false;
  return left.prerelease > right.prerelease;
}

/**
 * @returns {{ promote: true } | { promote: false, because: string }}
 */
export function shouldPromote({ tag, prerelease, currentLatestTag }) {
  if (parseVersion(tag) === null) {
    return { promote: false, because: `"${tag}" is not a version tag` };
  }
  if (prerelease === true) {
    return {
      promote: false,
      because: `${tag} is a prerelease — the download button should not hand a stranger a beta`,
    };
  }
  if (currentLatestTag === null || currentLatestTag === undefined || currentLatestTag === '') {
    return { promote: true };
  }
  if (tag === currentLatestTag) {
    return { promote: false, because: `${tag} is already latest` };
  }
  if (!isNewer(tag, currentLatestTag)) {
    return {
      promote: false,
      because: `${tag} is older than the current latest (${currentLatestTag}) — refusing to move the pointer backwards`,
    };
  }
  return { promote: true };
}

// ---------------------------------------------------------------------------
// CLI: promote-release.mjs <tag> <isPrerelease> <currentLatestTag>
// ---------------------------------------------------------------------------

const invokedDirectly =
  process.argv[1] !== undefined && process.argv[1].replace(/\\/g, '/').endsWith('promote-release.mjs');

if (invokedDirectly) {
  const [, , tag, prereleaseArg, currentLatest] = process.argv;
  const result = shouldPromote({
    tag: tag ?? '',
    prerelease: prereleaseArg === 'true',
    currentLatestTag: currentLatest ?? '',
  });

  if (result.promote) {
    console.log(`promote: ${tag} should become latest`);
    process.exit(0);
  }
  console.log(`skip: ${result.because}`);
  // 3, not 1. Declining to promote is a normal outcome — a prerelease, or a
  // deliberate re-publish of something old — and a red workflow on an expected
  // decision teaches people to ignore red workflows. The caller branches on this
  // code rather than treating it as a failure.
  process.exit(3);
}
