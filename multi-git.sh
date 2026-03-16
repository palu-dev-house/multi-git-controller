#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Multi-Git — CLI Entry Point
# Manage multiple SSH keys + Git accounts with verified (signed) commits
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_help() {
  cat <<'EOF'
Multi-Git — Multiple SSH + Git accounts with verified commits

Usage: ./multi-git.sh <command> [options]

Commands:
  setup              Generate SSH keys, SSH config, allowed_signers, git configs
  repo <label>       Configure current repo for a specific account
  keys               Print all public keys (for adding to GitHub/GitLab)
  test               Test SSH connection for all accounts
  dump               Show all current SSH + Git settings
  export [dir]       Export keys + configs to a portable tarball
  import [dir]       Import keys + configs from an exported bundle
  help               Show this help message

Getting started:
  1. cp accounts.conf.example accounts.conf
  2. Edit accounts.conf with your real accounts
  3. ./multi-git.sh setup
  4. Add keys to GitHub (both as Auth + Signing keys)
  5. ./multi-git.sh repo <label>   (in each repo)
EOF
}

case "${1:-help}" in
  setup)
    bash "$SCRIPT_DIR/cmd-setup.sh"
    ;;
  repo)
    shift
    bash "$SCRIPT_DIR/cmd-repo.sh" "$@"
    ;;
  keys)
    source "$SCRIPT_DIR/lib.sh"
    load_accounts
    echo ""
    for account in "${ACCOUNTS[@]}"; do
      IFS='|' read -r label email host user <<< "$account"
      key_file="$SSH_DIR/id_ed25519_${label}.pub"
      echo -e "${YELLOW}[$label]${NC} ($email):"
      if [[ -f "$key_file" ]]; then
        cat "$key_file"
      else
        warn "Key not found: $key_file (run './multi-git.sh setup' first)"
      fi
      echo ""
    done
    ;;
  test)
    source "$SCRIPT_DIR/lib.sh"
    load_accounts
    for account in "${ACCOUNTS[@]}"; do
      IFS='|' read -r label email host user <<< "$account"
      info "Testing [$label] -> ${host}-${label}..."
      ssh -T "git@${host}-${label}" 2>&1 || true
      echo ""
    done
    ;;
  dump)
    bash "$SCRIPT_DIR/cmd-dump.sh"
    ;;
  export)
    shift
    bash "$SCRIPT_DIR/cmd-transfer.sh" export "$@"
    ;;
  import)
    shift
    bash "$SCRIPT_DIR/cmd-transfer.sh" import "$@"
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    echo "Unknown command: $1"
    echo ""
    show_help
    exit 1
    ;;
esac
