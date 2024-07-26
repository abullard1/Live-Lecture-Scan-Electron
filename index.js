const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // Required if using nodeIntegration
        }
    });

    // Determine URL based on environment
    const devPath = 'http://localhost:3000'; // Adjust if your port is different
    const prodPath = `file://${path.join(__dirname, 'dist/index.html')}`;
    const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
    const url = isDevelopment ? devPath : prodPath;

    mainWindow.loadURL(url);

    // Open the DevTools.
    if (isDevelopment) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});