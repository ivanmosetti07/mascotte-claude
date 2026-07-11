const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('promptApi', {
  current: () => ipcRenderer.sendSync('session-current'),
  submit: (url) => ipcRenderer.send('session-submit', url),
  cancel: () => ipcRenderer.send('session-cancel'),
});
