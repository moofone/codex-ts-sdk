#!/usr/bin/env node
/* eslint-disable no-console */
const { CloudTasksClientBuilder } = require('../dist/cjs/src/cloud/index.js');

async function main() {
  const client = new CloudTasksClientBuilder()
    // baseUrl optional; defaults to process.env.CODEX_CLOUD_TASKS_BASE_URL
    // or 'https://chatgpt.com/backend-api'
    .withUserAgent('cloud-example/0.1.0')
    // Optionally: .withBearerToken(process.env.OPENAI_API_KEY)
    .build();

  try {
    const tasks = await client.listTasks();
    console.log(`Tasks: ${tasks.length}`);
    for (const t of tasks) {
      console.log(`[${t.id}] ${t.title} - ${t.status}`);
    }
  } catch (err) {
    console.error('Cloud tasks unavailable or failed:', err.message || err);
  } finally {
    client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
