import { app, shell, BrowserWindow } from 'electron';
import { join } from 'path';

// Platform detection utilities
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;
const isWindows = process.platform === 'win32';
const isMacOS = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

function setupDeveloperShortcuts(window) {
  // Only enables shortcuts in development mode
  if (!isDevelopment) return;

  window.webContents.on('before-input-event', (event, input) => {
    // F12 - Toggle DevTools
    if (input.key === 'F12') {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }

    // Ctrl+Shift+I (Windows/Linux) or Cmd+Option+I (macOS) - Toggle DevTools
    if (input.key === 'I' && input.shift && (input.control || input.meta)) {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }

    // Ctrl+R (Windows/Linux) or Cmd+R (macOS) - Reload
    if (
      input.key === 'r' &&
      (input.control || input.meta) &&
      !input.shift &&
      !input.alt
    ) {
      window.webContents.reload();
      event.preventDefault();
    }

    // F5 - Reload (Windows/Linux)
    if (input.key === 'F5') {
      window.webContents.reload();
      event.preventDefault();
    }

    // Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (macOS) - Hard reload
    if (input.key === 'r' && input.shift && (input.control || input.meta)) {
      window.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
  });

  console.log('🔧 Development shortcuts enabled:');
  console.log('  F12 or Ctrl+Shift+I - Toggle DevTools');
  console.log('  Ctrl+R or F5 - Reload');
  console.log('  Ctrl+Shift+R - Hard reload');
}

function createWindow() {
  // Creates the browser window with platform-specific optimizations
  const mainWindow = new BrowserWindow({
    width: 1200, // Default width
    height: 800, // Default height
    minWidth: 800, // Minimum width
    minHeight: 600, // Minimum height
    show: false, // Don't show application window until ready
    autoHideMenuBar: true, // Hides the 'File'/'Edit'/'View' menu bar
    titleBarStyle: isMacOS ? 'hiddenInset' : 'default', // macOS-specific styling (If on macOS, hides the title bar but keeps the window controls (red, yellow, green buttons for close, minimize, maximize). On windows, it uses the default title bar style)

    // Security and performance optimizations
    backgroundColor: '#ffffff', // Default background color
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'), // Loads the preload script before the webpage is loaded (Exposes the Electron APIs to the renderer process securely)
      sandbox: true, // Security: Renderer runs in a restricted, sandboxed environment
      contextIsolation: true, // Security: Creates separate JavaScript context for the app vs Electron APIs (Prevents malicious code from accessing Electron NodeJS APIs directly)
      enableRemoteModule: false, // Security: Old way to access main process from renderer (deprecated). Now IPC (Inter-Process Communication) is used instead.
      nodeIntegration: false, // Security: no Node.js in renderer
      webSecurity: isDevelopment ? false : true, // Allows local resources to load in development (e.g., local files, mixed content). In Production, everything is bundled in the dist folder, and served from the same origin.
      allowRunningInsecureContent: isDevelopment, // Allows mixed content resources to be loaded in development (e.g., HTTP resources in HTTPS pages e.g. ). In production, this is disabled to prevent man in the middle attacks.
    },
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Focus window on Linux (sometimes needed)
    if (isLinux) {
      mainWindow.focus();
    }

    console.log('🚀 Application window ready');
  });

  // Handles external links securely
  mainWindow.webContents.setWindowOpenHandler(details => {
    console.log('🔗 Opening external URL:', details.url);
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Platform-specific window behavior
  if (isMacOS) {
    // macOS: Keep app running when window is closed
    mainWindow.on('close', event => {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });
  }

  // Loads the appropriate content based on the environment
  // If in development, loads from the development server
  if (isDevelopment && process.env['ELECTRON_RENDERER_URL']) {
    console.log(
      '🔥 Loading development server:',
      process.env['ELECTRON_RENDERER_URL']
    );
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);

    // Auto-opens the DevTools in development
    setTimeout(() => {
      mainWindow.webContents.openDevTools();
    }, 1000); // Small delay to ensure content is loaded

    // If in production, loads the bundled HTML file
  } else {
    console.log('📦 Loading production build');
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Sets up the development shortcuts we defined above
  console.log('🔧 Setting up developer shortcuts');
  setupDeveloperShortcuts(mainWindow);

  // Returns the created window
  console.log('🌟 Main window created successfully');
  return mainWindow;
}

// Platform-specific app setups
function setupPlatformSpecificBehavior() {
  // Windows: Sets app user model ID for proper taskbar grouping
  if (isWindows) {
    app.setAppUserModelId('com.samuel.live-lecture-scan');
    console.log('🪟 Windows app user model ID set');
  }

  // macOS: Sets app name in menu bar
  if (isMacOS) {
    app.setName('Live Lecture Scan');
    console.log('🍎 macOS app name set');
  }

  // Linux: Additional setup if needed
  if (isLinux) {
    console.log('🐧 Linux platform detected');
  }
}

// This method is called when Electron has finished initialization
app.whenReady().then(() => {
  console.log('⚡ Electron app ready');
  console.log(`🖥️  Platform: ${process.platform}`);
  console.log(
    `🔧 Environment: ${isDevelopment ? 'development' : 'production'}`
  );

  // Sets up platform-specific behavior
  setupPlatformSpecificBehavior();

  // Creates the main window
  createWindow();

  // macOS: Re-creates the window when the dock icon is clicked
  app.on('activate', function () {
    console.log('🔄 App activated');
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (isMacOS) {
      // Shows hidden window on macOS
      const existingWindow = BrowserWindow.getAllWindows()[0];
      existingWindow.show();
    }
  });
});

// Handles the app shutdown
app.on('window-all-closed', () => {
  console.log('🔚 All windows closed');

  // Platform-specific quit behavior
  if (isMacOS) {
    // macOS: Don't quit app when all windows are closed
    console.log('🍎 macOS: Keeping app running');
  } else {
    // Windows/Linux: Quit when all windows are closed
    console.log('🚪 Quitting application');
    app.quit();
  }
});

// macOS: Handle quit from menu/Cmd+Q
app.on('before-quit', () => {
  if (isMacOS) {
    app.isQuitting = true;
    console.log('🍎 macOS: App is quitting');
  }
});

// Handles security warnings in development
if (isDevelopment) {
  app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    });
  });
}
