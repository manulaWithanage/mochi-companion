#!/usr/bin/env bash
#
# Remove `Co-Authored-By: Claude ...` trailers from this branch's history.
#
# WHY THIS EXISTS
# ---------------
# GitHub builds the contributors list from commits on the default branch, and it
# counts co-authors. No commit in this repository is *authored* by Claude — the
# entry comes entirely from three trailers on `main`:
#
#     Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
#
# A trailer cannot be removed without editing the commit message, and editing a
# message changes that commit's hash and every hash after it.
#
# WHAT IT COSTS
# -------------
# The oldest trailer sits 48 commits back, so this rewrites everything from
# there to the tip and moves 13 tags: v0.1.4 through v0.2.6.
#
#   - Release *assets* survive. A GitHub release is attached to a tag by name,
#     so the installers stay downloadable and `releases/latest/download/...`
#     keeps working.
#   - Every commit SHA after the oldest trailer changes. Any link to a specific
#     commit, anywhere, breaks.
#   - Anyone holding a clone has to reset to the rewritten history. Uncommitted
#     work on top of the old history is stranded on orphaned commits, which is
#     why this refuses to run against a dirty tree.
#
# It does NOT push. It prints the push commands and stops, because a force-push
# over published tags should be a thing a person types.
#
#   bash scripts/strip-coauthor-trailers.sh

set -euo pipefail

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ "$BRANCH" != "main" ]; then
  echo "error: on '$BRANCH'. Rewriting anything but main here would renumber a" >&2
  echo "       branch's history without touching the one GitHub actually counts." >&2
  exit 1
fi

# The whole reason for waiting. A rewrite under someone else's in-progress work
# leaves it parented to commits that no longer exist.
if [ -n "$(git status --porcelain)" ]; then
  echo "error: the working tree is not clean." >&2
  echo "       Commit, stash or discard everything first — including any work" >&2
  echo "       another agent or editor has open. A rewrite strands it otherwise:" >&2
  echo >&2
  git status --short >&2
  exit 1
fi

# A clean tree is not sufficient, which this script learned the hard way.
#
# Every unmerged branch is rooted at a commit on main. Rewriting main changes
# those roots, so an outstanding branch is left hanging off history that no
# longer exists and has to be rebased by hand — the same stranding a dirty tree
# causes, one level up and easier to miss because `git status` says nothing.
UNMERGED="$(git branch --no-merged "$BRANCH" --format='%(refname:short)' | grep -v '^backup/' || true)"
if [ -n "$UNMERGED" ]; then
  echo "warning: these branches are not merged into $BRANCH and would need rebasing" >&2
  echo "$UNMERGED" | sed 's/^/           /' >&2
  echo >&2
  echo "         Merge or delete them first, or re-run with FORCE_UNMERGED=1 if you" >&2
  echo "         intend to rebase them yourself afterwards." >&2
  if [ "${FORCE_UNMERGED:-}" != "1" ]; then
    exit 1
  fi
  echo "         FORCE_UNMERGED=1 set, continuing." >&2
  echo >&2
fi

COUNT="$(git log "$BRANCH" --format=%H --grep='Co-Authored-By: Claude' -i | wc -l | tr -d ' ')"
if [ "$COUNT" = "0" ]; then
  echo "Nothing to do: no Co-Authored-By: Claude trailers on $BRANCH."
  exit 0
fi

OLDEST="$(git log "$BRANCH" --format=%H --grep='Co-Authored-By: Claude' -i | tail -1)"
DEPTH="$(git rev-list --count "$OLDEST..$BRANCH")"

echo "Trailers found:      $COUNT commit(s)"
echo "Oldest:              $(git log -1 --format='%h %s' "$OLDEST")"
echo "Commits to rewrite:  $((DEPTH + 1))"
echo "Backup ref:          refs/backup/pre-trailer-strip"
echo

git update-ref refs/backup/pre-trailer-strip "$BRANCH"

# `--msg-filter` over the affected range only. Deletes the trailer line and any
# blank line left dangling at the end of the message.
#
# filter-branch is deprecated in favour of git-filter-repo, which is not
# installed here and is a separate download. For 49 commits and one line the
# deprecated tool is adequate, and its warning is expected.
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f \
  --msg-filter 'sed -E "/^[Cc]o-[Aa]uthored-[Bb]y:.*[Cc]laude.*$/d" | sed -e :a -e "/^\n*$/{\$d;N;ba" -e "}"' \
  --tag-name-filter cat \
  -- "$OLDEST^..$BRANCH"

REMAINING="$(git log "$BRANCH" --format=%H --grep='Co-Authored-By: Claude' -i | wc -l | tr -d ' ')"
echo
if [ "$REMAINING" != "0" ]; then
  echo "error: $REMAINING trailer(s) survived the rewrite. Nothing has been pushed." >&2
  echo "       Restore with: git reset --hard refs/backup/pre-trailer-strip" >&2
  exit 1
fi

echo "Rewrite complete. $COUNT trailer(s) removed, none remaining."
echo
echo "Nothing has been pushed. Check the result first:"
echo
echo "    git log --format='%h %an %s' -12"
echo "    git diff refs/backup/pre-trailer-strip $BRANCH   # should be empty: messages only"
echo
echo "Then push, which force-updates main and 13 tags:"
echo
echo "    git push --force-with-lease origin $BRANCH"
echo "    git push --force origin --tags"
echo
echo "To abandon:"
echo
echo "    git reset --hard refs/backup/pre-trailer-strip"
