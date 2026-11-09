const { contextBridge, ipcRenderer } = require('electron');
const preference = (action, key, value, expectedValue) => {
  const result = ipcRenderer.sendSync('desktop:preferences', action, key, value, expectedValue);
  if (!result || result.error) throw new Error(result?.error || '桌面偏好设置不可用。');
  return result.value;
};
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  ready: () => ipcRenderer.send('desktop:ready'),
  openProject: kind => ipcRenderer.invoke('desktop:open-project',kind),
  preferences: {getItem: key => preference('get', key), setItem: (key, value) => preference('set', key, value),compareAndSet:(key,expectedValue,value)=>preference('compareAndSet',key,value,expectedValue)},
  storage: {pickDirectory:kind=>ipcRenderer.invoke('desktop:storage-pick',kind)},
  print: () => ipcRenderer.invoke('desktop:print'),
  confirm: message => ipcRenderer.sendSync('desktop:confirm', message) === true,
  onCommand: callback => {
    const listener = (_event, command) => { if (['open', 'save', 'export', 'print','settings'].includes(command)) callback(command); };
    ipcRenderer.on('desktop:command', listener);
    return () => ipcRenderer.removeListener('desktop:command', listener);
  },
});
