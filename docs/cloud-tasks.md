# Cloud Tasks (TypeScript SDK)

The Cloud Tasks module provides a thin TypeScript client around the native Codex bindings for working with remote, cloud‑executed tasks. It mirrors the CLI’s functionality and adds structured apply/preflight support.

Note: Authentication is CLI‑managed. The native layer reads `~/.codex/auth.json` (or `CODEX_HOME`) and supports both OpenAI API tokens and ChatGPT auth. The TypeScript layer does not read auth.json.

## Installation

- Ensure you have a codex‑rs checkout with Cloud Tasks support (rust‑v0.45.0+), or prebuilt N‑API binaries.
- Build the native binding (`npm run build:native`) or consume prebuilt artifacts.

## Usage

```ts
import { CloudTasksClient, CloudTasksClientBuilder } from 'codex-ts-sdk/cloud';

const client = new CloudTasksClientBuilder()
  // baseUrl optional; defaults to process.env.CODEX_CLOUD_TASKS_BASE_URL
  // or 'https://chatgpt.com/backend-api' (codex-rs parity)
  .withUserAgent('my-app/1.0.0')
  // Optionally pass a bearer token; otherwise native will use CLI‑managed auth
  // .withBearerToken(process.env.OPENAI_API_KEY!)
  .build();

// List tasks
const tasks = await client.listTasks();

// Get detailed info for each task
for (const task of tasks) {
  const text = await client.getTaskText(task.id);
  console.log(`Task: ${task.title}`);
  console.log(`Prompt: ${text.prompt}`);
  console.log(`Messages: ${text.messages.length}`);
}

// Create task
const created = await client.createTask({
  environmentId: 'staging',
  prompt: 'Add error handling',
  gitRef: 'main',
});

// Preflight then apply
const pre = await client.applyTaskPreflight(created.id);
if (pre.status === 'success') {
  await client.applyTask(created.id);
}

client.close();
```

### List Environments (id + label)

Use the same discovery as the Codex TUI to fetch environment ids and resolve a label/slug to the internal id the backend expects:

```ts
const envs = await client.listEnvironments();
envs.forEach(e => console.log(e.id, e.label));

// Resolve a human label or a hex id
const id = await client.resolveEnvironmentId('owner/repo');
// id is a 32-hex environment id usable with createTask()
```

## Known Limitations

### Environment Filtering
**Caveat:** Listing by environment is currently unreliable. `listTasks({ environmentId })` may not filter server-side, and the list payload often lacks `environmentId`.

**Workaround:** Use the returned task `id` to get detailed information:
```ts
const allTasks = await client.listTasks();
for (const task of allTasks) {
  const text = await client.getTaskText(task.id);
  const diff = await client.getTaskDiff(task.id);
  // Now you have full task details
}
```

## Best‑of‑N

Use `listSiblingAttempts(taskId, turnId)` and `diffOverride` in `applyTask()` to apply an alternate attempt.

## Error Handling

Errors throw `CloudTasksError` with a `code`:
- `HTTP`, `IO`, `MESSAGE`, `UNIMPLEMENTED`.

## Native Binding Expectations

The native module must export the following async functions:
- `cloud_tasks_list`, `cloud_tasks_create`, `cloud_tasks_get_diff`, `cloud_tasks_get_messages`, `cloud_tasks_get_text`, `cloud_tasks_apply`, `cloud_tasks_list_attempts`.

The TS loader auto-detects the native binding in `native/codex-napi/` (prebuilt or built locally). If not found, Cloud APIs throw `UNIMPLEMENTED`.

## Live Smoke Test (ChatGPT auth)

Once you build the native binding against `rust-v0.45.0+`, you can run a read-only smoke test (list tasks) using your CLI-managed ChatGPT auth:

```bash
# from the codex-ts-sdk repo
npm run build:native                      # ensure native/codex-napi/index.node is rebuilt
CLOUD_LIVE=1 vitest run tests/live/cloud-live.test.ts
```

The test is skipped unless:

- `CLOUD_LIVE=1` is set, and
- native `cloud_tasks_*` exports are available (built against the new codex-rs tag).

No `OPENAI_API_KEY` is required; the native layer reads `~/.codex/auth.json` (or `CODEX_HOME`) just like the CLI, so make sure you’ve already authenticated with `codex login --chatgpt`.
