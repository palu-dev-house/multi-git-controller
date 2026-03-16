// =============================================================================
// Multi-Git Controller — Renderer
// =============================================================================

let activeId = null;

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
function toast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  el.addEventListener("click", () => el.remove());
  container.appendChild(el);
  if (type !== "fail") setTimeout(() => el.remove(), 4000);
}

// ---------------------------------------------------------------------------
// Load & Render
// ---------------------------------------------------------------------------
async function load() {
  const [accounts, active] = await Promise.all([
    window.api.getAccounts(),
    window.api.getActive(),
  ]);
  activeId = active;
  renderBanner(accounts, active);
  renderAccounts(accounts, active);
}

function renderBanner(accounts, active) {
  const banner = document.getElementById("active-banner");
  const label = document.getElementById("active-label");
  if (active) {
    const acc = accounts.find((a) => a.id === active);
    banner.classList.add("has-active");
    label.textContent = acc ? `Active: ${acc.label} (${acc.email})` : `Active: ${active}`;
  } else {
    banner.classList.remove("has-active");
    label.textContent = "No account active — select one below";
  }
}

function renderAccounts(accounts, active) {
  const list = document.getElementById("accounts-list");
  const empty = document.getElementById("empty-state");

  if (accounts.length === 0) {
    list.innerHTML = "";
    empty.style.display = "flex";
    return;
  }

  empty.style.display = "none";

  list.innerHTML = accounts
    .map(
      (acc) => `
    <div class="account-card ${acc.id === active ? "is-active" : ""}">
      <div class="card-top">
        <div class="card-info">
          <div class="card-label">${esc(acc.label)}</div>
          <div class="card-meta">
            <span class="provider-badge ${acc.provider}">${esc(acc.provider)}</span>
            <span>${esc(acc.email)}</span>
          </div>
          <div class="card-meta">
            <span>@${esc(acc.username)}</span>
          </div>
        </div>
        <div class="card-status">
          ${acc.id === active ? '<span class="badge active">Active</span>' : ""}
          ${acc.hasKey ? '<span class="badge key-ok">Key OK</span>' : '<span class="badge no-key">No Key</span>'}
        </div>
      </div>

      ${
        acc.hasKey && acc.publicKey
          ? `<div class="pubkey-box" title="Click to copy">
               <code>${esc(acc.publicKey)}</code>
             </div>`
          : ""
      }

      <div class="card-actions">
        ${
          !acc.hasKey
            ? `<button class="btn btn-primary btn-sm" data-action="generate" data-id="${attr(acc.id)}" data-email="${attr(acc.email)}">Generate SSH Key</button>`
            : `<button class="btn btn-ghost btn-sm" data-action="copy" data-id="${attr(acc.id)}">Copy Public Key</button>`
        }
        ${
          acc.hasKey && acc.id !== active
            ? `<button class="btn btn-accent btn-sm" data-action="switch" data-id="${attr(acc.id)}">Activate</button>`
            : ""
        }
        <button class="btn btn-ghost btn-sm" data-action="test" data-provider="${attr(acc.provider)}">Test SSH</button>
        <button class="btn btn-danger btn-sm" data-action="remove" data-id="${attr(acc.id)}" data-label="${attr(acc.label)}">Remove</button>
      </div>
    </div>`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) {
    // Click on pubkey-box to copy
    const pubbox = e.target.closest(".pubkey-box");
    if (pubbox) {
      const key = pubbox.querySelector("code").textContent;
      await window.api.copyToClipboard(key);
      toast("Public key copied to clipboard", "ok");
    }
    return;
  }

  const action = btn.dataset.action;

  switch (action) {
    case "generate": {
      const id = btn.dataset.id;
      const email = btn.dataset.email;
      btn.innerHTML = '<span class="spinner"></span> Generating...';
      btn.disabled = true;
      const result = await window.api.generateKey(id, email);
      toast(result.message, result.ok ? "ok" : "fail");
      await load();
      break;
    }

    case "copy": {
      const accounts = await window.api.getAccounts();
      const acc = accounts.find((a) => a.id === btn.dataset.id);
      if (acc && acc.publicKey) {
        await window.api.copyToClipboard(acc.publicKey);
        toast("Public key copied — add it to your Git provider", "ok");
      } else {
        toast("No public key found", "fail");
      }
      break;
    }

    case "switch": {
      const id = btn.dataset.id;
      btn.innerHTML = '<span class="spinner"></span> Switching...';
      btn.disabled = true;
      const result = await window.api.switchAccount(id);
      toast(result.message, result.ok ? "ok" : "fail");
      await load();
      break;
    }

    case "test": {
      const provider = btn.dataset.provider;
      const origText = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span> Testing...';
      btn.disabled = true;
      const result = await window.api.testSSH(provider);
      toast(result.ok ? `SSH connection OK: ${result.output}` : `SSH failed: ${result.output}`, result.ok ? "ok" : "fail");
      btn.textContent = origText;
      btn.disabled = false;
      break;
    }

    case "remove": {
      const id = btn.dataset.id;
      const label = btn.dataset.label;
      if (!confirm(`Remove account "${label}"? This will also delete its SSH key files.`)) return;
      await window.api.removeAccount(id);
      toast(`Removed: ${label}`, "info");
      await load();
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Add account
// ---------------------------------------------------------------------------
document.getElementById("btn-add").addEventListener("click", async () => {
  const id = document.getElementById("inp-id").value.trim();
  const label = document.getElementById("inp-label").value.trim();
  const email = document.getElementById("inp-email").value.trim();
  const provider = document.getElementById("inp-provider").value;
  const username = document.getElementById("inp-username").value.trim();

  if (!id || !label || !email || !username) {
    toast("All fields are required", "fail");
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    toast("ID must be alphanumeric (a-z, 0-9, -, _)", "fail");
    return;
  }

  const result = await window.api.addAccount({ id, label, email, provider, username });
  if (!result.ok) {
    toast(result.message, "fail");
    return;
  }

  // Clear form
  document.getElementById("inp-id").value = "";
  document.getElementById("inp-label").value = "";
  document.getElementById("inp-email").value = "";
  document.getElementById("inp-provider").value = "github";
  document.getElementById("inp-username").value = "";

  toast(`Added: ${label}`, "ok");
  await load();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attr(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
load();
