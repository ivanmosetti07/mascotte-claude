const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let spriteUrl = '';
try {
  const buf = fs.readFileSync(path.join(__dirname, 'assets', 'draco-sprites.png'));
  spriteUrl = 'data:image/png;base64,' + buf.toString('base64');
} catch (e) { spriteUrl = ''; }

contextBridge.exposeInMainWorld('pet', {
  spriteUrl: () => spriteUrl,
  onInit: (cb) => ipcRenderer.on('init', (_e, d) => cb(d)),
  onClaude: (cb) => ipcRenderer.on('claude', (_e, d) => cb(d)),
  onChat: (cb) => ipcRenderer.on('chat', (_e, d) => cb(d)),
  onScale: (cb) => ipcRenderer.on('scale', (_e, d) => cb(d)),
  onFocusInput: (cb) => ipcRenderer.on('focus-input', () => cb()),
  setIgnore: (ig) => ipcRenderer.send('set-ignore', ig),
  savePos: (pos) => ipcRenderer.send('save-pos', pos),
  ask: (text) => ipcRenderer.send('ask', text),
  openClaude: () => ipcRenderer.send('open-claude'),
  showMenu: () => ipcRenderer.send('show-menu'),
});
