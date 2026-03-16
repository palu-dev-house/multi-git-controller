const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getAccounts: () => ipcRenderer.invoke("get-accounts"),
  getActive: () => ipcRenderer.invoke("get-active"),
  addAccount: (account) => ipcRenderer.invoke("add-account", account),
  removeAccount: (id) => ipcRenderer.invoke("remove-account", id),
  generateKey: (id, email) => ipcRenderer.invoke("generate-key", id, email),
  switchAccount: (id) => ipcRenderer.invoke("switch-account", id),
  testSSH: (provider) => ipcRenderer.invoke("test-ssh", provider),
  copyToClipboard: (text) => ipcRenderer.invoke("copy-to-clipboard", text),
});
