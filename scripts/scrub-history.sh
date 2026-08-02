#!/usr/bin/env bash
#
# One-time history scrub for wayfin-mvp.
#
# Removes two things from every commit in the repository's history:
#
#   1. A phone number committed in src/components/RateSheet.jsx as
#      FOUNDER_WHATSAPP. It is currently readable on GitHub at commit
#      2fd7fe0 even though a later commit deleted the line. Git keeps
#      deleted content; deleting a line does not unpublish it.
#
#   2. The personal author email on all commits, replaced with GitHub's
#      noreply alias. GitHub renders the author email on every commit page,
#      so this is the more persistent of the two exposures. The author NAME
#      is already the GitHub handle and is left alone.
#
# WHAT THIS DOES NOT DO. Rewriting history creates new commits with new
# SHAs; it does not reach into GitHub and erase the old ones. Until GitHub
# garbage-collects them, the original commits stay reachable by direct SHA
# URL to anyone holding one. To have them purged, open a request with
# GitHub Support (https://support.github.com/) AFTER force-pushing, quoting
# the repository and the old commit SHA 2fd7fe0.
#
# Treat the number as already disclosed and plan accordingly. This reduces
# discoverability; it does not undo publication.
#
# Safe to re-run: it works on a throwaway mirror clone in a temp directory
# and never touches your working repository. Nothing is pushed — the script
# prints the push command for you to run once you have reviewed the result.

set -euo pipefail

# USAGE
#     ./scripts/scrub-history.sh <phone-digits> <author-email> [other-string ...]
#
# The values to scrub are passed in rather than hardcoded, for the obvious
# reason: a script that removes your phone number from git history must not
# itself commit your phone number to git history.
#
#     ./scripts/scrub-history.sh 91XXXXXXXXXX you@example.com project@gmail.com
#
# Trailing arguments are extra literal strings to redact from both file
# contents and commit messages — useful for a contact address that ended up
# in a commit subject line.

REPO_URL="https://github.com/justToLearnNExplore/wayfin-mvp.git"
NEW_EMAIL="justToLearnNExplore@users.noreply.github.com"

PHONE="${1:-}"
OLD_EMAIL="${2:-}"

if [ -z "$PHONE" ] || [ -z "$OLD_EMAIL" ]; then
  echo "usage: $0 <phone-digits> <author-email> [other-string ...]"
  echo "   eg: $0 91XXXXXXXXXX you@example.com project@gmail.com"
  exit 1
fi

shift 2
EXTRA_STRINGS=("$@")

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo is required. Install it with:"
  echo "    pip3 install git-filter-repo"
  exit 1
fi

WORKDIR="$(mktemp -d)"
echo "==> Working in $WORKDIR"

# A fresh mirror clone, so nothing here can damage your local checkout.
git clone --mirror "$REPO_URL" "$WORKDIR/wayfin.git"
cd "$WORKDIR/wayfin.git"

{
  printf '%s==>REDACTED\n' "$PHONE"
  for s in ${EXTRA_STRINGS+"${EXTRA_STRINGS[@]}"}; do
    printf '%s==>REDACTED\n' "$s"
  done
} > "$WORKDIR/replacements.txt"

echo "==> Redacting from file contents and commit messages:"
sed 's/^/      /' "$WORKDIR/replacements.txt"

# Three rewrites in one pass:
#   --replace-text    file contents (blobs)
#   --replace-message commit messages — a separate flag, because --replace-text
#                     does NOT touch them, and one of ours names an address in
#                     its subject line
#   --email-callback  commit author/committer metadata
git filter-repo --force \
  --replace-text "$WORKDIR/replacements.txt" \
  --replace-message "$WORKDIR/replacements.txt" \
  --email-callback "return b'${NEW_EMAIL}' if email == b'${OLD_EMAIL}' else email"

echo
echo "==> Verifying"

for needle in "$PHONE" ${EXTRA_STRINGS+"${EXTRA_STRINGS[@]}"}; do
  if git grep -qF "$needle" $(git rev-list --all) -- 2>/dev/null; then
    echo "    FAILED: '$needle' still present in a blob. Do not push."
    exit 1
  fi
  if git log --all --format='%B' | grep -qF "$needle"; then
    echo "    FAILED: '$needle' still present in a commit message. Do not push."
    exit 1
  fi
  echo "    redacted everywhere ... $needle"
done

if git log --all --format='%ae%n%ce' | grep -qF "$OLD_EMAIL"; then
  echo "    FAILED: the author email is still on some commits. Do not push."
  exit 1
fi
echo "    author email ......... rewritten to $NEW_EMAIL"

echo
echo "==> Done. NOTHING HAS BEEN PUSHED."
echo
echo "  Review:"
echo "      cd $WORKDIR/wayfin.git && git log --format='%h %an <%ae> %s' | head -30"
echo
echo "  Publish (destructive, rewrites the remote):"
echo "      cd $WORKDIR/wayfin.git && git push --force --mirror $REPO_URL"
echo
echo "  Then re-clone. Your current checkout holds the old SHAs and cannot be"
echo "  reconciled with the rewritten history:"
echo "      git clone $REPO_URL"
echo
echo "  Finally, stop it recurring:"
echo "      git config --global user.email '$NEW_EMAIL'"
echo "  and on GitHub enable Settings -> Emails -> 'Keep my email addresses"
echo "  private' and 'Block command line pushes that expose my email'."
