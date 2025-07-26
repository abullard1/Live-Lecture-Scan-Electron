"use strict";
const electron = require("electron");
const path = require("path");
const isDevelopment = process.env.NODE_ENV === "development" || !electron.app.isPackaged;
const isWindows = process.platform === "win32";
const isMacOS = process.platform === "darwin";
const isLinux = process.platform === "linux";
function setupDeveloperShortcuts(window) {
  if (!isDevelopment) return;
  window.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12") {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.key === "I" && input.shift && (input.control || input.meta)) {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.key === "r" && (input.control || input.meta) && !input.shift && !input.alt) {
      window.webContents.reload();
      event.preventDefault();
    }
    if (input.key === "F5") {
      window.webContents.reload();
      event.preventDefault();
    }
    if (input.key === "r" && input.shift && (input.control || input.meta)) {
      window.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
  });
  console.log("🔧 Development shortcuts enabled:");
  console.log("  F12 or Ctrl+Shift+I - Toggle DevTools");
  console.log("  Ctrl+R or F5 - Reload");
  console.log("  Ctrl+Shift+R - Hard reload");
}
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1200,
    // Default width
    height: 800,
    // Default height
    minWidth: 800,
    // Minimum width
    minHeight: 600,
    // Minimum height
    show: false,
    // Don't show application window until ready
    autoHideMenuBar: true,
    // Hides the 'File'/'Edit'/'View' menu bar
    titleBarStyle: isMacOS ? "hiddenInset" : "default",
    // macOS-specific styling (If on macOS, hides the title bar but keeps the window controls (red, yellow, green buttons for close, minimize, maximize). On windows, it uses the default title bar style)
    // Security and performance optimizations
    backgroundColor: "#ffffff",
    // Default background color
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      // Loads the preload script before the webpage is loaded (Exposes the Electron APIs to the renderer process securely)
      sandbox: true,
      // Security: Renderer runs in a restricted, sandboxed environment
      contextIsolation: true,
      // Security: Creates separate JavaScript context for the app vs Electron APIs (Prevents malicious code from accessing Electron NodeJS APIs directly)
      enableRemoteModule: false,
      // Security: Old way to access main process from renderer (deprecated). Now IPC (Inter-Process Communication) is used instead.
      nodeIntegration: false,
      // Security: no Node.js in renderer
      webSecurity: isDevelopment ? false : true,
      // Allows local resources to load in development (e.g., local files, mixed content). In Production, everything is bundled in the dist folder, and served from the same origin.
      allowRunningInsecureContent: isDevelopment
      // Allows mixed content resources to be loaded in development (e.g., HTTP resources in HTTPS pages e.g. ). In production, this is disabled to prevent man in the middle attacks.
    }
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isLinux) {
      mainWindow.focus();
    }
    console.log("🚀 Application window ready");
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    console.log("🔗 Opening external URL:", details.url);
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (isMacOS) {
    mainWindow.on("close", (event) => {
      if (!electron.app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });
  }
  if (isDevelopment && process.env["ELECTRON_RENDERER_URL"]) {
    console.log(
      "🔥 Loading development server:",
      process.env["ELECTRON_RENDERER_URL"]
    );
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    setTimeout(() => {
      mainWindow.webContents.openDevTools();
    }, 1e3);
  } else {
    console.log("📦 Loading production build");
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  console.log("🔧 Setting up developer shortcuts");
  setupDeveloperShortcuts(mainWindow);
  console.log("🌟 Main window created successfully");
  return mainWindow;
}
function setupPlatformSpecificBehavior() {
  if (isWindows) {
    electron.app.setAppUserModelId("com.samuel.live-lecture-scan");
    console.log("🪟 Windows app user model ID set");
  }
  if (isMacOS) {
    electron.app.setName("Live Lecture Scan");
    console.log("🍎 macOS app name set");
  }
  if (isLinux) {
    console.log("🐧 Linux platform detected");
  }
}
electron.app.whenReady().then(() => {
  console.log("⚡ Electron app ready");
  console.log(`🖥️  Platform: ${process.platform}`);
  console.log(
    `🔧 Environment: ${isDevelopment ? "development" : "production"}`
  );
  setupPlatformSpecificBehavior();
  createWindow();
  electron.app.on("activate", function() {
    console.log("🔄 App activated");
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (isMacOS) {
      const existingWindow = electron.BrowserWindow.getAllWindows()[0];
      existingWindow.show();
    }
  });
});
electron.app.on("window-all-closed", () => {
  console.log("🔚 All windows closed");
  if (isMacOS) {
    console.log("🍎 macOS: Keeping app running");
  } else {
    console.log("🚪 Quitting application");
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  if (isMacOS) {
    electron.app.isQuitting = true;
    console.log("🍎 macOS: App is quitting");
  }
});
if (isDevelopment) {
  electron.app.on("web-contents-created", (event, contents) => {
    contents.on("new-window", (event2, navigationUrl) => {
      event2.preventDefault();
      electron.shell.openExternal(navigationUrl);
    });
  });
}
