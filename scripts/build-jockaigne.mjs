#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const srcDir = path.join(repoRoot, 'java', 'src');
const outDir = path.join(repoRoot, 'java', 'out');
const distDir = path.join(repoRoot, 'java', 'dist');
const resourcesDir = path.join(repoRoot, 'java', 'resources');
const libSource = path.join(
  repoRoot,
  'java',
  'jockaigne-corrector',
  'libs',
  'Jockaigne-1.0.jar'
);
const processorJar = path.join(distDir, 'jockaigne-processor.jar');
const runtimeLib = path.join(distDir, 'Jockaigne-1.0.jar');
const runtimeDir = path.join(distDir, 'runtime');

// Defines our jockaigne processor main class
const mainClass = 'JockaigneProcessor';

// Detects the Java home directory which is usually set via JAVA_HOME environment variable.
// If not set, it looks for .jdks/jdk-24* directories under the user's home directory.
function detectJavaHome() {
  if (process.env.JAVA_HOME) {
    return process.env.JAVA_HOME;
  }

  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) {
    return null;
  }

  const jdksDir = path.join(home, '.jdks');
  if (!existsSync(jdksDir)) {
    return null;
  }

  const candidates = readdirSync(jdksDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^jdk-24/.test(entry.name))
    .map(entry => path.join(jdksDir, entry.name))
    .sort((a, b) => b.localeCompare(a));

  return candidates[0] ?? null;
}

const detectedJavaHome = detectJavaHome();
if (!process.env.JAVA_HOME && detectedJavaHome) {
  process.env.JAVA_HOME = detectedJavaHome;
}

function resolveTool(tool) {
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const candidate = path.join(
      javaHome,
      'bin',
      process.platform === 'win32' ? `${tool}.exe` : tool
    );
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return tool;
}

// Collects all .java files under the given directory recursively.
function collectJavaSources(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaSources(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.java')) {
      files.push(entryPath);
    }
  }
  return files;
}

function ensureDirectories() {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });
}

// Reads the JAVA_VERSION from the 'release' file in the given Java home directory.
function readJavaVersion(javaHome) {
  try {
    const releaseFile = path.join(javaHome, 'release');
    if (!existsSync(releaseFile)) {
      return null;
    }
    const contents = readFileSync(releaseFile, 'utf8');
    const match = contents.match(/JAVA_VERSION="?([^"]+)"?/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Bundles the Java runtime from the specified source root with the LLS application.
function bundleJavaRuntime(sourceRoot) {
  if (!sourceRoot) {
    console.warn('[build-jockaigne] No JDK detected – skipping bundled runtime copy.');
    return;
  }

  const javaBinary = path.join(
    sourceRoot,
    'bin',
    process.platform === 'win32' ? 'java.exe' : 'java'
  );

  if (!existsSync(javaBinary)) {
    console.warn(
      '[build-jockaigne] Could not locate java executable under',
      sourceRoot,
      '– skipping runtime bundle.'
    );
    return;
  }

  const detectedVersion = readJavaVersion(sourceRoot);
  if (detectedVersion && !detectedVersion.startsWith('24')) {
    console.warn(
      `[build-jockaigne] Detected JAVA_VERSION=${detectedVersion}. Expected a 24.x runtime for bundling.`
    );
  }

  mkdirSync(distDir, { recursive: true });
  const existingVersion = readJavaVersion(runtimeDir);

  if (existingVersion === detectedVersion && existsSync(runtimeDir)) {
    console.log('[build-jockaigne] Bundled runtime already up to date.');
    return;
  }

  console.log('[build-jockaigne] Copying bundled Java runtime...');
  rmSync(runtimeDir, { recursive: true, force: true });
  try {
    cpSync(sourceRoot, runtimeDir, {
      recursive: true,
      force: true,
      dereference: true,
    });
  } catch (error) {
    console.error('[build-jockaigne] Failed to copy runtime:', error);
    throw error;
  }
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}


// Main build process
function main() {
  if (!existsSync(srcDir)) {
    console.error('[build-jockaigne] No java/src directory found.');
    process.exit(1);
  }
  if (!existsSync(libSource)) {
    console.error('[build-jockaigne] Missing Jockaigne library at', libSource);
    process.exit(1);
  }

  const sources = collectJavaSources(srcDir);
  if (sources.length === 0) {
    console.warn('[build-jockaigne] No Java sources found to compile.');
    return;
  }

  ensureDirectories();

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const javac = resolveTool('javac');
  const jar = resolveTool('jar');

  console.log('[build-jockaigne] Compiling Java sources...');
  run(javac, ['-cp', libSource, '-d', outDir, ...sources]);

  console.log('[build-jockaigne] Packaging processor jar...');
  rmSync(processorJar, { force: true });
  const jarArgs = [
    '--create',
    '--file',
    processorJar,
    '--main-class',
    mainClass,
    '-C',
    outDir,
    '.',
  ];
  if (existsSync(resourcesDir)) {
    jarArgs.push('-C', resourcesDir, '.');
  }
  run(jar, jarArgs);

  if (
    !existsSync(runtimeLib) ||
    statSync(libSource).mtimeMs > statSync(runtimeLib).mtimeMs
  ) {
    console.log('[build-jockaigne] Copying Jockaigne runtime jar...');
    copyFileSync(libSource, runtimeLib);
  }

  const runtimeSource =
    process.env.JOCKAIGNE_RUNTIME || process.env.JAVA_HOME || detectedJavaHome;
  bundleJavaRuntime(runtimeSource);

  console.log('[build-jockaigne] Done.');
}

try {
  main();
} catch (error) {
  if (error?.status) {
    process.exit(error.status);
  }
  console.error('[build-jockaigne] Failed to build processor:', error);
  process.exit(1);
}
