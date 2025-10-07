/**
 * Simple workflow example: Create task and wait for completion
 *
 * This is a minimal example showing the essential workflow.
 *
 * Run with:
 *   CODEX_INTERNAL_ORIGINATOR_OVERRIDE=codex_cli_rs node examples/cloud-tasks-simple-workflow.cjs
 */

const { CloudTasksClientBuilder } = require('../dist/cjs/src/cloud/index.js');

async function main() {
  const client = new CloudTasksClientBuilder()
    .withUserAgent('codex-sdk-simple-example/1.0.0')
    .build();

  try {
    // 1. Resolve environment label → ID
    console.log('🔍 Resolving environment "owner/repo"...');
    const envId = await client.resolveEnvironmentId('owner/repo');
    console.log(`✅ Environment ID: ${envId}\n`);

    // 2. Create task
    console.log('📝 Creating task...');
    const task = await client.createTask({
      environmentId: envId,
      prompt: 'What is 2+2?',
      gitRef: 'main',
    });
    console.log(`✅ Task created: ${task.id}\n`);

    // 3. Poll for completion (simple version)
    console.log('⏳ Waiting for completion...');
    const completed = await waitForCompletion(client, task.id);
    console.log(`✅ Task completed: ${completed.status}\n`);

    // 4. Get results
    console.log('📄 Retrieving results...');
    const messages = await client.getTaskMessages(task.id);
    const diff = await client.getTaskDiff(task.id);

    console.log(`\n💬 Messages: ${messages.length}`);
    if (messages.length > 0) {
      console.log(`   First: ${messages[0].substring(0, 200)}...`);
    }

    console.log(`\n📊 Diff: ${diff ? diff.split('\n').length + ' lines' : 'none'}`);

    console.log('\n✨ Done!');

  } finally {
    client.close();
  }
}

async function waitForCompletion(client, taskId, maxWait = 120) {
  const start = Date.now();

  while (true) {
    // Find our task in the list
    const tasks = await client.listTasks({ limit: 100 });
    const task = tasks.find(t => t.id === taskId);

    if (!task) {
      throw new Error('Task not found');
    }

    // Check if done
    if ((task.status === 'ready' || task.status === 'error') &&
        (task.turnStatus === 'completed' || task.turnStatus === 'failed')) {
      return task;
    }

    // Timeout check
    if (Date.now() - start > maxWait * 1000) {
      throw new Error('Timeout waiting for task');
    }

    // Wait 2 seconds before next check
    process.stdout.write(`   Status: ${task.status}/${task.turnStatus || 'pending'}...\r`);
    await new Promise(r => setTimeout(r, 2000));
  }
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
