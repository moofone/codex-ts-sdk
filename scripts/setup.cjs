#!/usr/bin/env node

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');
const os = require('os');

const projectRoot = join(__dirname, '..');
const isWindows = os.platform() === 'win32';

console.log('🚀 Codex TypeScript SDK Setup\n');

// Check environment variables
const codexTsSdkRoot = process.env.CODEX_TS_SDK_ROOT || projectRoot;
const codexRustRoot = process.env.CODEX_RUST_ROOT;
const codexHome = process.env.CODEX_HOME ||
  (codexRustRoot ? join(codexRustRoot, 'codex-rs', 'target', 'release') :
   join(process.env.HOME || process.env.USERPROFILE, '.codex'));

console.log('Environment:');
console.log(`  CODEX_TS_SDK_ROOT: ${codexTsSdkRoot}`);
console.log(`  CODEX_RUST_ROOT: ${codexRustRoot || '(not set)'}`);
console.log(`  CODEX_HOME: ${codexHome}\n`);

// Step 1: Check for Codex runtime assets
console.log('Step 1: Checking for Codex runtime assets...');
if (existsSync(codexHome)) {
  console.log(`✅ Found Codex runtime assets at: ${codexHome}`);
} else {
  console.log(`⚠️  Codex runtime assets not found at: ${codexHome}`);
  console.log('\nTo build Codex runtime assets:');
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
  console.log('   If you use codex-cli, it manages runtime assets under ~/.codex automatically.\n');
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
const indexNodePath = join(projectRoot, 'native', 'codex-napi', 'index.node');

if (existsSync(indexNodePath)) {
  console.log(`ℹ️  Found existing index.node at: ${indexNodePath}`);
  console.log('   Rebuilding to ensure compatibility with your platform...');
}

try {
  // Set environment variable for Windows to fix Git SSH issues
  const env = { ...process.env };
  if (isWindows) {
    env.CARGO_NET_GIT_FETCH_WITH_CLI = 'true';
  }
  execSync('npm run build:native', { cwd: projectRoot, stdio: 'inherit', env });
  console.log('✅ Native binding built\n');
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
if (existsSync(indexNodePath)) {
  console.log(`✅ Native binding found at: ${indexNodePath}`);
} else {
  console.log('❌ Native binding not found after build');
  process.exit(1);
}

console.log('\n✨ Setup complete!\n');
console.log('Next steps:');
if (!existsSync(codexHome)) {
  console.log('1. Build Codex runtime assets (see instructions above)');
}
const nextNum = existsSync(codexHome) ? 1 : 2;
console.log(`${nextNum}. Set environment variables:`);

if (isWindows) {
  if (!process.env.CODEX_TS_SDK_ROOT) {
    console.log(`   $env:CODEX_TS_SDK_ROOT = "${projectRoot}"`);
  }
  if (!process.env.CODEX_RUST_ROOT && codexRustRoot) {
    console.log(`   $env:CODEX_RUST_ROOT = "${codexRustRoot}"`);
  }
  console.log(`   $env:CODEX_HOME = "${codexHome}"`);
  console.log(`${nextNum + 1}. Try the examples:`);
  console.log(`   cd $env:CODEX_TS_SDK_ROOT`);
} else {
  if (!process.env.CODEX_TS_SDK_ROOT) {
    console.log(`   export CODEX_TS_SDK_ROOT="${projectRoot}"`);
  }
  if (!process.env.CODEX_RUST_ROOT && codexRustRoot) {
    console.log(`   export CODEX_RUST_ROOT="${codexRustRoot}"`);
  }
  console.log(`   export CODEX_HOME="${codexHome}"`);
  console.log(`${nextNum + 1}. Try the examples:`);
  console.log(`   cd $CODEX_TS_SDK_ROOT`);
}
console.log('   node examples/basic-chat.js');
