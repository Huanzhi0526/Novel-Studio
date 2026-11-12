const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  invoke(method, args = {}) {
    return ipcRenderer.invoke('novel:invoke', method, args);
  },
  onCloseRequested(handler) {
    const callback = () => handler();
    ipcRenderer.on('novel:close-requested', callback);
    return () => ipcRenderer.removeListener('novel:close-requested', callback);
  }
});
