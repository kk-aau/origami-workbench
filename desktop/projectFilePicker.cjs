const fs = require('node:fs/promises');
const path = require('node:path');

const PROJECT_KINDS = {
  crease: {
    title: '打开折痕工程',
    extensions: ['json', 'fold', 'cp', 'opx', 'ori', 'orh'],
  },
  diagram: {
    title: '打开折序工程',
    extensions: ['json'],
  },
};

function trustedRequest(event, owner, origin) {
  try {
    return !!owner && !owner.isDestroyed() &&
      event.sender === owner.webContents &&
      event.senderFrame === owner.webContents.mainFrame &&
      new URL(event.senderFrame.url).origin === origin;
  } catch {
    return false;
  }
}

function restoreOwnerFocus(owner) {
  try {
    if (!owner.isDestroyed() && owner.isVisible() && !owner.isMinimized()) {
      // Match native confirmation: Windows may otherwise leave the renderer unfocused.
      owner.blur();
      owner.focus();
      owner.webContents.focus();
    }
  } catch {
    // Closing the owner while a native dialog returns must not turn cancellation into an error.
  }
}

const changedFileMessage = '所选工程文件在读取期间发生变化，请等文件保存完成后重新打开。';

async function readSelectedFile(filePath) {
  const file = await fs.open(filePath, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('所选项目不是普通文件，请选择工程文件。');
    // Allocate the selected file's actual size, without a product size ceiling.
    // Read a fixed snapshot so an actively growing file cannot keep us reading
    // indefinitely. The unpooled buffer exposes only the selected file's bytes.
    const buffer = Buffer.allocUnsafeSlow(stat.size);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, Math.min(64 * 1024, buffer.length - length), null);
      if (!bytesRead) throw new Error(changedFileMessage);
      length += bytesRead;
    }
    const after = await file.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error(changedFileMessage);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, length);
  } finally {
    await file.close();
  }
}

exports.registerProjectFilePicker = ({ ipcMain, dialog, getWindow, origin }) => {
  let busy = false;
  ipcMain.handle('desktop:open-project', async (event, kind = 'crease') => {
    const owner = getWindow();
    if (!trustedRequest(event, owner, origin)) throw new Error('不允许此打开工程请求。');
    if (kind !== 'crease' && kind !== 'diagram') throw new Error('不支持的工程文件类型。');
    if (busy) return null;

    busy = true;
    const stillTrusted = () => getWindow() === owner && trustedRequest(event, owner, origin);
    try {
      const options = PROJECT_KINDS[kind];
      let selection;
      try {
        selection = await dialog.showOpenDialog(owner, {
          title: options.title,
          properties: ['openFile'],
          filters: [{ name: kind === 'crease' ? '折痕工程文件' : '折序工程文件', extensions: options.extensions }],
        });
      } finally {
        if (stillTrusted()) restoreOwnerFocus(owner);
      }
      if (!stillTrusted() || selection.canceled || !selection.filePaths?.[0]) return null;
      const filePath = selection.filePaths[0];
      let bytes;
      try {
        bytes = await readSelectedFile(filePath);
      } catch (error) {
        if (!stillTrusted()) return null;
        if (error?.message === changedFileMessage || error?.message === '所选项目不是普通文件，请选择工程文件。') throw error;
        throw new Error('无法读取所选工程文件，请检查文件是否存在、读取权限及可用内存。');
      }
      if (!stillTrusted()) return null;
      return { name: path.basename(filePath), bytes };
    } finally {
      busy = false;
    }
  });
};
