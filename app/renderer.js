// =============================================================================
// Multi-Git — Renderer (UI Logic)
// =============================================================================

// In-memory cache of accounts for lookups
let cachedAccounts = [];

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${tab}`).classList.add("active");

    if (tab === "accounts" || tab === "keys") loadAccounts();
    if (tab === "settings") loadSettings();
    if (tab === "dump") loadDump();
    // repos tab loads on scan click
  });
});

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
  // Auto-dismiss after 5s for success/info, errors stay until clicked
  if (type !== "fail") {
    setTimeout(() => el.remove(), 5000);
  }
}

// ---------------------------------------------------------------------------
// Event Delegation — handles all button clicks via data-action
// ---------------------------------------------------------------------------
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const label = btn.dataset.label || "";
  const email = btn.dataset.email || "";
  const host = btn.dataset.host || "";

  switch (action) {
    case "generate-key": {
      btn.innerHTML = '<span class="spinner"></span> Generating...';
      btn.disabled = true;
      try {
        const result = await window.api.generateKey(label, email);
        toast(result.message, result.ok ? "ok" : "fail");
      } catch (err) {
        toast(`Error: ${err.message}`, "fail");
      }
      await loadAccounts();
      break;
    }

    case "copy-key": {
      try {
        const result = await window.api.copyPublicKey(label);
        toast(result.message, result.ok ? "ok" : "fail");
      } catch (err) {
        toast(`Copy failed: ${err.message}`, "fail");
      }
      break;
    }

    case "test-ssh": {
      const origText = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span> Testing...';
      btn.disabled = true;
      try {
        const result = await window.api.testSSH(host, label);
        toast(
          result.ok ? `[${label}] SSH OK` : `[${label}] Failed: ${result.output}`,
          result.ok ? "ok" : "fail"
        );
        // Update inline result if on keys tab
        const resultEl = document.getElementById(`test-result-${label}`);
        if (resultEl) {
          resultEl.textContent = result.output;
          resultEl.className = `key-test-result ${result.ok ? "ok" : "fail"}`;
        }
      } catch (err) {
        toast(`Error: ${err.message}`, "fail");
      }
      btn.textContent = origText;
      btn.disabled = false;
      break;
    }

    case "edit-account": {
      const card = btn.closest(".account-card");
      const isEditing = card.querySelector(".edit-form");
      if (isEditing) return;

      const acc = cachedAccounts.find((a) => a.label === label);
      if (!acc) return;

      const providerOptions = [
        { value: "github.com", text: "GitHub" },
        { value: "gitlab.com", text: "GitLab" },
        { value: "bitbucket.org", text: "Bitbucket" },
        { value: "codeberg.org", text: "Codeberg" },
        { value: "gitea.com", text: "Gitea" },
        { value: "sr.ht", text: "SourceHut" },
        { value: "dev.azure.com", text: "Azure DevOps" },
        { value: "ssh.dev.azure.com", text: "Azure DevOps (SSH)" },
      ];
      const isKnown = providerOptions.some((p) => p.value === acc.host);
      const selectOptions = providerOptions
        .map((p) => `<option value="${p.value}" ${p.value === acc.host ? "selected" : ""}>${p.text}</option>`)
        .join("") + `<option value="custom" ${!isKnown ? "selected" : ""}>Custom...</option>`;

      const actionsEl = card.querySelector(".account-card-actions");
      actionsEl.style.display = "none";

      const form = document.createElement("div");
      form.className = "edit-form";
      form.innerHTML = `
        <div class="form-row" style="margin-top:12px">
          <div class="form-group">
            <label>Email</label>
            <input type="email" class="edit-email" value="${escAttr(acc.email)}" />
          </div>
          <div class="form-group">
            <label>Provider</label>
            <select class="edit-host">${selectOptions}</select>
            <input type="text" class="edit-host-custom" placeholder="git.example.com" value="${!isKnown ? escAttr(acc.host) : ""}" style="display:${!isKnown ? "block" : "none"};margin-top:4px" />
          </div>
          <div class="form-group">
            <label>Username</label>
            <input type="text" class="edit-user" value="${escAttr(acc.user)}" />
          </div>
        </div>
        <div class="btn-group" style="margin-top:8px">
          <button class="btn btn-primary btn-sm" data-action="save-edit" data-label="${escAttr(label)}">Save</button>
          <button class="btn btn-ghost btn-sm" data-action="cancel-edit" data-label="${escAttr(label)}">Cancel</button>
        </div>`;
      card.appendChild(form);

      // Toggle custom host input
      form.querySelector(".edit-host").addEventListener("change", (ev) => {
        const customInput = form.querySelector(".edit-host-custom");
        customInput.style.display = ev.target.value === "custom" ? "block" : "none";
        if (ev.target.value !== "custom") customInput.value = "";
      });
      break;
    }

    case "save-edit": {
      const card = btn.closest(".account-card");
      const newEmail = card.querySelector(".edit-email").value.trim();
      const hostSel = card.querySelector(".edit-host").value;
      const hostCustom = card.querySelector(".edit-host-custom").value.trim();
      const newHost = sanitizeHost(hostSel === "custom" ? hostCustom : hostSel);
      const newUser = card.querySelector(".edit-user").value.trim();

      if (!newEmail || !newHost || !newUser) {
        toast("All fields are required", "fail");
        return;
      }

      const accounts = cachedAccounts.map((a) =>
        a.label === label ? { ...a, email: newEmail, host: newHost, user: newUser } : a
      );
      await window.api.saveAccounts(accounts);
      toast(`Updated account: ${label}`, "ok");
      await loadAccounts();
      break;
    }

    case "cancel-edit": {
      const card = btn.closest(".account-card");
      const form = card.querySelector(".edit-form");
      if (form) form.remove();
      const actionsEl = card.querySelector(".account-card-actions");
      if (actionsEl) actionsEl.style.display = "flex";
      break;
    }

    case "remove-account": {
      const accounts = cachedAccounts.filter((a) => a.label !== label);
      await window.api.saveAccounts(accounts);
      toast(`Removed account: ${label}`, "info");
      await loadAccounts();
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Provider select — show/hide custom input
// ---------------------------------------------------------------------------
document.getElementById("inp-host").addEventListener("change", (e) => {
  const custom = document.getElementById("inp-host-custom");
  custom.style.display = e.target.value === "custom" ? "block" : "none";
  if (e.target.value !== "custom") custom.value = "";
});

function sanitizeHost(raw) {
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "").trim();
}

function getSelectedHost() {
  const sel = document.getElementById("inp-host");
  if (sel.value === "custom") {
    return sanitizeHost(document.getElementById("inp-host-custom").value);
  }
  return sel.value;
}

// ---------------------------------------------------------------------------
// Accounts Tab
// ---------------------------------------------------------------------------
async function loadAccounts() {
  try {
    const accounts = await window.api.getAccounts();
    cachedAccounts = accounts;
    const list = document.getElementById("accounts-list");
    const empty = document.getElementById("accounts-empty");

    if (accounts.length === 0) {
      list.innerHTML = "";
      empty.style.display = "flex";
      renderKeys(accounts);
      return;
    }

    empty.style.display = "none";

    list.innerHTML = accounts
      .map((acc) => {
        const card = document.createElement("div");
        return `
      <div class="account-card">
        <div class="account-card-header">
          <div>
            <div class="account-label">${escHtml(acc.label)}</div>
            <div class="account-meta">
              <span>${escHtml(acc.email)}</span>
              <span>${escHtml(acc.host)} / ${escHtml(acc.user)}</span>
            </div>
          </div>
          <span class="status-badge ${acc.hasPublic ? "ok" : "missing"}">
            ${acc.hasPublic ? "Key OK" : "No Key"}
          </span>
        </div>
        <div class="account-card-actions">
          ${
            !acc.hasPublic
              ? `<button class="btn btn-primary btn-sm" data-action="generate-key" data-label="${escAttr(acc.label)}" data-email="${escAttr(acc.email)}">Generate Key</button>`
              : `<button class="btn btn-ghost btn-sm" data-action="copy-key" data-label="${escAttr(acc.label)}">Copy Public Key</button>`
          }
          <button class="btn btn-ghost btn-sm" data-action="edit-account" data-label="${escAttr(acc.label)}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="test-ssh" data-host="${escAttr(acc.host)}" data-label="${escAttr(acc.label)}">Test SSH</button>
          <button class="btn btn-danger btn-sm" data-action="remove-account" data-label="${escAttr(acc.label)}">Remove</button>
        </div>
      </div>`;
      })
      .join("");

    renderKeys(accounts);
  } catch (err) {
    toast(`Failed to load accounts: ${err.message}`, "fail");
  }
}

// Add account
document.getElementById("btn-add-account").addEventListener("click", async () => {
  try {
    const label = document.getElementById("inp-label").value.trim();
    const email = document.getElementById("inp-email").value.trim();
    const host = getSelectedHost();
    const user = document.getElementById("inp-user").value.trim();

    if (!label || !email || !host || !user) {
      toast("All fields are required", "fail");
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(label)) {
      toast("Label must be alphanumeric (a-z, 0-9, -, _)", "fail");
      return;
    }

    const accounts = await window.api.getAccounts();
    if (accounts.find((a) => a.label === label)) {
      toast(`Account "${label}" already exists`, "fail");
      return;
    }

    accounts.push({ label, email, host, user });
    await window.api.saveAccounts(accounts);

    document.getElementById("inp-label").value = "";
    document.getElementById("inp-email").value = "";
    document.getElementById("inp-host").value = "github.com";
    document.getElementById("inp-host-custom").value = "";
    document.getElementById("inp-host-custom").style.display = "none";
    document.getElementById("inp-user").value = "";

    toast(`Added account: ${label}`, "ok");
    loadAccounts();
  } catch (err) {
    console.error("[add] Error:", err);
    toast(`Error adding account: ${err.message}`, "fail");
  }
});

// Run full setup
document.getElementById("btn-run-setup").addEventListener("click", async () => {
  const btn = document.getElementById("btn-run-setup");
  btn.innerHTML = '<span class="spinner"></span> Running setup...';
  btn.disabled = true;

  try {
    const result = await window.api.runSetup();
    toast(result.ok ? "Setup completed successfully" : `Setup failed: ${result.output}`, result.ok ? "ok" : "fail");
  } catch (err) {
    toast(`Setup error: ${err.message}`, "fail");
  }

  btn.textContent = "Run Full Setup";
  btn.disabled = false;
  loadAccounts();
});

// ---------------------------------------------------------------------------
// Keys Tab
// ---------------------------------------------------------------------------
function renderKeys(accounts) {
  const container = document.getElementById("keys-list");

  if (accounts.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No accounts configured yet.</p></div>';
    return;
  }

  container.innerHTML = accounts
    .map(
      (acc) => `
    <div class="key-card">
      <div class="key-card-header">
        <div>
          <span class="key-card-label">${escHtml(acc.label)}</span>
          <span class="key-card-email">${escHtml(acc.email)}</span>
        </div>
        <span class="status-badge ${acc.hasPublic ? "ok" : "missing"}">
          ${acc.hasPublic ? "Key exists" : "No key"}
        </span>
      </div>
      ${acc.fingerprint ? `<div class="key-card-fingerprint">${escHtml(acc.fingerprint)}</div>` : ""}
      ${
        acc.publicKey
          ? `<div class="key-card-pubkey">${escHtml(acc.publicKey)}</div>`
          : '<p class="text-muted">No key generated yet. Run setup or generate individually.</p>'
      }
      <div class="key-card-actions">
        ${
          !acc.hasPublic
            ? `<button class="btn btn-primary btn-sm" data-action="generate-key" data-label="${escAttr(acc.label)}" data-email="${escAttr(acc.email)}">Generate Key</button>`
            : `<button class="btn btn-ghost btn-sm" data-action="copy-key" data-label="${escAttr(acc.label)}">Copy Public Key</button>`
        }
        <button class="btn btn-ghost btn-sm" data-action="test-ssh" data-host="${escAttr(acc.host)}" data-label="${escAttr(acc.label)}">Test SSH</button>
      </div>
      <div class="key-test-result" id="test-result-${escAttr(acc.label)}"></div>
    </div>
  `
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Repos Tab — Auto-detect & bulk assign
// ---------------------------------------------------------------------------
let scannedRepos = [];

function accountSelectHtml(selectedLabel) {
  const none = `<option value="">(none)</option>`;
  const opts = cachedAccounts
    .map((a) => `<option value="${escAttr(a.label)}" ${a.label === selectedLabel ? "selected" : ""}>${escHtml(a.label)} (${escHtml(a.email)})</option>`)
    .join("");
  return none + opts;
}

function renderRepoTable(repos) {
  const tbody = document.getElementById("repos-tbody");
  const stats = document.getElementById("repos-stats");
  const total = repos.length;
  const configured = repos.filter((r) => r.configured).length;
  const unconfigured = total - configured;

  stats.innerHTML = `
    <div class="repo-stat"><div class="repo-stat-value">${total}</div><div class="repo-stat-label">Total repos</div></div>
    <div class="repo-stat"><div class="repo-stat-value" style="color:var(--green)">${configured}</div><div class="repo-stat-label">Configured</div></div>
    <div class="repo-stat"><div class="repo-stat-value" style="color:var(--yellow)">${unconfigured}</div><div class="repo-stat-label">Unconfigured</div></div>
  `;
  stats.style.display = "flex";

  tbody.innerHTML = repos
    .map((r, i) => `
      <tr class="${r.configured ? "configured" : ""}" data-idx="${i}">
        <td class="col-check"><input type="checkbox" class="repo-check" data-idx="${i}" /></td>
        <td class="col-name">
          <div class="repo-name">${escHtml(r.name)}</div>
          <div class="repo-path">${escHtml(r.path.replace(window.api.homeDir, "~"))}</div>
        </td>
        <td class="col-remote"><div class="repo-remote">${escHtml(r.remote || "(no remote)")}</div></td>
        <td class="col-status">
          <span class="status-badge ${r.configured ? "ok" : "missing"}">${r.configured ? "Configured" : "Not set"}</span>
        </td>
        <td class="col-account">
          <select class="repo-account-sel" data-idx="${i}">${accountSelectHtml(r.matchedLabel)}</select>
        </td>
      </tr>
    `)
    .join("");

  document.getElementById("repos-list").style.display = "block";
  updateBulkBtn();
}

function updateBulkBtn() {
  const checked = document.querySelectorAll(".repo-check:checked").length;
  const btn = document.getElementById("btn-apply-bulk");
  btn.style.display = checked > 0 ? "inline-flex" : "none";
  btn.textContent = `Apply Selected (${checked})`;
}

// "Check all" toggle
document.getElementById("repo-check-all").addEventListener("change", (e) => {
  document.querySelectorAll(".repo-check").forEach((cb) => {
    cb.checked = e.target.checked;
    cb.closest("tr").classList.toggle("selected", e.target.checked);
  });
  updateBulkBtn();
});

// Individual checkbox
document.getElementById("repos-tbody")?.addEventListener("change", (e) => {
  if (e.target.classList.contains("repo-check")) {
    e.target.closest("tr").classList.toggle("selected", e.target.checked);
    updateBulkBtn();
  }
});

// Scan button
document.getElementById("btn-scan-repos").addEventListener("click", async () => {
  const btn = document.getElementById("btn-scan-repos");
  btn.innerHTML = '<span class="spinner"></span> Scanning...';
  btn.disabled = true;

  document.getElementById("repos-empty").style.display = "none";
  document.getElementById("repos-scanning").style.display = "block";
  document.getElementById("repos-list").style.display = "none";
  document.getElementById("repos-stats").style.display = "none";
  document.getElementById("bulk-result").style.display = "none";

  const scanPhase = document.getElementById("scan-phase");
  const scanBar = document.getElementById("scan-bar");
  const scanDetail = document.getElementById("scan-detail");
  const scanCounter = document.getElementById("scan-counter");
  const scanLog = document.getElementById("scan-log");
  scanLog.innerHTML = "";
  scanBar.style.width = "0%";
  scanCounter.textContent = "";

  // Listen for progress events
  const removeScanListener = window.api.onScanProgress((data) => {
    if (data.phase === "find") {
      scanPhase.textContent = "Searching...";
      scanDetail.textContent = data.message;
      scanBar.style.width = "0%";
      scanBar.style.background = "var(--accent)";
      // Indeterminate animation
      scanBar.style.width = "30%";
      scanBar.style.transition = "width 5s ease";
    } else if (data.phase === "inspect") {
      scanBar.style.transition = "width 0.15s ease";
      const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
      scanPhase.textContent = "Inspecting repos...";
      scanBar.style.width = `${pct}%`;
      scanDetail.textContent = data.repoName || data.message;
      scanCounter.textContent = `${data.current} / ${data.total}`;

      if (data.repoName) {
        const entry = document.createElement("div");
        entry.className = "scan-log-entry";
        entry.innerHTML = `<span class="idx">${data.current}</span><span class="name">${escHtml(data.repoName)}</span>`;
        scanLog.appendChild(entry);
        scanLog.scrollTop = scanLog.scrollHeight;
      }
    } else if (data.phase === "done") {
      scanPhase.textContent = "Complete";
      scanBar.style.width = "100%";
      scanBar.style.background = "var(--green)";
      scanDetail.textContent = data.message;
      scanCounter.textContent = `${data.total} / ${data.total}`;
    } else if (data.phase === "error") {
      scanPhase.textContent = "Error";
      scanBar.style.background = "var(--red)";
      scanDetail.textContent = data.message;
    }
  });

  try {
    const accounts = await window.api.getAccounts();
    cachedAccounts = accounts;

    scannedRepos = await window.api.scanRepos();

    // Hide spinner in header but keep the progress panel visible
    const spinnerEl = document.querySelector("#repos-scanning .spinner");
    if (spinnerEl) spinnerEl.style.display = "none";

    if (scannedRepos.length === 0) {
      document.getElementById("repos-empty").style.display = "flex";
      document.getElementById("repos-empty").querySelector("h3").textContent = "No repos found";
      document.getElementById("repos-empty").querySelector("p").textContent = "No git repositories found in your home directory.";
    } else {
      renderRepoTable(scannedRepos);
    }
  } catch (err) {
    // Keep progress panel visible to show the error
    const spinnerEl = document.querySelector("#repos-scanning .spinner");
    if (spinnerEl) spinnerEl.style.display = "none";
    scanPhase.textContent = "Error";
    scanBar.style.width = "100%";
    scanBar.style.background = "var(--red)";
    scanDetail.textContent = err.message;
    toast(`Scan failed: ${err.message}`, "fail");
  }

  removeScanListener();
  btn.textContent = "Scan Repos";
  btn.disabled = false;
});

// Bulk apply
document.getElementById("btn-apply-bulk").addEventListener("click", async () => {
  const assignments = [];
  document.querySelectorAll(".repo-check:checked").forEach((cb) => {
    const idx = parseInt(cb.dataset.idx);
    const row = cb.closest("tr");
    const label = row.querySelector(".repo-account-sel").value;
    if (label && scannedRepos[idx]) {
      assignments.push({ repoPath: scannedRepos[idx].path, label });
    }
  });

  if (assignments.length === 0) {
    toast("Select repos and assign accounts first", "fail");
    return;
  }

  const btn = document.getElementById("btn-apply-bulk");
  btn.innerHTML = '<span class="spinner"></span> Applying...';
  btn.disabled = true;

  const results = await window.api.setupReposBulk(assignments);
  btn.disabled = false;

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;

  const box = document.getElementById("bulk-result");
  box.style.display = "block";

  if (fail === 0) {
    box.className = "result-box ok";
    box.textContent = `All ${ok} repos configured successfully.`;
    toast(`${ok} repos configured`, "ok");
  } else {
    box.className = "result-box fail";
    box.textContent = `${ok} succeeded, ${fail} failed:\n` +
      results.filter((r) => !r.ok).map((r) => `  ${r.repoPath}: ${r.output}`).join("\n");
    toast(`${fail} repos failed`, "fail");
  }

  // Re-scan to refresh status
  scannedRepos = await window.api.scanRepos();
  renderRepoTable(scannedRepos);
  btn.textContent = `Apply Selected (0)`;
  btn.style.display = "none";
});

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------
async function loadSettings() {
  const [sshConfig, gitConfig] = await Promise.all([
    window.api.getSSHConfig(),
    window.api.getGitConfig(),
  ]);

  document.getElementById("ssh-config-content").textContent = sshConfig || "(empty or not found)";
  document.getElementById("git-config-content").textContent = gitConfig || "(empty or not found)";
}

document.getElementById("btn-export").addEventListener("click", async () => {
  const result = await window.api.exportSettings();
  toast(result.message, result.ok ? "ok" : "fail");
});

document.getElementById("btn-import").addEventListener("click", async () => {
  const result = await window.api.importSettings();
  toast(result.ok ? "Settings imported successfully" : result.message, result.ok ? "ok" : "fail");
  if (result.ok) {
    loadAccounts();
    loadSettings();
  }
});

// ---------------------------------------------------------------------------
// Dump Tab
// ---------------------------------------------------------------------------
async function loadDump() {
  const content = document.getElementById("dump-content");
  content.textContent = "Loading...";
  const dump = await window.api.getDump();
  content.textContent = dump;
}

document.getElementById("btn-refresh-dump").addEventListener("click", loadDump);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Escape for HTML text content (between tags)
function escHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Escape for HTML attribute values (inside quotes)
function escAttr(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------
loadAccounts();
