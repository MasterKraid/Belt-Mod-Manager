const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const APP_START_MS = Date.now();

// Implement single instance lock to prevent cache/GPU directories from locking up
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Lock] Another instance of Belt Mod Manager is already running. Exiting second instance.');
  app.quit();
  process.exit(0);
}

// Automatically spawn and run the Express backend server internally!
const server = require('../server.js');

let mainWindow;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 840,
    show: false,
    backgroundColor: '#00000000',
    resizable: false,
    frame: false,
    transparent: true,
    maximizable: false,
    icon: path.join(__dirname, '../Assets/Belt.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      zoomFactor: 0.85
    }
  });
  
  mainWindow.once('ready-to-show', () => {
    console.log(`[Perf] Window ready-to-show in ${Date.now() - APP_START_MS}ms`);
    mainWindow.show();
  });

  // Wait until the backend is listening before loading the UI.
  await server.whenReady;
  const { host, port } = server.getServerInfo();
  console.log(`[Perf] Backend ready in ${Date.now() - APP_START_MS}ms`);
  mainWindow.loadURL(`http://${host}:${port}`);
}

app.whenReady().then(createWindow);
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.on('open-external', (event, url) => {
  try {
    if (typeof url !== 'string') return;
    if (url.startsWith('steam://')) {
      shell.openExternal(url);
      return;
    }
    const u = new URL(url);
    if (u.protocol !== 'https:') return;
    const allowed = new Set(['mods.factorio.com', 'assets-mod.factorio.com', 'mods-storage.re146.dev']);
    if (!allowed.has(u.hostname)) return;
    shell.openExternal(url);
  } catch {
    // ignore invalid urls
  }
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});
