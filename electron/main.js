const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

// Automatically spawn and run the Express backend server internally!
require('../server.js');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, '../Assets/Belt.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  win.loadURL('http://localhost:3000');
}

app.whenReady().then(createWindow);
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});