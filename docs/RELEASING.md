# Releasing

Four steps. Two of them are automated and two are not, and the manual ones are
here because they have no home in CI.

## 1. Bump the version in a commit

```bash
# apps/desktop/package.json and package.json — keep them the same
pnpm release:check v0.1.4   # fails if the tag and the manifest disagree
```

`apps/desktop/package.json` is the source of truth. electron-builder reads the
version from it and **ignores git tags entirely**, so a mismatch publishes the old
version under a new tag and offers nobody the update — silently, with the release
page looking correct. That is what `release:check` exists to catch, and it runs in
CI before anything is built.

The tag agrees with the source rather than setting it, so every artifact
corresponds to a commit you can check out — which is the question a code-signing
programme exists to answer, and a CI step that rewrote tracked files before
building would break that chain.

## 2. Tag it

```bash
git tag -a v0.1.4 -m "Mochi 0.1.4"
git push origin v0.1.4
```

The pipeline then runs the version check, the five gates on three platforms, and
builds a Windows installer into a **draft** release carrying `Mochi-Setup.exe`,
`latest.yml` and the blockmap.

Nothing reaches a user yet. That is the point — a bad build costs a rerun, a bad
`latest.yml` reaching users does not.

## 3. Publish the draft

From the Releases page, or:

```bash
gh release edit v0.1.4 --draft=false
```

**You no longer need `--latest`.** The `Promote published release` workflow fires
on publish and moves the pointer, refusing to do so for a prerelease or for a
release older than the current latest.

That workflow exists because of a real failure on 2026-08-05: v0.1.3 was published
and v0.1.2 stayed latest, so `releases/latest/download/Mochi-Setup.exe` — the
website's download link _and_ the URL the auto-updater resolves — kept serving the
old installer. Nothing errored. Every download was simply the previous version.

Give it a minute and check:

```bash
gh api repos/manulaWithanage/mochi-companion/releases/latest --jq .tag_name
```

The CDN caches `releases/latest/download/`, so that URL can serve the previous
asset for a short while after the pointer moves. Compare byte sizes rather than
trusting a 200.

## 4. Write it down — the two things CI cannot do

**The wiki.** `mochi-obsidiant` is a local Obsidian vault, not a git repository, so
nothing in a push can reach it. Add the release to
`wiki/concepts/release-history.md` and append to `log.md`: what shipped, and
anything the release taught you. A release nobody recorded is one you cannot
reason about in three months.

**Release notes.** The pipeline generates a commit list, which answers "what
changed" and not "what changed for me". A line or two in the release body about
what a user will notice is worth more than thirty commit subjects.

---

## When something looks wrong

**The download button 404s.** The newest release is still a draft. Publish it.

**The download gives the previous version.** Either the CDN has not caught up
(wait, then compare sizes) or "latest" never moved (step 3).

**Nobody is offered the update.** Check `latest.yml` on the release itself:

```bash
curl -sSL https://github.com/manulaWithanage/mochi-companion/releases/download/v0.1.4/latest.yml
```

If the version in it is not the one you tagged, step 1 was skipped and the build
carried the old manifest version.

**The release has two entries.** Fixed on 2026-08-05 — the workflow creates the
draft before packaging so electron-builder's concurrent uploads have something to
find. If it recurs, the assets are split across two releases and neither is
complete; the `Verify exactly one release exists` step should have failed first.

## What is still missing

The installer is **unsigned**, so Windows SmartScreen warns on every download and
that warning does not diminish with volume: reputation attaches to a certificate,
and without one every release starts from zero. This is the single biggest
outstanding item and it is tracked in the wiki, not here.
