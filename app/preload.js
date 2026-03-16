const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  homeDir: ipcRenderer.sendSync("get-home-dir"),
  getAccounts: () => ipcRenderer.invoke("get-accounts"),
  hasConfig: () => ipcRenderer.invoke("has-config"),
  saveAccounts: (accounts) => ipcRenderer.invoke("save-accounts", accounts),
  generateKey: (label, email) => ipcRenderer.invoke("generate-key", label, email),
  runSetup: () => ipcRenderer.invoke("run-setup"),
  testSSH: (host, label) => ipcRenderer.invoke("test-ssh", host, label),
  setupRepo: (label, repoPath) => ipcRenderer.invoke("setup-repo", label, repoPath),
  getRepoInfo: (repoPath) => ipcRenderer.invoke("get-repo-info", repoPath),
  browseDirectory: () => ipcRenderer.invoke("browse-directory"),
  getDump: () => ipcRenderer.invoke("get-dump"),
  exportSettings: () => ipcRenderer.invoke("export-settings"),
  importSettings: () => ipcRenderer.invoke("import-settings"),
  copyPublicKey: (label) => ipcRenderer.invoke("copy-public-key", label),
  copyToClipboard: (text) => ipcRenderer.invoke("copy-to-clipboard", text),
  getSSHConfig: () => ipcRenderer.invoke("get-ssh-config"),
  getGitConfig: () => ipcRenderer.invoke("get-gitconfig"),
  scanRepos: () => ipcRenderer.invoke("scan-repos"),
  onScanProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("scan-progress", handler);
    return () => ipcRenderer.removeListener("scan-progress", handler);
  },
  setupReposBulk: (assignments) => ipcRenderer.invoke("setup-repos-bulk", assignments),
});
