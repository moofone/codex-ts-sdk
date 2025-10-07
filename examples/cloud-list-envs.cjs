#!/usr/bin/env node
/* eslint-disable no-console */
const { CloudTasksClientBuilder } = require('../dist/cjs/src/cloud/index.js');

(async () => {
  const client = new CloudTasksClientBuilder()
    .withUserAgent('codex-ts-sdk/examples')
    .build();
  try {
    const envs = await client.listEnvironments();
    console.log('ID                              \tLABEL');
    envs.forEach(e => console.log(`${e.id}\t${e.label || ''}`));
    if (process.argv[2]) {
      const id = await client.resolveEnvironmentId(process.argv[2]);
      console.log(`\nResolved: ${process.argv[2]} -> ${id}`);
    }
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  } finally {
    client.close();
  }
})();

