# Cloud Tasks Examples

This directory contains examples demonstrating how to use the Cloud Tasks API.

## Prerequisites

Set the required environment variable for API access:

```bash
export CODEX_INTERNAL_ORIGINATOR_OVERRIDE=codex_cli_rs
```

## Examples

### 1. Simple Workflow (`cloud-tasks-simple-workflow.cjs`)

**Minimal example showing the complete workflow:**

```bash
node examples/cloud-tasks-simple-workflow.cjs
```

**What it does:**
1. Resolves environment label "<ORG>/<ENV>" → environment ID
2. Creates a task with prompt "What is 2+2?"
3. Polls every 2 seconds until completion
4. Retrieves and displays results (messages and diff)

**Key Code:**

```javascript
const client = new CloudTasksClientBuilder().build();

// 1. Resolve environment
const envId = await client.resolveEnvironmentId(process.env.ENV_LABEL!);

// 2. Create task
const task = await client.createTask({
  environmentId: envId,
  prompt: 'What is 2+2?',
  gitRef: 'main',
});

// 3. Poll for completion
while (true) {
  const tasks = await client.listTasks({ limit: 100 });
  const t = tasks.find(x => x.id === task.id);

  if (t.status === 'ready' && t.turnStatus === 'completed') {
    break;
  }

  await new Promise(r => setTimeout(r, 2000));
}

// 4. Get results
const messages = await client.getTaskMessages(task.id);
const diff = await client.getTaskDiff(task.id);
```

### 2. Complete Workflow (`cloud-tasks-complete-workflow.cjs`)

**Full-featured example with detailed output and configuration:**

```bash
# With defaults
node examples/cloud-tasks-complete-workflow.cjs

# With custom configuration
ENV_LABEL=your-org/your-env \
TASK_PROMPT="Create a hello world function in hello.js" \
GIT_REF=main \
POLL_INTERVAL=2000 \
MAX_WAIT=300 \
node examples/cloud-tasks-complete-workflow.cjs
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV_LABEL` | `your-org/your-env` | Environment label to resolve |
| `TASK_PROMPT` | `Create a hello world function in hello.js` | Task prompt |
| `GIT_REF` | `main` | Git branch/ref |
| `POLL_INTERVAL` | `2000` | Polling interval in milliseconds |
| `MAX_WAIT` | `300` | Maximum wait time in seconds |

**What it does:**
1. Resolves environment label → ID with validation
2. Creates task with configurable parameters
3. Polls with configurable interval and timeout
4. Retrieves comprehensive results:
   - Task status and metadata
   - All messages
   - Full diff
   - Task text with turn details
   - Sibling turn information

**Sample Output:**

```
🚀 Cloud Tasks Complete Workflow Example

Configuration:
  - Environment: $ENV_LABEL
  - Prompt: Create a hello world function in hello.js
  - Git ref: main
  - Poll interval: 2000ms
  - Max wait: 300s

🔍 Step 1: Resolving environment '$ENV_LABEL'...
✅ Resolved to: <ENV_ID_32_HEX>

📝 Step 2: Creating task...
✅ Task created: <TASK_ID>
   UI: https://chatgpt.com/codex/tasks/<TASK_ID>

⏳ Step 3: Waiting for task to complete...
   ✅ Poll #12: Task complete (ready/completed)

✅ Task completed with status: ready
   Turn status: completed
   Updated at: 2025-10-07T19:15:42.123Z
   Files changed: 1
   Lines added: 5
   Lines removed: 0

📄 Step 4: Retrieving task results...

💬 Messages (3 total):
   1. Created hello.js with a simple hello world function...
   2. Function accepts name parameter and returns greeting...
   3. Added console.log example for testing...

📊 Diff (15 lines):
diff --git a/hello.js b/hello.js
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/hello.js
@@ -0,0 +1,5 @@
+function hello(name) {
+  return `Hello, ${name}!`;
+}
+
+console.log(hello('World'));

📋 Task Text:
   Prompt: Create a hello world function in hello.js
   Turn ID: <TASK_ID>~<TURN_ID>
   Attempt status: completed
   Attempt placement: 0
   Sibling turns: 0

✨ Workflow completed successfully!
```

### 3. Other Examples

**List Environments:**

```bash
node examples/cloud-tasks-basic.cjs
```

See the `examples/` directory for more examples including:
- `cloud-tasks-basic.cjs` - List environments
- `cloud-tasks-apply.cjs` - Apply task diffs locally
- `cloud-tasks-best-of-n.cjs` - Create tasks with multiple attempts

## API Reference

### Key Methods

#### Environment Management

```javascript
// List all environments
const envs = await client.listEnvironments();
// Returns: Array<{ id, label, isPinned, repoHints }>

// Resolve label → ID
const id = await client.resolveEnvironmentId(process.env.ENV_LABEL!);
// Accepts: label or 32-hex ID
// Returns: 32-hex environment ID
```

#### Task Creation

```javascript
const task = await client.createTask({
  environmentId: '<ENV_ID_32_HEX>',
  prompt: 'Add error handling to API',
  gitRef: 'main',
  qaMode: false,      // optional, default: false
  bestOfN: 1,         // optional, default: 1
});
// Returns: { id: 'task_e_...' }
```

#### Task Querying

```javascript
// List tasks
const tasks = await client.listTasks({
  environmentId: process.env.ENV_ID, // optional; or omit to list all
  limit: 100,                         // optional
});
// Returns: Array<TaskSummary>

// Get task messages
const messages = await client.getTaskMessages(taskId);
// Returns: string[]

// Get task diff
const diff = await client.getTaskDiff(taskId);
// Returns: string | null

// Get full task text
const text = await client.getTaskText(taskId);
// Returns: { prompt, messages, turnId, attemptStatus, ... }
```

#### Task Application

```javascript
// Dry run (preflight)
const preflight = await client.applyTaskPreflight(taskId);
console.log(preflight.status);  // 'success' | 'partial' | 'error'

// Apply to working directory
const result = await client.applyTask(taskId);
console.log(result.applied);       // boolean
console.log(result.conflictPaths); // string[]
```

### Task Status Values

**Task Status** (`task.status`):
- `pending` - Task is queued
- `ready` - Task diff is ready
- `applied` - Task has been applied locally
- `error` - Task failed

**Turn Status** (`task.turnStatus`):
- `pending` - Turn is being processed
- `in-progress` - Turn is executing
- `completed` - Turn finished successfully
- `failed` - Turn failed
- `cancelled` - Turn was cancelled

**Polling Logic:**

A task is complete when:
```javascript
(task.status === 'ready' || task.status === 'error') &&
(task.turnStatus === 'completed' || task.turnStatus === 'failed')
```

## Testing

Run the live tests:

```bash
# List tasks test
npm run test:cloud:list

# Create task test
npm run test:cloud:create

# List environments test
npx vitest run tests/live/cloud-list-envs.test.ts
```

## Troubleshooting

### "Environment not found"

Make sure the environment exists:
```javascript
const envs = await client.listEnvironments();
envs.forEach(e => console.log(e.label, '→', e.id));
```

### "Task not found"

The task may not appear immediately in `listTasks()`. Wait a moment and retry.

### Polling timeout

Increase `MAX_WAIT` environment variable or adjust the timeout in your code.

## Notes

- **No single-task GET API**: To check task status, use `listTasks()` and find your task
- **Polling is required**: The API doesn't provide webhooks or server-sent events
- **Environment filtering is unreliable**: Backend may return all tasks regardless of filter
- **Use task IDs for tracking**: Don't rely on environment filtering; track by task ID
