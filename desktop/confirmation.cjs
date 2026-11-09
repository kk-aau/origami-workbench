// Keep sendSync's boolean contract while the independent, sandboxed message
// renderer remains interactive and answers asynchronously to the main process.
exports.registerConfirmation = ({ipcMain, getWindow, origin, messages}) => {
  const trusted = (event, owner) => {
    try {
      return !!owner && !owner.isDestroyed() && getWindow() === owner &&
        event.sender === owner.webContents && event.senderFrame === owner.webContents.mainFrame &&
        new URL(event.senderFrame.url).origin === origin;
    } catch { return false; }
  };
  const listener = (event, message) => {
    let replied = false;
    const reply = answer => {
      if (replied) return;
      replied = true;
      try { event.returnValue = answer === true; } catch { /* The caller may have closed. */ }
    };
    let owner;
    try {
      owner = getWindow();
      if (!trusted(event, owner) || typeof message !== 'string' || !message.trim() || message.length > 4096) {
        reply(false); return;
      }
      Promise.resolve(messages.confirm(owner, {
        title: '确认操作', message, cancelLabel: '取消', confirmLabel: '继续',
      })).then(answer => reply(trusted(event, owner) && answer === true), () => reply(false));
    } catch { reply(false); }
  };
  ipcMain.on('desktop:confirm', listener);
  return () => ipcMain.removeListener?.('desktop:confirm', listener);
};

/** Keep an unresponsive renderer from being the only way to answer a close.
 * A synchronous application confirmation already has its own independent window. */
exports.registerUnresponsiveRecovery = ({window, dialog, messages, onEvent = () => {}}) => {
  let stalled = false, pending = false;
  const activity = (action, details, level = 'info') => {
    try { onEvent({action, level, details}); } catch { /* Logging cannot change the user's closing choice. */ }
  };
  const ask = async () => {
    if (pending || window.isDestroyed() || messages?.hasPending?.(window)) return;
    pending = true;
    try {
      const result = await dialog.showMessageBox(window, {
        type: 'warning', title: '程序暂时没有响应',
        message: '当前操作尚未响应，要继续等待吗？',
        detail: '继续等待会保留当前窗口。结束窗口会丢失尚未保存的修改；已保存的工程文件仍保留。',
        buttons: ['继续等待', '结束窗口'], defaultId: 0, cancelId: 0, noLink: true,
      });
      const terminate = result.response === 1;
      activity(terminate ? 'desktop.close.force' : 'desktop.close.wait', {reason: 'unresponsive', result: terminate ? 'terminate' : 'wait'});
      if (terminate && !window.isDestroyed()) window.destroy();
    } catch { activity('desktop.close.wait', {reason: 'dialog-failed', result: 'wait'}, 'error'); }
    finally { pending = false; }
  };
  const unresponsive = () => {
    if (messages?.hasPending?.(window)) { activity('desktop.unresponsive', {status: 'waiting-confirmation'}); return; }
    activity('desktop.unresponsive', {status: 'detected'}, 'warning');
    stalled = true; void ask();
  };
  const responsive = () => { stalled = false; };
  const close = event => { if (stalled) { event?.preventDefault(); void ask(); } };
  window.on('unresponsive', unresponsive);
  window.on('responsive', responsive);
  window.on('close', close);
  return () => {
    window.removeListener('unresponsive', unresponsive);
    window.removeListener('responsive', responsive);
    window.removeListener('close', close);
  };
};
