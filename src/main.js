const { app, BrowserWindow, ipcMain} = require("electron");
const path = require("path");

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js") // Corrected path
        }
    });

    // Determines URL based on environment
    const devPath = "http://localhost:3000";
    const prodPath = `file://${path.join(__dirname, "../dist/index.html")}`;
    const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === "development";
    const url = isDevelopment ? devPath : prodPath;

    mainWindow.loadURL(url);

    // Opens the DevTools.
    if (isDevelopment) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    ipcMain.handle("ping", () => "pong");
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    })

    console.log("Electron has started successfully!");
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});