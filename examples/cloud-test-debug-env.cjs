#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Test with CODEX_DEBUG=1 to see backend calls
 */

const { CloudTasksClientBuilder } = require('../dist/cjs/src/cloud/index.js');

async function main() {
  const testEnv = process.env.TEST_ENV_LABEL || process.env.TEST_ENV_ID;

  if (!testEnv) {
    console.error('❌ Error: TEST_ENV_LABEL or TEST_ENV_ID environment variable is required');
    console.error('   Example: TEST_ENV_LABEL=owner/repo node examples/cloud-test-debug-env.cjs');
    process.exit(1);
  }

  console.log('🔍 Testing with debug enabled\n');

  // Enable debug mode
  process.env.CODEX_DEBUG = '1';

  const client = new CloudTasksClientBuilder()
    .withUserAgent('codex-sdk-test/1.0.0')
    .build();

  try {
    console.log(`Calling listTasks with environmentId="${testEnv}"...\n`);

    const tasks = await client.listTasks({
      environmentId: testEnv,
      limit: 3
    });

    console.log(`\nGot ${tasks.length} tasks`);

    if (tasks.length > 0) {
      console.log('\nFirst task:');
      console.log(`  ID: ${tasks[0].id}`);
      console.log(`  Title: ${tasks[0].title}`);
      console.log(`  Environment ID: ${tasks[0].environmentId || '(NOT SET)'}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.close();
  }
}

main().catch(console.error);
