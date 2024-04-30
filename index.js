const { app, BrowserWindow } = require('electron');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });

    // Loads the index.html of the app.
    mainWindow.loadFile('index.html');

    // Open the DevTools (remove this line for production).
    mainWindow.webContents.openDevTools();
}

// Creates the window when the app is ready a and initialized.
app.whenReady().then(createWindow);

// Quits the application when all windows are closed (except on macOS).
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Re-creates a window when the dock icon is clicked (only on macOS).
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
