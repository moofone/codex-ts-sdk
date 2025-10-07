/**
 * Complete workflow example: Resolve environment, create task, wait for completion
 *
 * This example demonstrates:
 * 1. Resolving environment label → ID
 * 2. Creating a task
 * 3. Polling until the task completes
 * 4. Retrieving and displaying results
 *
 * Run with:
 *   CODEX_INTERNAL_ORIGINATOR_OVERRIDE=codex_cli_rs node examples/cloud-tasks-complete-workflow.cjs
 *
 * Environment variables:
 *   - ENV_LABEL: Environment label (required - e.g., 'owner/repo')
 *   - TASK_PROMPT: Task prompt (default: 'Create a hello world function in hello.js')
 *   - GIT_REF: Git reference (default: 'main')
 *   - POLL_INTERVAL: Polling interval in ms (default: 2000)
 *   - MAX_WAIT: Maximum wait time in seconds (default: 300)
 */

const { CloudTasksClientBuilder } = require('../dist/cjs/src/cloud/index.js');

async function main() {
  const envLabel = process.env.ENV_LABEL;
  const prompt = process.env.TASK_PROMPT || 'Create a hello world function in hello.js';
  const gitRef = process.env.GIT_REF || 'main';
  const pollInterval = parseInt(process.env.POLL_INTERVAL || '2000', 10);
  const maxWaitSeconds = parseInt(process.env.MAX_WAIT || '300', 10);

  if (!envLabel) {
    console.error('❌ Error: ENV_LABEL environment variable is required');
    console.error('   Example: ENV_LABEL=owner/repo node examples/cloud-tasks-complete-workflow.cjs');
    process.exit(1);
  }

  console.log('🚀 Cloud Tasks Complete Workflow Example\n');
  console.log('Configuration:');
  console.log(`  - Environment: ${envLabel}`);
  console.log(`  - Prompt: ${prompt}`);
  console.log(`  - Git ref: ${gitRef}`);
  console.log(`  - Poll interval: ${pollInterval}ms`);
  console.log(`  - Max wait: ${maxWaitSeconds}s\n`);

  const client = new CloudTasksClientBuilder()
    .withUserAgent('codex-sdk-example/1.0.0')
    .build();

  try {
    // Step 1: Resolve environment label to ID
    console.log(`🔍 Step 1: Resolving environment '${envLabel}'...`);
    const environmentId = await client.resolveEnvironmentId(envLabel);
    console.log(`✅ Resolved to: ${environmentId}\n`);

    // Step 2: Create the task
    console.log(`📝 Step 2: Creating task...`);
    const created = await client.createTask({
      environmentId,
      prompt,
      gitRef,
      qaMode: false,
      bestOfN: 1,
    });
    console.log(`✅ Task created: ${created.id}`);
    console.log(`   UI: https://chatgpt.com/codex/tasks/${created.id}\n`);

    // Step 3: Poll for completion
    console.log(`⏳ Step 3: Waiting for task to complete...`);
    const task = await pollUntilComplete(client, created.id, pollInterval, maxWaitSeconds);

    console.log(`\n✅ Task completed with status: ${task.status}`);
    console.log(`   Turn status: ${task.turnStatus || 'N/A'}`);
    console.log(`   Updated at: ${task.updatedAt.toISOString()}`);
    console.log(`   Files changed: ${task.summary.filesChanged}`);
    console.log(`   Lines added: ${task.summary.linesAdded}`);
    console.log(`   Lines removed: ${task.summary.linesRemoved}\n`);

    // Step 4: Get task details
    console.log(`📄 Step 4: Retrieving task results...\n`);

    // Get messages
    const messages = await client.getTaskMessages(task.id);
    console.log(`💬 Messages (${messages.length} total):`);
    messages.forEach((msg, idx) => {
      const preview = msg.substring(0, 100).replace(/\n/g, ' ');
      console.log(`   ${idx + 1}. ${preview}${msg.length > 100 ? '...' : ''}`);
    });

    // Get diff
    const diff = await client.getTaskDiff(task.id);
    if (diff) {
      console.log(`\n📊 Diff (${diff.split('\n').length} lines):`);
      const diffPreview = diff.split('\n').slice(0, 20).join('\n');
      console.log(diffPreview);
      if (diff.split('\n').length > 20) {
        console.log('   ... (truncated)');
      }
    } else {
      console.log('\nℹ️  No diff available');
    }

    // Get full task text
    const taskText = await client.getTaskText(task.id);
    console.log(`\n📋 Task Text:`);
    console.log(`   Prompt: ${taskText.prompt?.substring(0, 100) || '(none)'}${taskText.prompt && taskText.prompt.length > 100 ? '...' : ''}`);
    console.log(`   Turn ID: ${taskText.turnId || 'N/A'}`);
    console.log(`   Attempt status: ${taskText.attemptStatus}`);
    console.log(`   Attempt placement: ${taskText.attemptPlacement ?? 'N/A'}`);
    console.log(`   Sibling turns: ${taskText.siblingTurnIds.length}`);

    console.log('\n✨ Workflow completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    client.close();
  }
}

/**
 * Poll until the task reaches a terminal state
 *
 * @param {import('../dist/cjs/src/cloud/index.js').CloudTasksClient} client
 * @param {string} taskId
 * @param {number} intervalMs
 * @param {number} maxWaitSeconds
 * @returns {Promise<import('../dist/cjs/src/types/cloud-tasks.js').TaskSummary>}
 */
async function pollUntilComplete(client, taskId, intervalMs, maxWaitSeconds) {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;
  let pollCount = 0;

  while (true) {
    pollCount++;
    const elapsed = Date.now() - startTime;

    if (elapsed > maxWaitMs) {
      throw new Error(`Task did not complete within ${maxWaitSeconds} seconds`);
    }

    // Get all tasks and find ours
    // Note: There's no single-task API, so we list all tasks
    const tasks = await client.listTasks({ limit: 100 });
    const task = tasks.find(t => t.id === taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found in list`);
    }

    // Check if task is in a terminal state
    // Status: 'pending' | 'ready' | 'applied' | 'error'
    // turnStatus: 'completed', 'failed', etc.
    const isTerminal = task.status === 'ready' || task.status === 'applied' || task.status === 'error';
    const turnCompleted = task.turnStatus === 'completed' || task.turnStatus === 'failed';

    if (isTerminal && turnCompleted) {
      console.log(`   ✅ Poll #${pollCount}: Task complete (${task.status}/${task.turnStatus})`);
      return task;
    }

    // Still pending
    const remainingSeconds = Math.round((maxWaitMs - elapsed) / 1000);
    process.stdout.write(`   ⏳ Poll #${pollCount}: ${task.status}/${task.turnStatus || 'pending'} (${remainingSeconds}s remaining)...\r`);

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

// Run the example
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
