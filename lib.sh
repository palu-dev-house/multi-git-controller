#!/usr/bin/env bash
# =============================================================================
# Multi-Git — Shared library
# Sourced by all command scripts. Do not run directly.
# =============================================================================

SSH_DIR="$HOME/.ssh"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCOUNTS_FILE="$SCRIPT_DIR/accounts.conf"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# Load accounts from accounts.conf
# Populates the ACCOUNTS array
load_accounts() {
  ACCOUNTS=()

  if [[ ! -f "$ACCOUNTS_FILE" ]]; then
    err "accounts.conf not found at: $ACCOUNTS_FILE"
    echo "  Copy the example and edit it:"
    echo "  cp $SCRIPT_DIR/accounts.conf.example $ACCOUNTS_FILE"
    exit 1
  fi

  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Sanitize host — strip protocol prefix and trailing slashes
    IFS='|' read -r _l _e _h _u <<< "$line"
    _h=$(echo "$_h" | sed 's|^https\?://||; s|/\+$||')
    ACCOUNTS+=("${_l}|${_e}|${_h}|${_u}")
  done < "$ACCOUNTS_FILE"

  if [[ ${#ACCOUNTS[@]} -eq 0 ]]; then
    err "No accounts defined in $ACCOUNTS_FILE"
    exit 1
  fi
}

# Find a specific account by label
# Usage: find_account "personal"
# Sets: FOUND_LABEL, FOUND_EMAIL, FOUND_HOST, FOUND_USER
find_account() {
  local target="$1"
  for account in "${ACCOUNTS[@]}"; do
    IFS='|' read -r label email host user <<< "$account"
    if [[ "$label" == "$target" ]]; then
      FOUND_LABEL="$label"
      FOUND_EMAIL="$email"
      FOUND_HOST="$host"
      FOUND_USER="$user"
      return 0
    fi
  done
  return 1
}

# List available account labels
list_labels() {
  for account in "${ACCOUNTS[@]}"; do
    echo "$account" | cut -d'|' -f1
  done | tr '\n' ' '
}

# Ensure ~/.ssh exists
ensure_ssh_dir() {
  mkdir -p "$SSH_DIR"
  chmod 700 "$SSH_DIR"
}
