"use strict";
const electron = require("electron");
const electronAPI = {
  // Window controls
  minimize: () => electron.ipcRenderer.invoke("window-minimize"),
  maximize: () => electron.ipcRenderer.invoke("window-maximize"),
  close: () => electron.ipcRenderer.invoke("window-close"),
  // System info
  platform: process.platform,
  // Holds the platform (e.g., 'darwin' for macOS, 'win32' for Windows, 'linux' for Linux)
  // Version info
  versions: {
    node: process.versions.node,
    // Holds the Node.js version
    chrome: process.versions.chrome,
    // Holds the Chrome version
    electron: process.versions.electron
    // Holds the Electron version
  }
}; // Test
const api = {
  // File operation: Saving scanned text to a file
  // => is a shorthand and is equivalent to function(content, filename) {
  //     return ipcRenderer.invoke('save-text-file', content, filename);
  //   }
  // So its just a function with parameters that returns something
  saveTextFile: (content, filename) => electron.ipcRenderer.invoke("save-text-file", content, filename),
  // File operation: Opening a file dialog to select a file
  openFile: () => electron.ipcRenderer.invoke("open-file"),
  // App-specific features
  showNotification: (title, body) => electron.ipcRenderer.invoke("show-notification", title, body),
  // OCR Correction feature
  setCorrectionEnabled: (enabled) => electron.ipcRenderer.send("ocr-correction:set-enabled", !!enabled),
  runCorrection: (payload) => electron.ipcRenderer.invoke("ocr-correction:run", payload)
  // Future OCR/camera features will go here
  // processImage: (imageData) => ipcRenderer.invoke('process-image', imageData),
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
    console.log("🔒 Context bridge APIs exposed securely");
  } catch (error) {
    console.error("❌ Failed to expose context bridge APIs:", error);
  }
} else {
  console.warn(
    "⚠️ Context isolation is disabled! Exposing APIs directly to window object"
  );
  window.electron = electronAPI;
  window.api = api;
}
