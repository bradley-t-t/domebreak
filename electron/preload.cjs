// Bridge to the machine-local data folder (main process owns the files).
const {contextBridge, ipcRenderer} = require("electron");

contextBridge.exposeInMainWorld("dbLocal", {
    list: () => ipcRenderer.invoke("db:list"),
    set: (key, value) => ipcRenderer.invoke("db:set", key, value),
    del: (key) => ipcRenderer.invoke("db:del", key),
    dir: () => ipcRenderer.invoke("db:dir"),
});
