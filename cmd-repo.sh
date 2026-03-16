#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Multi-Git — Repo Command
# Configures the current (or specified) repo for a specific account
# Usage: cmd-repo.sh <label> [directory]
# =============================================================================

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_accounts
ensure_ssh_dir

label="${1:-}"
repo_dir="${2:-.}"

if [[ -z "$label" ]]; then
  err "Usage: multi-git.sh repo <label> [directory]"
  echo "  Available labels: $(list_labels)"
  exit 1
fi

if ! find_account "$label"; then
  err "Account '$label' not found. Available: $(list_labels)"
  exit 1
fi

key_file="$SSH_DIR/id_ed25519_${FOUND_LABEL}"

cd "$repo_dir"

git config user.email "$FOUND_EMAIL"
git config user.name "$FOUND_USER"
git config user.signingkey "${key_file}.pub"
git config gpg.format ssh
git config gpg.ssh.allowedSignersFile "$SSH_DIR/allowed_signers"
git config commit.gpgsign true
git config tag.gpgsign true

# Fix remote URL to use host alias
current_remote=$(git remote get-url origin 2>/dev/null || echo "")
if [[ -n "$current_remote" ]]; then
  new_remote=$(echo "$current_remote" \
    | sed "s|git@${FOUND_HOST}:|git@${FOUND_HOST}-${FOUND_LABEL}:|" \
    | sed "s|https://${FOUND_HOST}/|git@${FOUND_HOST}-${FOUND_LABEL}:|")
  git remote set-url origin "$new_remote"
  ok "Remote updated: $new_remote"
fi

ok "Repo configured for [$FOUND_LABEL] ($FOUND_EMAIL) with SSH signing"
