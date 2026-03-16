const { app, BrowserWindow, ipcMain, dialog, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile, exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const SSH_DIR = path.join(os.homedir(), ".ssh");

// In packaged app, shell scripts are in resources/scripts/
// In dev, they're in the parent directory
const SCRIPT_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "scripts")
  : path.resolve(__dirname, "..");

const ACCOUNTS_FILE = path.join(SCRIPT_DIR, "accounts.conf");
const ACCOUNTS_EXAMPLE = path.join(SCRIPT_DIR, "accounts.conf.example");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: "Multi-Git",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

// ---------------------------------------------------------------------------
// Sync IPC — needed by preload (sandbox blocks require("os"))
// ---------------------------------------------------------------------------
ipcMain.on("get-home-dir", (e) => {
  e.returnValue = os.homedir();
});

// ---------------------------------------------------------------------------
// Account config helpers
// ---------------------------------------------------------------------------
function parseAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) return [];
  const lines = fs.readFileSync(ACCOUNTS_FILE, "utf-8").split("\n");
  return lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [label, email, host, user] = l.split("|");
      return { label, email, host, user };
    })
    .filter((a) => a.label && a.email && a.host && a.user);
}

function sanitizeHost(raw) {
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "").trim();
}

function saveAccounts(accounts) {
  const header = [
    "# Multi-Git Accounts Configuration",
    "# Format: LABEL|EMAIL|GIT_HOST|GIT_USER",
    "",
  ].join("\n");
  const body = accounts.map((a) => `${a.label}|${a.email}|${sanitizeHost(a.host)}|${a.user}`).join("\n");
  fs.writeFileSync(ACCOUNTS_FILE, header + body + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

// Get all accounts with their key status
ipcMain.handle("get-accounts", async () => {
  const accounts = parseAccounts();
  const results = [];

  for (const acc of accounts) {
    const keyFile = path.join(SSH_DIR, `id_ed25519_${acc.label}`);
    const pubFile = `${keyFile}.pub`;
    const hasPrivate = fs.existsSync(keyFile);
    const hasPublic = fs.existsSync(pubFile);
    let fingerprint = "";
    let publicKey = "";

    if (hasPublic) {
      try {
        publicKey = fs.readFileSync(pubFile, "utf-8").trim();
        const { stdout } = await execAsync(`ssh-keygen -lf "${pubFile}"`);
        fingerprint = stdout.trim();
      } catch {}
    }

    results.push({
      ...acc,
      hasPrivate,
      hasPublic,
      fingerprint,
      publicKey,
      keyFile,
    });
  }

  return results;
});

// Check if accounts.conf exists
ipcMain.handle("has-config", () => fs.existsSync(ACCOUNTS_FILE));

// Save accounts
ipcMain.handle("save-accounts", (_, accounts) => {
  saveAccounts(accounts);
  return true;
});

// Generate SSH key for an account
ipcMain.handle("generate-key", async (_, label, email) => {
  const keyFile = path.join(SSH_DIR, `id_ed25519_${label}`);
  if (fs.existsSync(keyFile)) return { ok: true, message: "Key already exists" };

  if (!fs.existsSync(SSH_DIR)) {
    fs.mkdirSync(SSH_DIR, { mode: 0o700, recursive: true });
  }

  try {
    // Use spawn to handle stdin — prevents ssh-keygen from hanging on prompts
    const result = await new Promise((resolve, reject) => {
      const child = require("child_process").spawn(
        "ssh-keygen",
        ["-t", "ed25519", "-C", email, "-f", keyFile, "-N", ""],
        { stdio: ["pipe", "pipe", "pipe"] }
      );

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));

      // Auto-answer "yes" if ssh-keygen asks to overwrite
      child.stdin.end("y\n");

      child.on("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr || stdout || `ssh-keygen exited with code ${code}`));
      });

      child.on("error", reject);

      // Timeout after 15 seconds
      setTimeout(() => {
        child.kill();
        reject(new Error("ssh-keygen timed out"));
      }, 15000);
    });

    return { ok: true, message: `Generated: ${keyFile}` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

// Run full setup (keys + SSH config + allowed_signers + git configs)
ipcMain.handle("run-setup", async () => {
  try {
    const { stdout, stderr } = await execAsync(`bash "${path.join(SCRIPT_DIR, "cmd-setup.sh")}"`, {
      env: { ...process.env, HOME: os.homedir() },
    });
    return { ok: true, output: stdout + stderr };
  } catch (err) {
    return { ok: false, output: err.stdout + err.stderr + err.message };
  }
});

// Test SSH connection for an account
// Each provider has different success messages:
//   GitHub:    "successfully authenticated"
//   GitLab:    "Welcome to GitLab"
//   Bitbucket: "authenticated via ssh key"
//   Codeberg:  "successfully authenticated" (Gitea-based)
//   Gitea:     "successfully authenticated"
//   SourceHut: "logged in as"
//   Azure:     "shell request was successful"
function isSSHSuccess(output) {
  const lower = output.toLowerCase();
  return (
    lower.includes("successfully authenticated") ||
    lower.includes("you've successfully") ||
    lower.includes("authenticated via ssh key") ||
    lower.includes("welcome to gitlab") ||
    lower.includes("logged in as") ||
    lower.includes("shell request was successful") ||
    lower.includes("you can use git")
  );
}

ipcMain.handle("test-ssh", async (_, host, label) => {
  try {
    const { stdout, stderr } = await execAsync(`ssh -T -o ConnectTimeout=10 git@${host}-${label} 2>&1`, {
      timeout: 15000,
    });
    const output = stdout + stderr;
    return { ok: isSSHSuccess(output), output };
  } catch (err) {
    const output = (err.stdout || "") + (err.stderr || "");
    return { ok: isSSHSuccess(output), output: output || err.message };
  }
});

// Configure a repo for a specific account
ipcMain.handle("setup-repo", async (_, label, repoPath) => {
  try {
    const { stdout, stderr } = await execAsync(
      `bash "${path.join(SCRIPT_DIR, "cmd-repo.sh")}" "${label}"`,
      { cwd: repoPath, env: { ...process.env, HOME: os.homedir() } }
    );
    return { ok: true, output: stdout + stderr };
  } catch (err) {
    return { ok: false, output: (err.stdout || "") + (err.stderr || "") + err.message };
  }
});

// Get current repo info from a directory
ipcMain.handle("get-repo-info", async (_, repoPath) => {
  try {
    const cmds = [
      `git -C "${repoPath}" config user.name`,
      `git -C "${repoPath}" config user.email`,
      `git -C "${repoPath}" config user.signingkey`,
      `git -C "${repoPath}" config gpg.format`,
      `git -C "${repoPath}" config commit.gpgsign`,
      `git -C "${repoPath}" remote get-url origin`,
    ];

    const results = await Promise.allSettled(cmds.map((c) => execAsync(c)));
    const vals = results.map((r) => (r.status === "fulfilled" ? r.value.stdout.trim() : ""));

    return {
      ok: true,
      name: vals[0],
      email: vals[1],
      signingKey: vals[2],
      gpgFormat: vals[3],
      commitSign: vals[4],
      remote: vals[5],
    };
  } catch {
    return { ok: false };
  }
});

// Browse for a directory
ipcMain.handle("browse-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Git Repository",
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Scan for all git repos on the machine — sends progress events to renderer
ipcMain.handle("scan-repos", async (event) => {
  const home = os.homedir();
  const sender = event.sender;

  // Use -prune to skip directories entirely (much faster than -not -path)
  const excludes = [
    "node_modules", ".Trash", "Library", ".cache", ".npm", ".nvm",
    ".cargo", ".rustup", ".local", ".gradle", ".m2", "vendor",
    ".cocoapods", "Pods", ".gem", "go", ".docker",
    ".vscode", ".cursor", "Applications", "Movies", "Music", "Pictures",
  ];
  // Build: \( -name X -o -name Y \) -prune
  const pruneExpr = excludes.map((d) => `-name "${d}"`).join(" -o ");

  const send = (payload) => {
    try { sender.send("scan-progress", payload); } catch {}
  };

  try {
    send({ phase: "find", message: "Searching for git repositories..." });

    // -prune skips entire directory trees; then find .git dirs in the rest
    const cmd = `find "${home}" -maxdepth 6 \\( ${pruneExpr} \\) -prune -o -name .git -type d -print 2>/dev/null`;
    const { stdout } = await execAsync(cmd, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });

    const gitDirs = stdout.trim().split("\n").filter(Boolean);
    const total = gitDirs.length;
    send({ phase: "inspect", message: `Found ${total} repositories. Inspecting...`, total, current: 0 });

    const accounts = parseAccounts();
    const repos = [];

    for (let i = 0; i < gitDirs.length; i++) {
      const repoPath = path.dirname(gitDirs[i]);
      const repoName = path.basename(repoPath);

      send({ phase: "inspect", message: `Inspecting ${repoName}`, total, current: i + 1, repoName });

      try {
        const cmds = [
          `git -C "${repoPath}" config user.email`,
          `git -C "${repoPath}" config user.signingkey`,
          `git -C "${repoPath}" config commit.gpgsign`,
          `git -C "${repoPath}" remote get-url origin`,
        ];
        const results = await Promise.allSettled(cmds.map((c) => execAsync(c)));
        const vals = results.map((r) => (r.status === "fulfilled" ? r.value.stdout.trim() : ""));

        let matchedLabel = "";
        for (const acc of accounts) {
          if (vals[0] && vals[0] === acc.email) {
            matchedLabel = acc.label;
            break;
          }
        }
        if (!matchedLabel && vals[3]) {
          for (const acc of accounts) {
            if (vals[3].includes(acc.host) && vals[3].includes(acc.user)) {
              matchedLabel = acc.label;
              break;
            }
          }
        }

        repos.push({
          path: repoPath, name: repoName,
          email: vals[0], signingKey: vals[1], gpgSign: vals[2], remote: vals[3],
          matchedLabel, configured: !!(vals[1] && vals[2] === "true"),
        });
      } catch {
        repos.push({
          path: repoPath, name: repoName,
          email: "", signingKey: "", gpgSign: "", remote: "",
          matchedLabel: "", configured: false,
        });
      }
    }

    repos.sort((a, b) => {
      if (a.configured !== b.configured) return a.configured ? 1 : -1;
      return a.path.localeCompare(b.path);
    });

    send({ phase: "done", message: `Done. ${repos.length} repositories found.`, total: repos.length, current: repos.length });
    return repos;
  } catch (err) {
    send({ phase: "error", message: err.message });
    return [];
  }
});

// Setup multiple repos at once
ipcMain.handle("setup-repos-bulk", async (_, assignments) => {
  // assignments = [{ repoPath, label }, ...]
  const results = [];
  for (const { repoPath, label } of assignments) {
    try {
      const { stdout, stderr } = await execAsync(
        `bash "${path.join(SCRIPT_DIR, "cmd-repo.sh")}" "${label}"`,
        { cwd: repoPath, env: { ...process.env, HOME: os.homedir() } }
      );
      results.push({ repoPath, label, ok: true, output: stdout + stderr });
    } catch (err) {
      results.push({ repoPath, label, ok: false, output: (err.stdout || "") + (err.stderr || "") + err.message });
    }
  }
  return results;
});

// Get dump output
ipcMain.handle("get-dump", async () => {
  try {
    const { stdout, stderr } = await execAsync(`bash "${path.join(SCRIPT_DIR, "cmd-dump.sh")}"`, {
      env: { ...process.env, HOME: os.homedir(), TERM: "dumb" },
    });
    return stripAnsi(stdout + stderr);
  } catch (err) {
    return stripAnsi((err.stdout || "") + (err.stderr || "") + err.message);
  }
});

// Export settings
ipcMain.handle("export-settings", async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export Multi-Git Settings",
    defaultPath: path.join(os.homedir(), "multi-git-export.tar.gz"),
    filters: [{ name: "Tar Archive", extensions: ["tar.gz"] }],
  });
  if (result.canceled) return { ok: false, message: "Cancelled" };

  try {
    const { stdout, stderr } = await execAsync(
      `bash "${path.join(SCRIPT_DIR, "cmd-transfer.sh")}" export`,
      { env: { ...process.env, HOME: os.homedir() } }
    );
    // Move to user-selected path
    const defaultPath = path.join(os.homedir(), "multi-git-export.tar.gz");
    if (result.filePath !== defaultPath && fs.existsSync(defaultPath)) {
      fs.renameSync(defaultPath, result.filePath);
    }
    return { ok: true, message: `Exported to: ${result.filePath}` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

// Import settings
ipcMain.handle("import-settings", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import Multi-Git Settings",
    filters: [{ name: "Tar Archive", extensions: ["tar.gz"] }],
    properties: ["openFile"],
  });
  if (result.canceled) return { ok: false, message: "Cancelled" };

  try {
    await execAsync(`tar -xzf "${result.filePaths[0]}" -C "${os.homedir()}"`);
    const { stdout, stderr } = await execAsync(
      `bash "${path.join(SCRIPT_DIR, "cmd-transfer.sh")}" import`,
      { env: { ...process.env, HOME: os.homedir() } }
    );
    return { ok: true, message: stdout + stderr };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

// Copy public key to clipboard by label (reads file directly)
ipcMain.handle("copy-public-key", (_, label) => {
  const pubFile = path.join(SSH_DIR, `id_ed25519_${label}.pub`);
  if (!fs.existsSync(pubFile)) {
    return { ok: false, message: `Key not found: ${pubFile}` };
  }
  const key = fs.readFileSync(pubFile, "utf-8").trim();
  clipboard.writeText(key);
  return { ok: true, message: "Public key copied to clipboard" };
});

// Copy arbitrary text to clipboard
ipcMain.handle("copy-to-clipboard", (_, text) => {
  clipboard.writeText(text);
  return true;
});

// Get SSH config content
ipcMain.handle("get-ssh-config", () => {
  const configPath = path.join(SSH_DIR, "config");
  if (!fs.existsSync(configPath)) return "";
  return fs.readFileSync(configPath, "utf-8");
});

// Get global gitconfig
ipcMain.handle("get-gitconfig", () => {
  const configPath = path.join(os.homedir(), ".gitconfig");
  if (!fs.existsSync(configPath)) return "";
  return fs.readFileSync(configPath, "utf-8");
});

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
