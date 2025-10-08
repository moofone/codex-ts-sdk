/**
 * Live test: Create task with environment label → id resolution
 *
 * Mirrors codex-rs/cloud-tasks-client/tests/live_create_minimal.rs
 *
 * Run with: CLOUD_LIVE=1 npm run test:cloud:create
 *
 * Environment variables:
 * - CLOUD_LIVE: Set to '1' to enable this live test (required)
 * - TEST_ENV_LABEL: Environment label to resolve (e.g., 'owner/repo')
 * - TEST_ENV_LABEL_DEFAULT: Optional fallback label when TEST_ENV_LABEL is unset
 * - TEST_ENV_ID: Direct environment ID (skips label resolution)
 * - CODEX_PROMPT: Task prompt (default: 'What is 1+1?')
 * - CODEX_GIT_REF: Git reference (default: 'main')
 * - CODEX_BASE_URL: API base URL (default: 'https://chatgpt.com/backend-api')
 */

import { describe, it, expect } from 'vitest';
import { CloudTasksClientBuilder } from '../../src/cloud/index.js';

const LIVE_ENABLED = process.env.CLOUD_LIVE === '1';
const DEFAULT_TEST_ENV_LABEL = process.env.TEST_ENV_LABEL_DEFAULT?.trim() || 'example/default-env';

if (!LIVE_ENABLED) {
  console.warn('Skipping CloudTasks create test: set CLOUD_LIVE=1 to enable.');
}

const describeIf = LIVE_ENABLED ? describe : describe.skip;

describeIf('Cloud Tasks - Create with environment resolution', () => {
  it('should resolve environment label to id and create task', async () => {
    const envLabelOverride = process.env.TEST_ENV_LABEL?.trim();
    const testEnvLabel = envLabelOverride || DEFAULT_TEST_ENV_LABEL;
    const testEnvId = process.env.TEST_ENV_ID;
    const prompt = process.env.CODEX_PROMPT || 'What is 1+1?';
    const gitRef = process.env.CODEX_GIT_REF || 'main';
    const baseUrl = process.env.CODEX_BASE_URL || 'https://chatgpt.com/backend-api';

    console.log('\n🔧 Creating task with environment resolution\n');
    console.log(`📍 Environment check:`);
    console.log(`   - CODEX_CLOUD_TASKS_MODE: ${process.env.CODEX_CLOUD_TASKS_MODE || '(not set)'}`);
    console.log(`   - BASE_URL: ${baseUrl}\n`);

    const client = new CloudTasksClientBuilder()
      .withUserAgent('codex-sdk-test-create/1.0.0')
      .withBaseUrl(baseUrl)
      .build();

    try {
      let environmentId: string;

      if (testEnvId) {
        // Use direct ID if provided
        environmentId = testEnvId;
        console.log(`✅ Using provided environment ID: ${environmentId}`);
      } else {
        // Resolve label → id like the Rust test
        const labelLogSuffix = envLabelOverride ? '' : ' (default)';
        console.log(`🔍 Resolving environment label '${testEnvLabel}'${labelLogSuffix}...`);

        try {
          environmentId = await client.resolveEnvironmentId(testEnvLabel);
          console.log(`✅ Resolved label '${testEnvLabel}' → ${environmentId}\n`);
        } catch (error: any) {
          console.error(`❌ Failed to resolve environment label '${testEnvLabel}':`, error.message);

          // List available environments to help debugging
          console.log('\n📋 Available environments:');
          try {
            const envs = await client.listEnvironments();
            console.log(`   Found ${envs.length} environment(s)\n`);
            envs.forEach(env => {
              const pinned = env.isPinned ? '📌 ' : '   ';
              const hints = env.repoHints ? ` (${env.repoHints})` : '';
              console.log(`${pinned}${env.label || '(no label)'}${hints}`);
              console.log(`      id: ${env.id}`);
            });
          } catch (listError: any) {
            console.error('   ❌ Failed to list environments:', listError.message);
          }

          throw error;
        }
      }

      // Create the task
      console.log(`📝 Creating task:`);
      console.log(`   - environment: ${environmentId}`);
      console.log(`   - prompt: ${prompt}`);
      console.log(`   - gitRef: ${gitRef}\n`);

      const created = await client.createTask({
        environmentId,
        prompt,
        gitRef,
        qaMode: false,
        bestOfN: 1,
      });

      console.log(`✅ Created task id: ${created.id} (env: ${environmentId})`);
      console.log(`   UI: ${baseUrl.replace('/backend-api', '')}/codex/tasks/${created.id}\n`);

      // Assertions
      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.id).toMatch(/^task_/);

    } finally {
      client.close();
    }
  }, 60000); // 60 second timeout
});
