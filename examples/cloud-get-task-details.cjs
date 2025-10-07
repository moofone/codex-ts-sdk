#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Get detailed information for each task
 *
 * Demonstrates the workaround for environment filtering limitation:
 * List all tasks, then get detailed info for each using getTaskText()
 */

const { CloudTasksClientBuilder } = require('../dist/cjs/src/cloud/index.js');

async function main() {
  console.log('📋 Getting detailed task information\n');

  const client = new CloudTasksClientBuilder()
    .withUserAgent('codex-sdk-detail-demo/1.0.0')
    .build();

  try {
    // List all tasks (environment filter may not work on backend)
    console.log('1️⃣  Listing all tasks...\n');
    const tasks = await client.listTasks({ limit: 5 });

    console.log(`Found ${tasks.length} task(s)\n`);
    console.log('═'.repeat(80));

    // Get detailed information for each task
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      console.log(`\n${i + 1}. ${task.title}`);
      console.log(`   ID: ${task.id}`);
      console.log(`   Status: ${task.status}`);
      console.log('   ─'.repeat(40));

      try {
        // Get full task details
        const text = await client.getTaskText(task.id);

        console.log(`   📝 Prompt: ${(text.prompt || '(none)').substring(0, 60)}...`);
        console.log(`   💬 Messages: ${text.messages.length}`);
        console.log(`   🔄 Attempt Status: ${text.attemptStatus}`);
        console.log(`   📍 Attempt Placement: ${text.attemptPlacement ?? 'N/A'}`);
        console.log(`   🔗 Turn ID: ${text.turnId || '(none)'}`);
        console.log(`   👥 Sibling Turns: ${text.siblingTurnIds?.length || 0}`);

        // Get messages
        const messages = await client.getTaskMessages(task.id);
        if (messages.length > 0) {
          const preview = messages[0].substring(0, 80).replace(/\n/g, ' ');
          console.log(`   💭 First message: ${preview}...`);
        }

        // Check if diff is available
        const diff = await client.getTaskDiff(task.id);
        if (diff) {
          const lines = diff.split('\n');
          console.log(`   📄 Diff: ${lines.length} lines`);

          // Count changes
          const additions = lines.filter(l => l.startsWith('+')).length;
          const deletions = lines.filter(l => l.startsWith('-')).length;
          console.log(`   ➕ Additions: ~${additions} lines`);
          console.log(`   ➖ Deletions: ~${deletions} lines`);
        } else {
          console.log(`   📄 Diff: (not available)`);
        }

      } catch (error) {
        console.log(`   ⚠️  Could not get details: ${error.message}`);
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ Successfully retrieved detailed information for all tasks\n');

    console.log('💡 This approach works regardless of environment filtering issues!');
    console.log('   Use task.id to get full details via:');
    console.log('   - getTaskText(id)     - Full task metadata');
    console.log('   - getTaskMessages(id) - Assistant messages');
    console.log('   - getTaskDiff(id)     - Generated diff/patch\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main().catch(console.error);
