import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join, delimiter } from 'path';

// Platform detection utilities
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;
const isWindows = process.platform === 'win32';
const isMacOS = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

// Holds whether OCR correction is enabled
// Default: enabled
let correctionEnabled = true;
// Timeout for the OCR correction process (in milliseconds)
const CORRECTION_TIMEOUT_MS = 5000;

// Resolves the Jockaigne runtime. We bundle both jars with the app.
// Helper
const resolveJavaRuntime = () => {
  const basePath = app.getAppPath();
  // In production, Java files are unpacked from ASAR to app.asar.unpacked
  const unpackedPath = basePath.replace('app.asar', 'app.asar.unpacked');
  const distCandidates = [
    process.env.JOCKAIGNE_DIST && join(process.env.JOCKAIGNE_DIST, ''),
    join(unpackedPath, 'java', 'dist'),
    join(basePath, 'java', 'dist'),
    join(process.cwd(), 'java', 'dist'),
  ].filter(Boolean);

  let distDir = distCandidates[0];
  let processorJar = null;
  let libraryJar = null;

  for (const candidate of distCandidates) {
    const candidateProcessor = join(candidate, 'jockaigne-processor.jar');
    const candidateLibrary = join(candidate, 'Jockaigne-1.0.jar');
    if (existsSync(candidateProcessor) && existsSync(candidateLibrary)) {
      distDir = candidate;
      processorJar = candidateProcessor;
      libraryJar = candidateLibrary;
      break;
    }
  }

  processorJar = process.env.JOCKAIGNE_JAR || processorJar || join(distDir, 'jockaigne-processor.jar');
  libraryJar = process.env.JOCKAIGNE_LIB || libraryJar || join(distDir, 'Jockaigne-1.0.jar');

  if (!existsSync(processorJar)) {
    return {
      error: 'Jockaigne processor jar not found. Run npm run build:java first.',
    };
  }

  if (!existsSync(libraryJar)) {
    return {
      error:
        'Jockaigne runtime jar not found. Ensure Jockaigne-1.0.jar is available.',
    };
  }

  const classpath = [processorJar, libraryJar].join(delimiter);
  const mainClass = process.env.JOCKAIGNE_MAIN || 'JockaigneProcessor';
  const bundled = resolveBundledJava(distDir);
  const exec = bundled?.exec ?? resolveJavaExecutable();

  // Returns the resolved runtime details
  return { classpath, mainClass, exec, runtimeHome: bundled?.runtimeRoot ?? null };
};

const resolveBundledJava = distDir => {
  const runtimeRoot =
    process.env.JOCKAIGNE_RUNTIME || (distDir && join(distDir, 'runtime'));
  if (!runtimeRoot) {
    return null;
  }

  const candidate = join(
    runtimeRoot,
    'bin',
    process.platform === 'win32' ? 'java.exe' : 'java'
  );
  if (existsSync(candidate)) {
    return { exec: candidate, runtimeRoot };
  }
  return null;
};

// Honours JAVA_HOME if present, otherwise tries to locate a JDK 24 under ~/.jdks, falling back to PATH.
// Helper
const resolveJavaExecutable = () => {
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const candidate = join(
      javaHome,
      'bin',
      process.platform === 'win32' ? 'java.exe' : 'java'
    );
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const detected = detectLocalJdk();
  if (detected && existsSync(detected)) {
    return detected;
  }

  return 'java';
};

const detectLocalJdk = () => {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) return null;

  const jdksDir = join(homeDir, '.jdks');
  if (!existsSync(jdksDir)) return null;

  try {
    const entries = readdirSync(jdksDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('jdk-24'))
      .map(entry => join(jdksDir, entry.name))
      .sort((a, b) => b.localeCompare(a));

    if (entries.length === 0) {
      return null;
    }

    const javaBinary = join(
      entries[0],
      'bin',
      process.platform === 'win32' ? 'java.exe' : 'java'
    );
    return javaBinary;
  } catch {
    return null;
  }
};

// Helper method to clean up output strings
// Helper
function cleanOutput(value) {
  return typeof value === 'string' ? value.trim() : value;
}

// IPC handlers for OCR correction
// Enables or disables the correction feature
ipcMain.on('ocr-correction:set-enabled', (_event, enabled) => {
  correctionEnabled = !!enabled;
});

// Runs the OCR correction on the provided text.
// Listens for the 'ocr-correction:run' IPC event from the renderer, then hands the payload to the runJockaigne child process,
// and relays the JockaineProcessors response back to the UI (corrected text, diagnostics, suggestions, etc.).
// A typical payload example looks like this: { text: 'raw OCR output', meta: { languages: ['eng'], confidence: 82 } }
ipcMain.handle('ocr-correction:run', async (_event, payload = {}) => {
  const text = payload?.text ?? '';

  // Early exit if we receive no text
  if (!text) {
    return { text: '', corrected: false, error: 'No text provided.' };
  }

  // If correction is disabled, returns the original text immediately
  if (!correctionEnabled) {
    return { text, corrected: false };
  }

  // Runs the Jockaigne correction process
  try {
    const meta = payload.meta || {};
    return await runJockaigne(text, meta);
  } catch (error) {
    return { text, corrected: false, error: error?.message || String(error) };
  }
});

// Main function to run the JockaigneProcessor Java application
// Spawns the actual JockaigneProcessor, sends the OCR request, and parses the structured JSON response.
async function runJockaigne(text, meta = {}) {
  const runtime = resolveJavaRuntime();

  // Early exit if runtime is not available
  if (!runtime || runtime.error) {
    const errorMessage =
      runtime?.error || 'Unable to resolve JockaigneProcessor runtime.';
    return { text, corrected: false, error: errorMessage };
  }

  // Returns a promise that resolves when the child process completes.
  return new Promise(resolve => {
    // Launches the packaged processor jar with the bundled library on the classpath.
    const child = spawn(
      runtime.exec,
      ['-cp', runtime.classpath, runtime.mainClass],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...(runtime.runtimeHome ? { JAVA_HOME: runtime.runtimeHome } : {}),
        },
      }
    );

    let stdout = '';
    let stderr = '';
    let finished = false;

    // Ensures we only resolve the promise once
    const finalize = result => {
      if (finished) return;
      finished = true;
      resolve(result);
    };

    // Sets up a timeout to kill the process if it takes too long
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finalize({
        text,
        corrected: false,
        error: 'JockaigneProcessor correction timed out.',
      });
    }, CORRECTION_TIMEOUT_MS);

    // Collects stdout from the Java helper; this should be a single JSON object.
    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    // Captures anything the helper prints to stderr so we can surface it for diagnostics.
    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    // Handles process errors
    child.on('error', err => {
      clearTimeout(timeout);
      finalize({ text, corrected: false, error: err.message });
    });

    // Handles process exit: clears timers, parses the helper output, and reports back to the renderer.
    child.on('close', code => {
      clearTimeout(timeout);
      const cleanedStdout = cleanOutput(stdout);
      const cleanedStderr = cleanOutput(stderr);

      if (code !== 0) {
        finalize({
          text,
          corrected: false,
          error: cleanedStderr || `JockaigneProcessor exited with code ${code}`,
        });
        return;
      }

      // Attempts to parse the JSON response
      try {
        const parsed = JSON.parse(cleanedStdout);
        if (!parsed || typeof parsed.text !== 'string') {
          throw new Error('Missing text field in processor response.');
        }

        finalize({
          text: parsed.text,
          original: parsed.original ?? text,
          corrected: parsed.text !== text,
          diagnostics: parsed.diagnostics ?? null,
          suggestions: Array.isArray(parsed.suggestions)
            ? parsed.suggestions
            : [],
          diagnosticsLog: cleanedStderr || null,
        });
      } catch (parseError) {
        finalize({
          text,
          corrected: false,
          error: 'Failed to parse JockaigneProcessor output.',
          diagnosticsLog: cleanedStderr || null,
        });
      }
    });

    // Serialises the request payload (text plus optional meta hints) and pipes it to the Jockaigne process.
    const payload = JSON.stringify({ text, meta });
    child.stdin.write(`${payload}\n`);
    child.stdin.end();
  });
}

// Sets up developer shortcuts for convenience
// Only active in development mode
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
      contextIsolation: true, // Security: Creates separate JavaScript context for the app vs Electron APIs (Prevents malicious code from accessing Electron NodeJS APIs directly) (https://www.electronjs.org/docs/latest/tutorial/process-model#:~:text=Although%20preload%20scripts%20share%20a%20window%20global%20with%20the%20renderer%20they%27re%20attached%20to%2C%20you%20cannot%20directly%20attach%20any%20variables%20from%20the%20preload%20script%20to%20window%20because%20of%20the%20contextIsolation%20default.)
      enableRemoteModule: false, // Security: Old way to access main process from renderer (deprecated). Now IPC (Inter-Process Communication) is used instead.
      nodeIntegration: false, // Security: no Node.js in renderer
      webSecurity: isDevelopment ? false : true, // Allows local resources to load in development (e.g., local files, mixed content). In Production, everything is bundled in the dist folder, and served from the same origin.
      allowRunningInsecureContent: isDevelopment, // Allows mixed content resources to be loaded in development (e.g., HTTP resources in HTTPS pages e.g. ). In production, this is disabled to prevent man in the middle attacks.
    },
  });

  // Shows window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Focuses window on Linux (sometimes needed)
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
    // macOS: Keeps the app running when window is closed
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

// Called when Electron has finished initialization
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

// macOS: Handles quit from menu/Cmd+Q
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
