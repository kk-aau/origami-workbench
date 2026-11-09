const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('messageWindow', {
  ready: () => ipcRenderer.invoke('desktop:message-ready'),
  show: () => ipcRenderer.send('desktop:message-show'),
  respond: accepted => ipcRenderer.send('desktop:message-response', accepted === true),
});
