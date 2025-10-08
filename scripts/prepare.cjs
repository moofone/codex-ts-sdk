#!/usr/bin/env node

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const tmpCodexDir = path.join(projectRoot, 'tmp', 'codex');

console.log('🚀 Preparing codex-ts-sdk from git...\n');

// Clone codex-rs if not already present
if (!existsSync(tmpCodexDir)) {
  console.log('📦 Cloning codex-rs repository...');
  try {
    execSync('mkdir -p tmp', { cwd: projectRoot, stdio: 'inherit' });
    execSync(
      'git clone --depth 1 https://github.com/openai/codex.git tmp/codex',
      { cwd: projectRoot, stdio: 'inherit' }
    );
    console.log('✅ codex-rs cloned\n');
  } catch (error) {
    console.error('❌ Failed to clone codex-rs repository');
    console.error('   You may need to clone it manually and set CODEX_RUST_ROOT');
    process.exit(1);
  }
} else {
  console.log('✅ codex-rs already exists at tmp/codex\n');
}

// Set CODEX_RUST_ROOT and run setup
console.log('🔧 Running setup...');
try {
  const env = { ...process.env, CODEX_RUST_ROOT: tmpCodexDir };
  execSync('node scripts/setup.cjs', { cwd: projectRoot, stdio: 'inherit', env });
  console.log('\n✅ Prepare complete!');
} catch (error) {
  console.error('❌ Setup failed');
  process.exit(1);
}
