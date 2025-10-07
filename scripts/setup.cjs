#!/usr/bin/env node

const { execSync, execFileSync } = require('child_process');
const { existsSync, readdirSync, copyFileSync, rmSync, readFileSync, mkdirSync } = require('fs');
const path = require('path');
const { join } = path;
const os = require('os');

const projectRoot = join(__dirname, '..');
const isWindows = os.platform() === 'win32';

function expandPath(value) {
  if (!value || typeof value !== 'string') {
    return undefined;
  }
  if (value.startsWith('~')) {
    return path.join(os.homedir(), value.slice(1));
  }
  return value;
}

function resolveAbsolutePath(value) {
  const expanded = expandPath(value);
  if (!expanded) {
    return undefined;
  }
  return path.isAbsolute(expanded) ? expanded : path.resolve(expanded);
}

console.log('🚀 Codex TypeScript SDK Setup\n');

// Check environment variables
const codexRustRootEnv = process.env.CODEX_RUST_ROOT;
const codexRustRoot = resolveAbsolutePath(codexRustRootEnv);
const defaultNativeModulePath = join(projectRoot, 'native', 'codex-napi', 'index.node');
let workspaceManifestPath;
let workspaceVersion;

function resolveCodexHome() {
  if (process.env.CODEX_HOME) {
    return process.env.CODEX_HOME;
  }
  if (codexRustRoot) {
    const direct = join(codexRustRoot, 'target', 'release');
    if (existsSync(direct)) {
      return direct;
    }
    const nested = join(codexRustRoot, 'codex-rs', 'target', 'release');
    if (existsSync(nested)) {
      return nested;
    }
  }
  return join(process.env.HOME || process.env.USERPROFILE, '.codex');
}

const codexHome = resolveCodexHome();
console.log('Environment:');
console.log(`  Project root: ${projectRoot}`);
console.log(`  CODEX_RUST_ROOT: ${codexRustRoot || '(not set)'}`);
console.log(`  CODEX_HOME: ${codexHome}\n`);

if (!codexRustRoot) {
  console.error('❌ CODEX_RUST_ROOT must point to your codex-rs checkout (e.g. /path/to/codex/codex-rs)');
  process.exit(1);
}

workspaceManifestPath = locateCodexManifest(codexRustRoot);
if (!workspaceManifestPath) {
  console.error(
    '❌ Unable to find codex-rs Cargo.toml. Ensure CODEX_RUST_ROOT points to the codex-rs directory or its parent.',
  );
  process.exit(1);
}

workspaceVersion = extractWorkspaceVersion(workspaceManifestPath);
if (!workspaceVersion) {
  console.error(
    `❌ Unable to read version from ${workspaceManifestPath}. Verify the repository is a valid codex-rs checkout.`,
  );
  process.exit(1);
}

if (workspaceVersion === '0.0.0') {
  console.error(
    `❌ codex-rs version reported as 0.0.0 at ${workspaceManifestPath}. Check out a release tag (e.g. rust-v0.42.0) before running setup.`,
  );
  process.exit(1);
}

console.log(`ℹ️  Using codex-rs manifest: ${workspaceManifestPath}`);
console.log(`ℹ️  codex-rs version: ${workspaceVersion}\n`);

console.log('');

// Step 1: Check for Codex runtime directory
console.log('Step 1: Checking for Codex runtime directory...');
console.log('   (set CODEX_HOME via Environment Variables section of the README)');
if (existsSync(codexHome)) {
  console.log(`✅ Found Codex runtime directory: ${codexHome}`);
} else {
  console.log(`⚠️  Codex runtime directory not found at: ${codexHome}`);
  console.log('\nInstallation Option 1: run `codex --version` once so codex-cli populates ~/.codex, then re-run this script.');
  console.log('Installation Option 2: rebuild codex-rs locally (optional if you just need the binding).');
  if (isWindows) {
    console.log('1. Set CODEX_RUST_ROOT: $env:CODEX_RUST_ROOT = "C:\\path\\to\\codex"');
    console.log('2. Clone: git clone https://github.com/openai/codex.git $env:CODEX_RUST_ROOT');
    console.log('3. Build: cd $env:CODEX_RUST_ROOT\\codex-rs; cargo build --release');
    console.log('4. Set CODEX_HOME: $env:CODEX_HOME = "$env:CODEX_RUST_ROOT\\codex-rs\\target\\release"');
  } else {
    console.log('1. Set CODEX_RUST_ROOT: export CODEX_RUST_ROOT=/path/to/codex');
    console.log('2. Clone: git clone https://github.com/openai/codex.git $CODEX_RUST_ROOT');
    console.log('3. Build: cd $CODEX_RUST_ROOT/codex-rs && cargo build --release');
    console.log('4. Set CODEX_HOME: export CODEX_HOME=$CODEX_RUST_ROOT/codex-rs/target/release');
  }
  console.log(
    '   codex-cli installs to ~/.codex automatically. If you build from main the CLI reports 0.0.0; use a release tag for real version numbers.',
  );
}

// Step 2: Install dependencies
console.log('Step 2: Installing dependencies...');
try {
  execSync('npm ci', { cwd: projectRoot, stdio: 'inherit' });
  console.log('✅ Dependencies installed\n');
} catch (error) {
  console.error('❌ Failed to install dependencies');
  process.exit(1);
}

// Step 3: Build TypeScript SDK
console.log('Step 3: Building TypeScript SDK...');
try {
  execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
  console.log('✅ TypeScript SDK built\n');
} catch (error) {
  console.error('❌ Failed to build TypeScript SDK');
  process.exit(1);
}

// Step 4: Build native binding
console.log('Step 4: Building native N-API binding...');
const nativeBindingDir = join(projectRoot, 'native', 'codex-napi');
const indexNodePath = join(nativeBindingDir, 'index.node');

function updateNativeCargoTomlPaths() {
  try {
    // Determine codex-rs root from the located manifest
    const codexRoot = path.dirname(workspaceManifestPath);
    const corePath = join(codexRoot, 'core');
    const protocolPath = join(codexRoot, 'protocol');
    const cloudTasksClientPath = join(codexRoot, 'cloud-tasks-client');

    const cargoTomlPath = join(nativeBindingDir, 'Cargo.toml');
    let cargo = readFileSync(cargoTomlPath, 'utf8');

    const esc = (p) => p.replace(/\\/g, '\\\\');

    const before = cargo;
    cargo = cargo
      .replace(/codex-core\s*=\s*\{\s*path\s*=\s*"[^"]+"/g, `codex-core = { path = "${esc(corePath)}"`)
      .replace(/codex-protocol\s*=\s*\{\s*path\s*=\s*"[^"]+"/g, `codex-protocol = { path = "${esc(protocolPath)}"`)
      .replace(/codex-cloud-tasks-client\s*=\s*\{\s*path\s*=\s*"[^"]+"/g, `codex-cloud-tasks-client = { path = "${esc(cloudTasksClientPath)}"`);

    if (cargo !== before) {
      const { writeFileSync } = require('fs');
      writeFileSync(cargoTomlPath, cargo, 'utf8');
    }
  } catch (e) {
    console.warn('⚠️  Skipping Cargo.toml path rewrite:', e instanceof Error ? e.message : String(e));
  }
}

function ensureIndexNodeAlias(forceCopy = false) {
  let candidates;
  try {
    candidates = readdirSync(nativeBindingDir).filter(
      (file) => file !== 'index.node' && file.startsWith('index.') && file.endsWith('.node'),
    );
  } catch (error) {
    return existsSync(indexNodePath);
  }

  if (!candidates || candidates.length === 0) {
    return existsSync(indexNodePath);
  }

  const preferred =
    candidates.find(
      (file) => file.includes(process.platform) && file.includes(process.arch),
    ) ?? candidates[0];

  if (!forceCopy && existsSync(indexNodePath)) {
    return true;
  }

  try {
    rmSync(indexNodePath, { force: true, recursive: false });
  } catch {}

  try {
    copyFileSync(join(nativeBindingDir, preferred), indexNodePath);
    console.log(`   Copied ${preferred} -> index.node`);
    return true;
  } catch (copyError) {
    console.log(
      `   Failed to create index.node alias from ${preferred}: ${
        copyError instanceof Error ? copyError.message : String(copyError)
      }`,
    );
    return false;
  }
}

if (existsSync(indexNodePath)) {
  console.log(`ℹ️  Found existing index.node at: ${indexNodePath}`);
  console.log('   Rebuilding to ensure compatibility with your platform...');
}

try {
  // Ensure native/Cargo.toml uses your CODEX_RUST_ROOT dependency paths
  updateNativeCargoTomlPaths();
  const env = { ...process.env };
  if (isWindows) {
    env.CARGO_NET_GIT_FETCH_WITH_CLI = 'true';
  }
  if (workspaceVersion) {
    env.CODEX_RS_VERSION = workspaceVersion;
  }
  execSync('npm run build:native', { cwd: projectRoot, stdio: 'inherit', env });
  ensureIndexNodeAlias(true);
  console.log('✅ Native binding built');

  execSync('cargo build --release', { cwd: nativeBindingDir, stdio: 'inherit', env });
  console.log('✅ Native dylib refreshed\n');
} catch (error) {
  console.error('❌ Failed to build native binding');
  console.error('   Make sure you have Rust installed: https://www.rust-lang.org/tools/install');
  if (isWindows) {
    console.error('   Windows: Ensure you\'re using "Developer PowerShell for VS" or have VS Build Tools installed');
  }
  process.exit(1);
}

// Step 5: Verify setup
console.log('Step 5: Verifying setup...');
if (ensureIndexNodeAlias()) {
  console.log(`✅ Native binding found at: ${indexNodePath}`);
  logWorkspaceVersion();
  logCodexCliVersion();
} else {
  console.log('❌ Native binding not found after build');
  process.exit(1);
}

console.log('\n✨ Setup complete!\n');
console.log('ℹ️  Native binding available at:', defaultNativeModulePath);


function locateCodexManifest(root) {
  if (!root) {
    return undefined;
  }
  const candidates = [
    join(root, 'Cargo.toml'),
    join(root, 'codex-rs', 'Cargo.toml'),
  ];
  for (const manifest of candidates) {
    if (existsSync(manifest)) {
      return manifest;
    }
  }
  return undefined;
}

function extractWorkspaceVersion(manifestPath) {
  if (!manifestPath) {
    return undefined;
  }
  try {
    const contents = readFileSync(manifestPath, 'utf8');
    const workspaceMatch = contents.match(/\[workspace\.package\][^\[]*version\s*=\s*"([^"]+)"/);
    if (workspaceMatch?.[1]) {
      return workspaceMatch[1].trim();
    }
    const packageMatch = contents.match(/\[package\][^\[]*version\s*=\s*"([^"]+)"/);
    if (packageMatch?.[1]) {
      return packageMatch[1].trim();
    }
  } catch (error) {
    console.log(`⚠️  Unable to read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return undefined;
}

function logWorkspaceVersion() {
  if (workspaceVersion && workspaceManifestPath) {
    console.log(`ℹ️  Cargo workspace version (${workspaceManifestPath}): ${workspaceVersion}`);
    return;
  }
  if (workspaceManifestPath) {
    console.log(`⚠️  Unable to resolve version from ${workspaceManifestPath}`);
    return;
  }
  console.log('⚠️  Unable to locate Cargo workspace version');
}

function logCodexCliVersion() {
  try {
    const cliOutput = execFileSync('codex', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
    console.log(`ℹ️  codex --version: ${cliOutput}`);
  } catch {
    console.log('⚠️  Unable to execute codex CLI to determine version');
  }
}
