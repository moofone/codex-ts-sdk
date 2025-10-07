/**
 * Simple test to verify listEnvironments works
 *
 * Run with: CLOUD_LIVE=1 npm run test:cloud:list
 */

import { describe, it, expect } from 'vitest';
import { CloudTasksClientBuilder } from '../../src/cloud/index.js';

const LIVE_ENABLED = process.env.CLOUD_LIVE === '1';

if (!LIVE_ENABLED) {
  console.warn('Skipping CloudTasks list environments test: set CLOUD_LIVE=1 to enable.');
}

const describeIf = LIVE_ENABLED ? describe : describe.skip;

describeIf('Cloud Tasks - List Environments', () => {
  it('should list environments', async () => {
    console.log('\n🔍 Testing listEnvironments...\n');

    const client = new CloudTasksClientBuilder()
      .withUserAgent('codex-sdk-test/1.0.0')
      .build();

    try {
      const envs = await client.listEnvironments();
      console.log(`✅ Retrieved ${envs.length} environment(s)\n`);

      envs.forEach((env, idx) => {
        console.log(`${idx + 1}. ${env.label || '(no label)'}`);
        console.log(`   id: ${env.id}`);
        console.log(`   isPinned: ${env.isPinned ?? 'N/A'}`);
        console.log(`   repoHints: ${env.repoHints || 'N/A'}`);
        console.log('');
      });

      expect(envs).toBeDefined();
      expect(Array.isArray(envs)).toBe(true);

    } finally {
      client.close();
    }
  }, 30000);
});
