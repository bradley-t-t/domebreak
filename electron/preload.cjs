// Bridge to the machine-local data folder (main process owns the files).
const {contextBridge, ipcRenderer} = require("electron");

contextBridge.exposeInMainWorld("gdLocal", {
    list: () => ipcRenderer.invoke("gd:list"),
    set: (key, value) => ipcRenderer.invoke("gd:set", key, value),
    del: (key) => ipcRenderer.invoke("gd:del", key),
    dir: () => ipcRenderer.invoke("gd:dir"),
});
