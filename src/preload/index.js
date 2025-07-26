import { contextBridge, ipcRenderer } from 'electron';

// Exposes protected methods that allow the renderer process to use
// the ipcRenderer (Inter Process Communication Renderer) without exposing the entire object
const electronAPI = {
  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),

  // System info
  platform: process.platform, // Holds the platform (e.g., 'darwin' for macOS, 'win32' for Windows, 'linux' for Linux)

  // Version info
  versions: {
    node: process.versions.node, // Holds the Node.js version
    chrome: process.versions.chrome, // Holds the Chrome version
    electron: process.versions.electron, // Holds the Electron version
  },
};

// Custom APIs for the 'live lecture scan (LLS)' app
const api = {
  // File operations (for saving scanned text)
  saveTextFile: (content, filename) =>
    ipcRenderer.invoke('save-text-file', content, filename),
  openFile: () => ipcRenderer.invoke('open-file'),

  // App-specific features
  showNotification: (title, body) =>
    ipcRenderer.invoke('show-notification', title, body),

  // Future OCR/camera features will go here
  // processImage: (imageData) => ipcRenderer.invoke('process-image', imageData),
};

// Uses `contextBridge` APIs to expose Electron APIs to renderer
// This is the secure way to communicate between the main and renderer processes
// We set the `contextIsolated` flag to true in the main process to enable context isolation (see src/main/index.js)
// This prevents the renderer process from accessing Node.js APIs directly, enhancing security
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
    console.log('🔒 Context bridge APIs exposed securely');
  } catch (error) {
    console.error('❌ Failed to expose context bridge APIs:', error);
  }
} else {
  // Fallback for when context isolation is disabled (not recommended in production)
  console.warn(
    '⚠️ Context isolation is disabled! Exposing APIs directly to window object'
  );
  window.electron = electronAPI;
  window.api = api;
}
