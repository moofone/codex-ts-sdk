#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Cloud Tasks: Best-of-N Workflow Example
 *
 * This example demonstrates using the best-of-N feature to generate multiple
 * solution attempts for a task, then reviewing and selecting from them.
 *
 * Usage:
 *   # With mock backend (no API key needed)
 *   node examples/cloud-tasks-best-of-n.cjs
 *
 *   # With live backend (requires API key)
 *   OPENAI_API_KEY=sk-... node examples/cloud-tasks-best-of-n.cjs
 */

const { CloudTasksClientBuilder } = require('../dist/cjs/src/cloud/index.js');

async function main() {
  // Use mock backend if no API key provided
  const useMock = !process.env.OPENAI_API_KEY;
  const baseUrl = process.env.CODEX_CLOUD_TASKS_BASE_URL || 'https://chatgpt.com/backend-api';

  console.log(useMock ? '🔧 Using mock backend (no API calls)\n' : '🌐 Using live backend\n');

  const client = new CloudTasksClientBuilder()
    .withBaseUrl(baseUrl)
    .withBearerToken(process.env.OPENAI_API_KEY || 'mock-token')
    .withUserAgent('cloud-example-best-of-n/0.1.0')
    .withMockBackend(useMock)
    .build();

  try {
    // Step 1: Create task with 3 attempts (best-of-N)
    console.log('📝 Creating task with 3 attempts (best-of-N)...');
    const task = await client.createTask({
      environmentId: 'prod',
      prompt: 'Refactor the authentication module to use async/await',
      gitRef: 'main',
      bestOfN: 3, // Generate 3 attempts
    });
    console.log(`✅ Task created: ${task.id}\n`);

    // Step 2: Poll until task is ready (mock completes instantly)
    console.log('⏳ Waiting for task to complete...');
    let taskInfo;
    let attempts = 0;
    const maxAttempts = useMock ? 1 : 30; // Mock completes instantly, live may take time

    do {
      const tasks = await client.listTasks({ limit: 10 });
      taskInfo = tasks.find(t => t.id === task.id);

      if (taskInfo?.status === 'ready') {
        break;
      }

      if (++attempts >= maxAttempts) {
        console.log('⚠️  Timeout waiting for task completion');
        return;
      }

      if (!useMock) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2s
        process.stdout.write('.');
      }
    } while (true);

    console.log('\n✅ Task completed!\n');

    // Step 3: Get task metadata
    console.log('📊 Task Summary:');
    console.log(`  Status: ${taskInfo.status}`);
    console.log(`  Files changed: ${taskInfo.summary.filesChanged}`);
    console.log(`  Lines added: +${taskInfo.summary.linesAdded}`);
    console.log(`  Lines removed: -${taskInfo.summary.linesRemoved}`);
    console.log(`  Total attempts: ${taskInfo.attemptTotal || 1}\n`);

    // Step 4: Get task text (includes turn ID for listing attempts)
    const text = await client.getTaskText(task.id);
    console.log('📝 Task Details:');
    console.log(`  Prompt: ${text.prompt}`);
    console.log(`  Selected attempt: ${(text.attemptPlacement ?? 0) + 1}/${taskInfo.attemptTotal}`);
    console.log(`  Status: ${text.attemptStatus}\n`);

    // Step 5: List all sibling attempts (if multiple attempts exist)
    if (text.turnId && taskInfo.attemptTotal && taskInfo.attemptTotal > 1) {
      console.log(`🔍 Reviewing all ${taskInfo.attemptTotal} attempts:\n`);

      const attempts = await client.listSiblingAttempts(task.id, text.turnId);
      console.log(`Found ${attempts.length} attempt(s):\n`);

      for (const attempt of attempts) {
        const attemptNum = (attempt.attemptPlacement ?? 0) + 1;
        const isSelected = attempt.attemptPlacement === text.attemptPlacement;
        const marker = isSelected ? '✨ [SELECTED]' : '';

        console.log(`  Attempt ${attemptNum}/${attempts.length} ${marker}`);
        console.log(`    Status: ${attempt.status}`);
        console.log(`    Created: ${attempt.createdAt?.toISOString() || 'N/A'}`);

        // Show diff preview
        if (attempt.diff) {
          const lines = attempt.diff.split('\n').slice(0, 8); // First 8 lines
          console.log(`    Diff preview:`);
          lines.forEach(line => console.log(`      ${line}`));
          if (attempt.diff.split('\n').length > 8) {
            console.log(`      ... (${attempt.diff.split('\n').length - 8} more lines)`);
          }
        }

        // Show messages
        if (attempt.messages && attempt.messages.length > 0) {
          console.log(`    Messages:`);
          attempt.messages.forEach(msg => {
            const preview = msg.length > 60 ? msg.slice(0, 60) + '...' : msg;
            console.log(`      - ${preview}`);
          });
        }

        console.log('');
      }

      // Step 6: Compare attempts
      console.log('💡 Comparison Tips:');
      console.log('  - Review the diff and messages for each attempt');
      console.log('  - Use diffOverride option to apply a different attempt:');
      console.log(`    await client.applyTask('${task.id}', { diffOverride: attempt.diff });`);
      console.log('');

      // Step 7: Apply alternate attempt example
      const alternateAttempt = attempts.find(a => a.attemptPlacement !== text.attemptPlacement);
      if (alternateAttempt && alternateAttempt.diff) {
        console.log('🔄 Example: Applying alternate attempt...');
        const preflightResult = await client.applyTaskPreflight(task.id, {
          diffOverride: alternateAttempt.diff,
        });
        console.log(`  Preflight status: ${preflightResult.status}`);
        console.log(`  Message: ${preflightResult.message}`);

        if (preflightResult.conflictPaths.length > 0) {
          console.log(`  ⚠️  Conflicts: ${preflightResult.conflictPaths.join(', ')}`);
        }
        if (preflightResult.skippedPaths.length > 0) {
          console.log(`  ℹ️  Skipped: ${preflightResult.skippedPaths.join(', ')}`);
        }
        console.log('');
      }
    } else {
      console.log('ℹ️  Only one attempt was generated (bestOfN=1 or single attempt task)\n');
    }

    console.log('✅ Best-of-N workflow complete!');
    console.log('\n💡 Next steps:');
    console.log('  1. Review all attempts and their diffs');
    console.log('  2. Select the best one (default is automatically selected)');
    console.log('  3. Apply using: node examples/cloud-tasks-apply.cjs');
  } catch (error) {
    console.error('❌ Error:', error.message || error);
    if (error.code === 'UNIMPLEMENTED') {
      console.error('\n💡 Hint: Cloud tasks require codex-rs v0.45.0+');
      console.error('   Run: npm run setup with CODEX_RUST_ROOT=/path/to/codex-rs-v0.45.0');
    }
    process.exit(1);
  } finally {
    client.close();
  }
}

main().catch(console.error);
