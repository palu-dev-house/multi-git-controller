#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Multi-Git — Dump Command
# Shows all current SSH + Git settings in one view
# =============================================================================

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_accounts
ensure_ssh_dir

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Current Multi-Git Settings Dump${NC}"
echo -e "${GREEN}=========================================${NC}"

# --- SSH Config ---------------------------------------------------------------
echo ""
echo -e "${CYAN}=== SSH Config (~/.ssh/config) ===${NC}"
if [[ -f "$SSH_DIR/config" ]]; then
  echo ""
  cat "$SSH_DIR/config"
else
  warn "No SSH config found"
fi

# --- SSH Keys -----------------------------------------------------------------
echo ""
echo -e "${CYAN}=== SSH Keys ===${NC}"
for account in "${ACCOUNTS[@]}"; do
  IFS='|' read -r label email host user <<< "$account"
  key_file="$SSH_DIR/id_ed25519_${label}"
  echo ""
  if [[ -f "$key_file" ]]; then
    echo -e "  ${YELLOW}[$label]${NC} ($email)"
    echo -e "  Private: ${GREEN}$key_file${NC} $([[ -f "$key_file" ]] && echo "[exists]" || echo "[missing]")"
    echo -e "  Public:  ${GREEN}${key_file}.pub${NC} $([[ -f "${key_file}.pub" ]] && echo "[exists]" || echo "[missing]")"
    echo "  Fingerprint: $(ssh-keygen -lf "${key_file}.pub" 2>/dev/null || echo "N/A")"
  else
    warn "[$label] Key missing: $key_file"
  fi
done

# --- Allowed Signers ---------------------------------------------------------
echo ""
echo -e "${CYAN}=== Allowed Signers (~/.ssh/allowed_signers) ===${NC}"
if [[ -f "$SSH_DIR/allowed_signers" ]]; then
  echo ""
  cat "$SSH_DIR/allowed_signers"
else
  warn "No allowed_signers file found"
fi

# --- Per-account Git Configs --------------------------------------------------
echo ""
echo -e "${CYAN}=== Per-Account Git Configs ===${NC}"
for account in "${ACCOUNTS[@]}"; do
  IFS='|' read -r label email host user <<< "$account"
  git_config="$HOME/.gitconfig-${label}"
  echo ""
  if [[ -f "$git_config" ]]; then
    echo -e "  ${YELLOW}[$label]${NC} -> $git_config"
    echo "  --------------------------------"
    sed 's/^/  /' "$git_config"
  else
    warn "[$label] Git config missing: $git_config"
  fi
done

# --- Global Git Config --------------------------------------------------------
echo ""
echo -e "${CYAN}=== Global Git Config (~/.gitconfig) ===${NC}"
if [[ -f "$HOME/.gitconfig" ]]; then
  echo ""
  cat "$HOME/.gitconfig"
else
  warn "No global .gitconfig found"
fi

# --- Current Repo Settings ----------------------------------------------------
echo ""
echo -e "${CYAN}=== Current Repo Settings ===${NC}"
if git rev-parse --is-inside-work-tree &>/dev/null; then
  repo_root=$(git rev-parse --show-toplevel)
  echo -e "  Repo:          ${GREEN}$repo_root${NC}"
  echo -e "  Remote origin: $(git remote get-url origin 2>/dev/null || echo "not set")"
  echo ""
  echo "  Git user/signing config (effective):"
  echo "  --------------------------------"
  echo "  user.name          = $(git config user.name 2>/dev/null || echo "not set")"
  echo "  user.email         = $(git config user.email 2>/dev/null || echo "not set")"
  echo "  user.signingkey    = $(git config user.signingkey 2>/dev/null || echo "not set")"
  echo "  gpg.format         = $(git config gpg.format 2>/dev/null || echo "not set")"
  echo "  commit.gpgsign     = $(git config commit.gpgsign 2>/dev/null || echo "not set")"
  echo "  tag.gpgsign        = $(git config tag.gpgsign 2>/dev/null || echo "not set")"
  echo "  gpg.ssh.allowedSignersFile = $(git config gpg.ssh.allowedSignersFile 2>/dev/null || echo "not set")"
  echo ""

  # Match account
  repo_email=$(git config user.email 2>/dev/null || echo "")
  matched="none"
  for account in "${ACCOUNTS[@]}"; do
    IFS='|' read -r label email host user <<< "$account"
    if [[ "$repo_email" == "$email" ]]; then
      matched="$label"
      break
    fi
  done
  echo -e "  Matched account:   ${YELLOW}${matched}${NC}"

  # Verify signing
  echo ""
  echo "  Signing verification:"
  echo "  --------------------------------"
  signing_key=$(git config user.signingkey 2>/dev/null || echo "")
  if [[ -n "$signing_key" && -f "$signing_key" ]]; then
    ok "  Signing key exists: $signing_key"
  elif [[ -n "$signing_key" ]]; then
    err "  Signing key NOT FOUND: $signing_key"
  else
    warn "  No signing key configured"
  fi

  if [[ "$(git config commit.gpgsign 2>/dev/null)" == "true" ]]; then
    ok "  Commit signing: enabled"
  else
    warn "  Commit signing: disabled"
  fi

  if [[ "$(git config gpg.format 2>/dev/null)" == "ssh" ]]; then
    ok "  Signing format: ssh"
  else
    warn "  Signing format: $(git config gpg.format 2>/dev/null || echo "not set (defaults to gpg)")"
  fi

  # Last commit
  echo ""
  echo "  Last commit signature:"
  echo "  --------------------------------"
  git log --show-signature -1 --format="  %h %s" 2>&1 | head -20 | sed 's/^/  /'
else
  warn "Not inside a git repository"
fi

echo ""
