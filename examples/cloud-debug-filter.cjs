#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Debug: Check if environment filtering is working
 */

const { CloudTasksClientBuilder } = require('../dist/cjs/src/cloud/index.js');

async function main() {
  const testEnv = process.env.TEST_ENV_LABEL || process.env.TEST_ENV_ID;

  if (!testEnv) {
    console.error('❌ Error: TEST_ENV_LABEL or TEST_ENV_ID environment variable is required');
    console.error('   Example: TEST_ENV_LABEL=owner/repo node examples/cloud-debug-filter.cjs');
    process.exit(1);
  }

  console.log('🔍 Debug: Environment Filtering\n');
  console.log(`   Test environment: ${testEnv}\n`);

  const client = new CloudTasksClientBuilder()
    .withUserAgent('codex-sdk-test/1.0.0')
    .build();

  try {
    // Test 1: List ALL tasks (no filter)
    console.log('1️⃣  Listing ALL tasks (no filter)...\n');
    const allTasks = await client.listTasks();

    console.log(`   Found ${allTasks.length} total tasks\n`);

    // Group by environment ID
    const envGroups = {};
    allTasks.forEach(task => {
      const envId = task.environmentId || '(no environment)';
      if (!envGroups[envId]) {
        envGroups[envId] = [];
      }
      envGroups[envId].push(task);
    });

    console.log('   Tasks grouped by environment:\n');
    Object.keys(envGroups).forEach(envId => {
      console.log(`   ${envId}: ${envGroups[envId].length} task(s)`);
      if (envGroups[envId].length > 0 && envGroups[envId][0].environmentLabel) {
        console.log(`      Label: ${envGroups[envId][0].environmentLabel}`);
      }
    });

    // Test 2: List with environment filter
    console.log(`\n\n2️⃣  Listing with filter: environmentId="${testEnv}"...\n`);
    const filteredTasks = await client.listTasks({
      environmentId: testEnv
    });

    console.log(`   Found ${filteredTasks.length} filtered tasks\n`);

    if (filteredTasks.length > 0) {
      console.log('   First 3 filtered tasks:');
      filteredTasks.slice(0, 3).forEach((task, i) => {
        console.log(`\n   ${i + 1}. ${task.title}`);
        console.log(`      ID: ${task.id}`);
        console.log(`      Environment ID: ${task.environmentId || '(NOT SET!)'}`);
        console.log(`      Environment Label: ${task.environmentLabel || '(NOT SET!)'}`);
      });
    }

    // Analysis
    console.log('\n\n📊 ANALYSIS:\n');

    const allHaveNoEnv = filteredTasks.every(t => !t.environmentId);
    if (allHaveNoEnv) {
      console.log('   ❌ PROBLEM: All filtered tasks have no environmentId set!');
      console.log('   ❌ The filter parameter is being ignored by the backend.');
      console.log('');
      console.log('   This means either:');
      console.log('   1. The backend is not filtering correctly');
      console.log(`   2. The environment "${testEnv}" doesn't exist`);
      console.log('   3. Tasks in that environment have NULL environmentId');
      console.log('   4. The SDK is not sending the filter correctly');
    } else {
      console.log('   ✅ Some tasks have environmentId set correctly');
    }

    // Test 3: Try a different environment ID
    console.log('\n\n3️⃣  Testing with different environmentId="test"...\n');
    const testTasks = await client.listTasks({
      environmentId: 'test'
    });
    console.log(`   Found ${testTasks.length} tasks with environmentId="test"`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main().catch(console.error);
