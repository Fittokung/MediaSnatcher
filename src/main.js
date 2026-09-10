const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { startServer, PORT } = require('./backend/server');

let mainWindow = null;
let serverInstance = null;

async function createWindow() {
  // Start Express Backend
  serverInstance = await startServer(PORT);

  // Create BrowserWindow
  mainWindow = new BrowserWindow({
    width: 1020,
    height: 820,
    minWidth: 800,
    minHeight: 650,
    title: 'MediaSnatcher',
    icon: path.join(__dirname, 'frontend/favicon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Open external links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load Express local URL
  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverInstance && serverInstance.close) {
    serverInstance.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
