// レンダラー（ゲーム）に公開する API。js/platform.js から window.kakureDesktop として使う。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kakureDesktop', {
  readSave: () => ipcRenderer.invoke('save:read'),
  writeSave: (data) => ipcRenderer.invoke('save:write', data),
  achievement: (id) => ipcRenderer.invoke('achievement', id),
  isFullscreen: () => ipcRenderer.invoke('fullscreen:get'),
  setFullscreen: (on) => ipcRenderer.invoke('fullscreen:set', on),
  quit: () => ipcRenderer.invoke('quit'),
});
