"use strict";
const electron = require("electron");
const child_process = require("child_process");
const fs = require("fs");
const path = require("path");
const isDevelopment = process.env.NODE_ENV === "development" || !electron.app.isPackaged;
const isWindows = process.platform === "win32";
const isMacOS = process.platform === "darwin";
const isLinux = process.platform === "linux";
let correctionEnabled = true;
const CORRECTION_TIMEOUT_MS = 5e3;
const resolveJavaRuntime = () => {
  const basePath = electron.app.getAppPath();
  const distCandidates = [
    process.env.JOCKAIGNE_DIST && path.join(process.env.JOCKAIGNE_DIST, ""),
    path.join(basePath, "java", "dist"),
    path.join(process.cwd(), "java", "dist")
  ].filter(Boolean);
  let distDir = distCandidates[0];
  let processorJar = null;
  let libraryJar = null;
  for (const candidate of distCandidates) {
    const candidateProcessor = path.join(candidate, "jockaigne-processor.jar");
    const candidateLibrary = path.join(candidate, "Jockaigne-1.0.jar");
    if (fs.existsSync(candidateProcessor) && fs.existsSync(candidateLibrary)) {
      distDir = candidate;
      processorJar = candidateProcessor;
      libraryJar = candidateLibrary;
      break;
    }
  }
  processorJar = process.env.JOCKAIGNE_JAR || processorJar || path.join(distDir, "jockaigne-processor.jar");
  libraryJar = process.env.JOCKAIGNE_LIB || libraryJar || path.join(distDir, "Jockaigne-1.0.jar");
  if (!fs.existsSync(processorJar)) {
    return {
      error: "Jockaigne processor jar not found. Run npm run build:java first."
    };
  }
  if (!fs.existsSync(libraryJar)) {
    return {
      error: "Jockaigne runtime jar not found. Ensure Jockaigne-1.0.jar is available."
    };
  }
  const classpath = [processorJar, libraryJar].join(path.delimiter);
  const mainClass = process.env.JOCKAIGNE_MAIN || "JockaigneProcessor";
  const bundled = resolveBundledJava(distDir);
  const exec = bundled?.exec ?? resolveJavaExecutable();
  return { classpath, mainClass, exec, runtimeHome: bundled?.runtimeRoot ?? null };
};
const resolveBundledJava = (distDir) => {
  const runtimeRoot = process.env.JOCKAIGNE_RUNTIME || distDir && path.join(distDir, "runtime");
  if (!runtimeRoot) {
    return null;
  }
  const candidate = path.join(
    runtimeRoot,
    "bin",
    process.platform === "win32" ? "java.exe" : "java"
  );
  if (fs.existsSync(candidate)) {
    return { exec: candidate, runtimeRoot };
  }
  return null;
};
const resolveJavaExecutable = () => {
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const candidate = path.join(
      javaHome,
      "bin",
      process.platform === "win32" ? "java.exe" : "java"
    );
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const detected = detectLocalJdk();
  if (detected && fs.existsSync(detected)) {
    return detected;
  }
  return "java";
};
const detectLocalJdk = () => {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) return null;
  const jdksDir = path.join(homeDir, ".jdks");
  if (!fs.existsSync(jdksDir)) return null;
  try {
    const entries = fs.readdirSync(jdksDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith("jdk-24")).map((entry) => path.join(jdksDir, entry.name)).sort((a, b) => b.localeCompare(a));
    if (entries.length === 0) {
      return null;
    }
    const javaBinary = path.join(
      entries[0],
      "bin",
      process.platform === "win32" ? "java.exe" : "java"
    );
    return javaBinary;
  } catch {
    return null;
  }
};
function cleanOutput(value) {
  return typeof value === "string" ? value.trim() : value;
}
electron.ipcMain.on("ocr-correction:set-enabled", (_event, enabled) => {
  correctionEnabled = !!enabled;
});
electron.ipcMain.handle("ocr-correction:run", async (_event, payload = {}) => {
  const text = payload?.text ?? "";
  if (!text) {
    return { text: "", corrected: false, error: "No text provided." };
  }
  if (!correctionEnabled) {
    return { text, corrected: false };
  }
  try {
    const meta = payload.meta || {};
    return await runJockaigne(text, meta);
  } catch (error) {
    return { text, corrected: false, error: error?.message || String(error) };
  }
});
async function runJockaigne(text, meta = {}) {
  const runtime = resolveJavaRuntime();
  if (!runtime || runtime.error) {
    const errorMessage = runtime?.error || "Unable to resolve JockaigneProcessor runtime.";
    return { text, corrected: false, error: errorMessage };
  }
  return new Promise((resolve) => {
    const child = child_process.spawn(
      runtime.exec,
      ["-cp", runtime.classpath, runtime.mainClass],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ...runtime.runtimeHome ? { JAVA_HOME: runtime.runtimeHome } : {}
        }
      }
    );
    let stdout = "";
    let stderr = "";
    let finished = false;
    const finalize = (result) => {
      if (finished) return;
      finished = true;
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finalize({
        text,
        corrected: false,
        error: "JockaigneProcessor correction timed out."
      });
    }, CORRECTION_TIMEOUT_MS);
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      finalize({ text, corrected: false, error: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const cleanedStdout = cleanOutput(stdout);
      const cleanedStderr = cleanOutput(stderr);
      if (code !== 0) {
        finalize({
          text,
          corrected: false,
          error: cleanedStderr || `JockaigneProcessor exited with code ${code}`
        });
        return;
      }
      try {
        const parsed = JSON.parse(cleanedStdout);
        if (!parsed || typeof parsed.text !== "string") {
          throw new Error("Missing text field in processor response.");
        }
        finalize({
          text: parsed.text,
          original: parsed.original ?? text,
          corrected: parsed.text !== text,
          diagnostics: parsed.diagnostics ?? null,
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
          diagnosticsLog: cleanedStderr || null
        });
      } catch (parseError) {
        finalize({
          text,
          corrected: false,
          error: "Failed to parse JockaigneProcessor output.",
          diagnosticsLog: cleanedStderr || null
        });
      }
    });
    const payload = JSON.stringify({ text, meta });
    child.stdin.write(`${payload}
`);
    child.stdin.end();
  });
}
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
      // Security: Creates separate JavaScript context for the app vs Electron APIs (Prevents malicious code from accessing Electron NodeJS APIs directly) (https://www.electronjs.org/docs/latest/tutorial/process-model#:~:text=Although%20preload%20scripts%20share%20a%20window%20global%20with%20the%20renderer%20they%27re%20attached%20to%2C%20you%20cannot%20directly%20attach%20any%20variables%20from%20the%20preload%20script%20to%20window%20because%20of%20the%20contextIsolation%20default.)
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
