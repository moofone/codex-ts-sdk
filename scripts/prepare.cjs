#!/usr/bin/env node

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const tmpCodexDir = path.join(projectRoot, 'tmp', 'codex');

console.log('🚀 Preparing codex-ts-sdk from git...\n');

// Use existing CODEX_RUST_ROOT if set, otherwise clone
let codexRustRoot;
if (process.env.CODEX_RUST_ROOT) {
  console.log(`✅ Using existing CODEX_RUST_ROOT: ${process.env.CODEX_RUST_ROOT}\n`);
  codexRustRoot = process.env.CODEX_RUST_ROOT;
} else if (!existsSync(tmpCodexDir)) {
  console.log('📦 Fetching latest codex-rs tag...');
  let latestTag;
  try {
    latestTag = execSync(
      'git ls-remote --tags --sort=-v:refname https://github.com/openai/codex.git | grep "rust-v" | head -n1 | sed "s/.*refs\\/tags\\///"',
      { encoding: 'utf8' }
    ).trim();

    if (!latestTag) {
      throw new Error('No rust-v tags found');
    }

    console.log(`✅ Latest tag: ${latestTag}`);
    console.log(`📦 Cloning codex-rs repository...`);

    execSync('mkdir -p tmp', { cwd: projectRoot, stdio: 'inherit' });
    execSync(
      `git clone --depth 1 --branch ${latestTag} https://github.com/openai/codex.git tmp/codex`,
      { cwd: projectRoot, stdio: 'inherit' }
    );
    console.log('✅ codex-rs cloned\n');
    codexRustRoot = tmpCodexDir;
  } catch (error) {
    console.error('❌ Failed to clone codex-rs repository');
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('   You may need to clone it manually and set CODEX_RUST_ROOT');
    process.exit(1);
  }
} else {
  console.log('✅ codex-rs already exists at tmp/codex\n');
  codexRustRoot = tmpCodexDir;
}

// Set CODEX_RUST_ROOT and run setup
console.log('🔧 Running setup...');
try {
  const env = { ...process.env, CODEX_RUST_ROOT: codexRustRoot };
  execSync('node scripts/setup.cjs', { cwd: projectRoot, stdio: 'inherit', env });
  console.log('\n✅ Prepare complete!');
} catch (error) {
  console.error('❌ Setup failed');
  process.exit(1);
}
