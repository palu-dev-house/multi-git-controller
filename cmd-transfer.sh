#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Multi-Git — Export / Import Commands
# Portable migration of keys + configs between machines
# Usage: cmd-transfer.sh export [dir]
#        cmd-transfer.sh import [dir]
# =============================================================================

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_accounts
ensure_ssh_dir

# ---- Export ------------------------------------------------------------------
do_export() {
  local export_dir="${1:-$HOME/multi-git-export}"
  mkdir -p "$export_dir"

  info "Exporting settings to: $export_dir"

  # SSH keys
  mkdir -p "$export_dir/ssh-keys"
  for account in "${ACCOUNTS[@]}"; do
    IFS='|' read -r label email host user <<< "$account"
    key_file="$SSH_DIR/id_ed25519_${label}"
    if [[ -f "$key_file" ]]; then
      cp "$key_file" "$export_dir/ssh-keys/"
      cp "${key_file}.pub" "$export_dir/ssh-keys/"
    fi
  done

  # Configs
  cp "$SSH_DIR/config" "$export_dir/ssh-config" 2>/dev/null || true
  cp "$SSH_DIR/allowed_signers" "$export_dir/allowed_signers" 2>/dev/null || true

  for account in "${ACCOUNTS[@]}"; do
    IFS='|' read -r label email host user <<< "$account"
    cp "$HOME/.gitconfig-${label}" "$export_dir/" 2>/dev/null || true
  done

  cp "$HOME/.gitconfig" "$export_dir/gitconfig-global" 2>/dev/null || true

  # Save accounts definition
  cp "$ACCOUNTS_FILE" "$export_dir/accounts.conf"

  # Create tarball
  local tarball="$HOME/multi-git-export.tar.gz"
  tar -czf "$tarball" -C "$(dirname "$export_dir")" "$(basename "$export_dir")"
  rm -rf "$export_dir"

  ok "Exported to: $tarball"
  echo ""
  echo "  Transfer to the new machine, then:"
  echo "    tar -xzf multi-git-export.tar.gz -C ~/"
  echo "    ./multi-git.sh import ~/multi-git-export"
}

# ---- Import ------------------------------------------------------------------
do_import() {
  local import_dir="${1:-$HOME/multi-git-export}"

  if [[ ! -d "$import_dir" ]]; then
    err "Import directory not found: $import_dir"
    echo "  Extract the tarball first:"
    echo "    tar -xzf multi-git-export.tar.gz -C ~/"
    exit 1
  fi

  info "Importing settings from: $import_dir"

  # SSH keys
  if [[ -d "$import_dir/ssh-keys" ]]; then
    cp "$import_dir/ssh-keys"/id_ed25519_* "$SSH_DIR/" 2>/dev/null || true
    chmod 600 "$SSH_DIR"/id_ed25519_*
    chmod 644 "$SSH_DIR"/id_ed25519_*.pub 2>/dev/null || true
    ok "SSH keys restored"
  fi

  # SSH config
  if [[ -f "$import_dir/ssh-config" ]]; then
    cp "$import_dir/ssh-config" "$SSH_DIR/config"
    chmod 600 "$SSH_DIR/config"
    ok "SSH config restored"
  fi

  # Allowed signers
  if [[ -f "$import_dir/allowed_signers" ]]; then
    cp "$import_dir/allowed_signers" "$SSH_DIR/allowed_signers"
    chmod 644 "$SSH_DIR/allowed_signers"
    ok "Allowed signers restored"
  fi

  # Per-account git configs
  for f in "$import_dir"/.gitconfig-*; do
    [[ -f "$f" ]] || continue
    cp "$f" "$HOME/"
    ok "Restored: ~/$(basename "$f")"
  done

  # Accounts config
  if [[ -f "$import_dir/accounts.conf" ]]; then
    cp "$import_dir/accounts.conf" "$ACCOUNTS_FILE"
    ok "Restored: accounts.conf"
  fi

  # Global gitconfig (safe merge)
  if [[ -f "$import_dir/gitconfig-global" ]]; then
    if [[ -f "$HOME/.gitconfig" ]]; then
      warn "Global .gitconfig already exists. Saved import as ~/.gitconfig-imported"
      cp "$import_dir/gitconfig-global" "$HOME/.gitconfig-imported"
      echo "  Review and merge manually: diff ~/.gitconfig ~/.gitconfig-imported"
    else
      cp "$import_dir/gitconfig-global" "$HOME/.gitconfig"
      ok "Global .gitconfig restored"
    fi
  fi

  ok "Import complete! Run './multi-git.sh dump' to verify."
}

# ---- Run ---------------------------------------------------------------------
action="${1:-}"
shift || true

case "$action" in
  export) do_export "${1:-}" ;;
  import) do_import "${1:-}" ;;
  *)
    err "Usage: cmd-transfer.sh {export|import} [dir]"
    exit 1
    ;;
esac
