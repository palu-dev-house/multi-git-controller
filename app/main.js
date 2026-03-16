const { app, BrowserWindow, ipcMain, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

const SSH_DIR = path.join(os.homedir(), ".ssh");
const DEFAULT_KEY = path.join(SSH_DIR, "id_ed25519");
const DEFAULT_PUB = path.join(SSH_DIR, "id_ed25519.pub");

let DATA_FILE;
let mainWindow;

function getDataFile() {
  if (!DATA_FILE) {
    DATA_FILE = path.join(app.getPath("userData"), "accounts.json");
  }
  return DATA_FILE;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    title: "Multi-Git Controller",
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
// Data helpers
// ---------------------------------------------------------------------------
function readData() {
  const file = getDataFile();
  if (!fs.existsSync(file)) return { accounts: [] };
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return { accounts: [] };
  }
}

function writeData(data) {
  const file = getDataFile();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function keyPath(id) {
  return path.join(SSH_DIR, `git_${id}`);
}

function pubKeyPath(id) {
  return path.join(SSH_DIR, `git_${id}.pub`);
}

function ensureSSHDir() {
  if (!fs.existsSync(SSH_DIR)) {
    fs.mkdirSync(SSH_DIR, { mode: 0o700, recursive: true });
  }
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

// Get all accounts with key status
ipcMain.handle("get-accounts", () => {
  const data = readData();
  return data.accounts.map((acc) => {
    const hasPub = fs.existsSync(pubKeyPath(acc.id));
    let publicKey = "";
    if (hasPub) {
      try {
        publicKey = fs.readFileSync(pubKeyPath(acc.id), "utf-8").trim();
      } catch {}
    }
    return { ...acc, hasKey: hasPub, publicKey };
  });
});

// Detect which account is currently active (matches id_ed25519.pub)
ipcMain.handle("get-active", () => {
  if (!fs.existsSync(DEFAULT_PUB)) return null;
  try {
    const currentPub = fs.readFileSync(DEFAULT_PUB, "utf-8").trim();
    const data = readData();
    for (const acc of data.accounts) {
      if (fs.existsSync(pubKeyPath(acc.id))) {
        const accPub = fs.readFileSync(pubKeyPath(acc.id), "utf-8").trim();
        if (currentPub === accPub) return acc.id;
      }
    }
  } catch {}
  return null;
});

// Add a new account
ipcMain.handle("add-account", (_, account) => {
  const data = readData();
  if (data.accounts.find((a) => a.id === account.id)) {
    return { ok: false, message: "Account ID already exists" };
  }
  data.accounts.push({
    id: account.id,
    label: account.label,
    email: account.email,
    provider: account.provider,
    username: account.username,
  });
  writeData(data);
  return { ok: true };
});

// Remove an account and its keys
ipcMain.handle("remove-account", (_, id) => {
  const data = readData();
  data.accounts = data.accounts.filter((a) => a.id !== id);
  writeData(data);
  try {
    if (fs.existsSync(keyPath(id))) fs.unlinkSync(keyPath(id));
    if (fs.existsSync(pubKeyPath(id))) fs.unlinkSync(pubKeyPath(id));
  } catch {}
  return { ok: true };
});

// Generate SSH key for an account
ipcMain.handle("generate-key", async (_, id, email) => {
  ensureSSHDir();
  const kp = keyPath(id);
  if (fs.existsSync(kp)) {
    return { ok: false, message: "Key already exists for this account" };
  }

  return new Promise((resolve) => {
    const child = spawn(
      "ssh-keygen",
      ["-t", "ed25519", "-C", email, "-f", kp, "-N", ""],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.end("y\n");

    child.on("close", (code) => {
      if (code === 0) {
        try { fs.chmodSync(kp, 0o600); } catch {}
        try { fs.chmodSync(kp + ".pub", 0o644); } catch {}
        resolve({ ok: true, message: "SSH key generated" });
      } else {
        resolve({ ok: false, message: stderr || stdout || `Exit code ${code}` });
      }
    });

    child.on("error", (err) => resolve({ ok: false, message: err.message }));

    setTimeout(() => {
      child.kill();
      resolve({ ok: false, message: "ssh-keygen timed out" });
    }, 15000);
  });
});

// Switch active SSH key — copies account key to ~/.ssh/id_ed25519
ipcMain.handle("switch-account", (_, id) => {
  const src = keyPath(id);
  const srcPub = pubKeyPath(id);

  if (!fs.existsSync(src) || !fs.existsSync(srcPub)) {
    return { ok: false, message: "Key not found. Generate a key first." };
  }

  try {
    fs.copyFileSync(src, DEFAULT_KEY);
    fs.copyFileSync(srcPub, DEFAULT_PUB);
    try { fs.chmodSync(DEFAULT_KEY, 0o600); } catch {}
    try { fs.chmodSync(DEFAULT_PUB, 0o644); } catch {}
    return { ok: true, message: `Switched to ${id}` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

// Test SSH connection
ipcMain.handle("test-ssh", async (_, provider) => {
  const hosts = {
    github: "github.com",
    bitbucket: "bitbucket.org",
    gitlab: "gitlab.com",
  };
  const host = hosts[provider] || provider;

  try {
    const { stdout, stderr } = await execAsync(
      `ssh -T -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new git@${host} 2>&1`,
      { timeout: 15000 }
    );
    const output = stdout + stderr;
    return { ok: isSSHSuccess(output), output };
  } catch (err) {
    const output = (err.stdout || "") + (err.stderr || "");
    return { ok: isSSHSuccess(output), output: output || err.message };
  }
});

function isSSHSuccess(output) {
  const lower = output.toLowerCase();
  return (
    lower.includes("successfully authenticated") ||
    lower.includes("you've successfully") ||
    lower.includes("authenticated via ssh key") ||
    lower.includes("you can use git") ||
    lower.includes("welcome to gitlab") ||
    lower.includes("logged in as")
  );
}

// Copy text to clipboard
ipcMain.handle("copy-to-clipboard", (_, text) => {
  clipboard.writeText(text);
  return true;
});
