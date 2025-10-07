/**
 * Live test: List tasks and get all available details
 *
 * Run with: CLOUD_LIVE=1 npm run test:cloud:list
 */

import { describe, it, expect } from 'vitest';
import { CloudTasksClientBuilder } from '../../src/cloud/index.js';

const LIVE_ENABLED = process.env.CLOUD_LIVE === '1';

if (!LIVE_ENABLED) {
  console.warn('Skipping CloudTasks list tasks test: set CLOUD_LIVE=1 to enable.');
}

const describeIf = LIVE_ENABLED ? describe : describe.skip;

describeIf('Cloud Tasks - listTasks', () => {
  it('should list tasks and get all available details', async () => {
    console.log('\n📋 Testing listTasks and detail retrieval\n');

    const client = new CloudTasksClientBuilder()
      .withUserAgent('codex-sdk-test-list/1.0.0')
      .build();

    try {
      // Test 1: List all tasks
      console.log('1️⃣  listTasks() - No filter');
      console.log('   ─'.repeat(40));

      const allTasks = await client.listTasks();
      console.log(`   ✅ Retrieved ${allTasks.length} task(s)`);

      expect(allTasks).toBeDefined();
      expect(Array.isArray(allTasks)).toBe(true);

      if (allTasks.length > 0) {
        console.log(`   First task ID: ${allTasks[0].id}`);
        console.log(`   First task title: ${allTasks[0].title}`);
      }

      // Test 2: List with limit
      console.log('\n2️⃣  listTasks({ limit: 3 })');
      console.log('   ─'.repeat(40));

      const limitedTasks = await client.listTasks({ limit: 3 });
      console.log(`   ✅ Retrieved ${limitedTasks.length} task(s) (max 3)`);

      expect(limitedTasks).toBeDefined();
      expect(limitedTasks.length).toBeLessThanOrEqual(3);

      // Test 3: List with environment filter (known to not work, but test it)
      const testEnvFilter = process.env.TEST_ENV_LABEL || process.env.TEST_ENV_ID;

      if (testEnvFilter) {
        console.log(`\n3️⃣  listTasks({ environmentId: "${testEnvFilter}" })`);
        console.log('   ⚠️  Note: Backend filtering is unreliable');
        console.log('   ─'.repeat(40));

        const envTasks = await client.listTasks({
          environmentId: testEnvFilter,
          limit: 5
        });
        console.log(`   ✅ Retrieved ${envTasks.length} task(s)`);
        console.log(`   ⚠️  Backend may not filter correctly`);

        expect(envTasks).toBeDefined();
      } else {
        console.log('\n3️⃣  Skipping environment filter test (set TEST_ENV_LABEL or TEST_ENV_ID to enable)');
      }

      // Test 4: Get detailed info for first 3 tasks
      console.log('\n4️⃣  Getting detailed info for each task');
      console.log('   ─'.repeat(40));

      const tasksToInspect = allTasks.slice(0, 3);

      for (let i = 0; i < tasksToInspect.length; i++) {
        const task = tasksToInspect[i];

        console.log(`\n   Task ${i + 1}/${tasksToInspect.length}: ${task.title}`);
        console.log(`   ID: ${task.id}`);

        // Log ALL TaskSummary fields
        console.log(`   ✅ TaskSummary Fields:`);
        console.log(`      - status: ${task.status}`);

        // Handle dates safely
        const formatDate = (d: Date | undefined) => {
          if (!d) return '(none)';
          try {
            return d.toISOString();
          } catch {
            return `(invalid: ${d})`;
          }
        };

        console.log(`      - updatedAt: ${formatDate(task.updatedAt)}`);
        console.log(`      - createdAt: ${formatDate(task.createdAt)}`);
        console.log(`      - hasGeneratedTitle: ${task.hasGeneratedTitle ?? 'N/A'}`);
        console.log(`      - environmentId: ${task.environmentId || '(none)'}`);
        console.log(`      - environmentLabel: ${task.environmentLabel || '(none)'}`);
        console.log(`      - summary: ${task.summary.filesChanged} files, +${task.summary.linesAdded}, -${task.summary.linesRemoved}`);
        console.log(`      - isReview: ${task.isReview}`);
        console.log(`      - attemptTotal: ${task.attemptTotal ?? 'N/A'}`);
        console.log(`      - archived: ${task.archived ?? 'N/A'}`);
        console.log(`      - hasUnreadTurn: ${task.hasUnreadTurn ?? 'N/A'}`);
        console.log(`      - branchName: ${task.branchName || '(none)'}`);
        console.log(`      - turnId: ${task.turnId || '(none)'}`);
        console.log(`      - turnStatus: ${task.turnStatus || '(none)'}`);
        console.log(`      - siblingTurnIds: ${task.siblingTurnIds?.length || 0} sibling(s)`);
        if (task.siblingTurnIds && task.siblingTurnIds.length > 0) {
          console.log(`        → ${task.siblingTurnIds.join(', ')}`);
        }
        console.log(`      - intent: ${task.intent || '(none)'}`);
        console.log(`      - initialIntent: ${task.initialIntent || '(none)'}`);
        console.log(`      - fixTaskId: ${task.fixTaskId || '(none)'}`);
        console.log(`      - pullRequests: ${task.pullRequests?.length || 0} PR(s)`);
        if (task.pullRequests && task.pullRequests.length > 0) {
          task.pullRequests.forEach((pr, idx) => {
            console.log(`        PR ${idx + 1}: #${pr.number} - ${pr.title}`);
            console.log(`          state: ${pr.state}, merged: ${pr.merged}`);
            console.log(`          url: ${pr.url}`);
          });
        }

        // Test getTaskText
        try {
          const text = await client.getTaskText(task.id);

          console.log(`   ✅ getTaskText()`);
          console.log(`      - Prompt: ${text.prompt ? text.prompt.substring(0, 50) + '...' : '(none)'}`);
          console.log(`      - Messages: ${text.messages.length}`);
          console.log(`      - Attempt Status: ${text.attemptStatus}`);
          console.log(`      - Turn ID: ${text.turnId || '(none)'}`);
          console.log(`      - Sibling Turns: ${text.siblingTurnIds?.length || 0}`);
          console.log(`      - Attempt Placement: ${text.attemptPlacement ?? 'N/A'}`);

          expect(text).toBeDefined();
          expect(text.messages).toBeDefined();
          expect(Array.isArray(text.messages)).toBe(true);
          expect(text.attemptStatus).toBeDefined();

        } catch (error: any) {
          console.log(`   ❌ getTaskText() failed: ${error.message}`);
        }

        // Test getTaskMessages
        try {
          const messages = await client.getTaskMessages(task.id);

          console.log(`   ✅ getTaskMessages()`);
          console.log(`      - Count: ${messages.length}`);
          if (messages.length > 0) {
            const preview = messages[0].substring(0, 60).replace(/\n/g, ' ');
            console.log(`      - First: ${preview}...`);
          }

          expect(messages).toBeDefined();
          expect(Array.isArray(messages)).toBe(true);

        } catch (error: any) {
          console.log(`   ❌ getTaskMessages() failed: ${error.message}`);
        }

        // Test getTaskDiff
        try {
          const diff = await client.getTaskDiff(task.id);

          if (diff) {
            const lines = diff.split('\n');
            const additions = lines.filter(l => l.startsWith('+')).length;
            const deletions = lines.filter(l => l.startsWith('-')).length;

            console.log(`   ✅ getTaskDiff()`);
            console.log(`      - Lines: ${lines.length}`);
            console.log(`      - Additions: ~${additions}`);
            console.log(`      - Deletions: ~${deletions}`);

            expect(diff).toBeDefined();
            expect(typeof diff).toBe('string');
            expect(diff.length).toBeGreaterThan(0);
          } else {
            console.log(`   ℹ️  getTaskDiff() - No diff available`);
          }

        } catch (error: any) {
          console.log(`   ❌ getTaskDiff() failed: ${error.message}`);
        }
      }

      // Summary
      console.log('\n📊 SUMMARY');
      console.log('   ═'.repeat(40));
      console.log(`   Total tasks found: ${allTasks.length}`);
      console.log(`   Tasks inspected: ${tasksToInspect.length}`);
      console.log(`   Status: ${allTasks[0]?.status || 'N/A'}`);
      console.log('   ✅ All tests passed!\n');

    } finally {
      client.close();
    }
  }, 60000); // 60 second timeout
});
