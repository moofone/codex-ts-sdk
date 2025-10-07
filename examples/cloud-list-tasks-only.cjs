#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * List all tasks in specified environment
 *
 * Run with: ENV_LABEL=owner/repo node examples/cloud-list-tasks-only.cjs
 */

const { CloudTasksClientBuilder } = require('../dist/cjs/src/cloud/index.js');

async function main() {
  const envLabel = process.env.ENV_LABEL || process.env.ENV_ID;

  if (!envLabel) {
    console.error('❌ Error: ENV_LABEL or ENV_ID environment variable is required');
    console.error('   Example: ENV_LABEL=owner/repo node examples/cloud-list-tasks-only.cjs');
    process.exit(1);
  }

  console.log(`📋 Listing tasks for environment: ${envLabel}\n`);

  const client = new CloudTasksClientBuilder()
    .withUserAgent('codex-sdk-test/1.0.0')
    .build();

  try {
    const tasks = await client.listTasks({
      environmentId: envLabel,
    });

    console.log(`Found ${tasks.length} task(s):\n`);
    console.log('═'.repeat(80));

    tasks.forEach((task, i) => {
      const statusEmoji = {
        ready: '✅',
        pending: '⏳',
        applied: '✔️',
        error: '❌'
      }[task.status] || '❓';

      console.log(`\n${i + 1}. ${statusEmoji} ${task.status.toUpperCase()}`);
      console.log(`   ID: ${task.id}`);
      console.log(`   Title: ${task.title}`);
      console.log(`   Updated: ${task.updatedAt}`);
      console.log(`   Environment ID: ${task.environmentId || '(not set)'}`);
      console.log(`   Environment Label: ${task.environmentLabel || '(not set)'}`);

      if (task.summary) {
        console.log(`   Files Changed: ${task.summary.filesChanged || 0}`);
        console.log(`   Lines Added: ${task.summary.linesAdded || 0}`);
        console.log(`   Lines Removed: ${task.summary.linesRemoved || 0}`);
      }

      console.log(`   Is Review: ${task.isReview || false}`);
      console.log(`   Attempt Total: ${task.attemptTotal || 'N/A'}`);
    });

    console.log('\n' + '═'.repeat(80));
    console.log(`\nTotal: ${tasks.length} tasks\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main().catch(console.error);
