const { contextBridge, ipcRenderer } = require('electron')

const on = (channel, fn) => ipcRenderer.on(channel, (_e, payload) => fn(payload))

contextBridge.exposeInMainWorld('pet', {
  setInteractive: (v) => ipcRenderer.send('pet:interactive', v),
  cursor: () => ipcRenderer.invoke('pet:cursor'),
  hide: () => ipcRenderer.send('pet:hide'),
  onSummon: (fn) => on('pet:summon', fn),
  onSpeak: (fn) => on('pet:speak', fn),
  onSnooze: (fn) => on('pet:snooze', fn),
  onWake: (fn) => on('pet:wake', fn),
  onResized: (fn) => on('pet:resized', fn),
  onReward: (fn) => on('pet:reward', fn),
  loadState: () => ipcRenderer.invoke('pet:loadState'),
  saveState: (data) => ipcRenderer.send('pet:saveState', data)
})
