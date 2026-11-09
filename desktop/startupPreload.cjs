const {contextBridge, ipcRenderer} = require('electron');

const GET_STATE = 'desktop:startup-get-state';
const STATE = 'desktop:startup-state';
const UI_READY = 'desktop:startup-ui-ready';
const listeners = new Set();
let latest, uiReady = false;

function deliver(callback) {
  try { callback({...latest.state}); }
  catch { return; /* One subscriber cannot strand the others. */ }
  if (!uiReady) {
    try { ipcRenderer.send(UI_READY); uiReady = true; }
    catch { /* A closing or failed window cannot block the main application. */ }
  }
}

function accept(envelope) {
  const value = envelope?.state;
  if (!Number.isSafeInteger(envelope?.revision) || envelope.revision < 0 ||
      latest && envelope.revision <= latest.revision || !value ||
      !['starting', 'service', 'workspace', 'error'].includes(value.stage) ||
      typeof value.version !== 'string' || typeof value.title !== 'string' ||
      typeof value.detail !== 'string' || typeof value.slow !== 'boolean') return;
  latest = {revision: envelope.revision, state: {version: value.version, stage: value.stage,
    title: value.title, detail: value.detail, slow: value.slow}};
  for (const callback of [...listeners]) deliver(callback);
}

// Subscribe before requesting the snapshot. Revisions prevent an older invoke
// reply from overwriting a more recent pushed stage; cache it for late UI code.
ipcRenderer.on(STATE, (_event, envelope) => accept(envelope));
try { Promise.resolve(ipcRenderer.invoke(GET_STATE)).then(accept).catch(() => {}); }
catch { /* A failed startup window cannot block the main renderer. */ }

contextBridge.exposeInMainWorld('startup', {
  onState(callback) {
    if (typeof callback !== 'function') return () => {};
    listeners.add(callback);
    if (latest) deliver(callback);
    return () => listeners.delete(callback);
  },
  close: () => ipcRenderer.send('desktop:startup-close'),
  openLogs: () => ipcRenderer.send('desktop:startup-open-logs'),
});
