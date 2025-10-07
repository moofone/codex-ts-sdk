# Migration Guide: v0.0.7 → v0.1.0

This guide helps you upgrade from SDK v0.0.7 to v0.1.0, which adds support for **Cloud Tasks** and requires upgrading the underlying codex-rs dependency from `rust-v0.42.0` to `rust-v0.45.0`.

## Summary of Changes

### ✅ **No Breaking Changes**

Cloud tasks is an **additive feature**. Your existing code using `CodexClient` will continue to work without modifications.

### 🆕 **New Features**

1. **Cloud Tasks API** - Remote code generation with best-of-N attempts
2. **New Subpath Export** - `import { CloudTasksClient } from 'codex-ts-sdk/cloud'`
3. **Native Dependency Upgrade** - Requires codex-rs `rust-v0.45.0+`

---

## Upgrade Steps

### Step 1: Update SDK Version

```bash
npm install @flo-ai/codex-ts-sdk@0.1.0
```

### Step 2: Upgrade codex-rs (If Building from Source)

If you're building native bindings from source, update to codex-rs v0.45.0:

```bash
# Update your CODEX_RUST_ROOT to point to rust-v0.45.0
export CODEX_RUST_ROOT=/path/to/codex-rs-v0.45.0

# Rebuild native bindings
npm run setup
```

**Note**: If you're using pre-built binaries from npm, this step is handled automatically.

### Step 3: Test Existing Functionality

Verify that your existing code still works:

```bash
npm test
```

### Step 4: (Optional) Start Using Cloud Tasks

If you want to use the new cloud tasks feature:

```typescript
import { CloudTasksClientBuilder } from 'codex-ts-sdk/cloud';

const client = new CloudTasksClientBuilder()
  // baseUrl optional; defaults to process.env.CODEX_CLOUD_TASKS_BASE_URL
  // or 'https://chatgpt.com/backend-api'
  .withBearerToken(process.env.OPENAI_API_KEY!)
  .build();

const tasks = await client.listTasks();
client.close();
```

---

## What Changed?

### New Exports

**v0.1.0 adds these exports:**

```typescript
// New subpath export for cloud tasks
import {
  CloudTasksClient,
  CloudTasksClientBuilder,
  CloudTasksError,
  CloudTasksErrorCode,
} from 'codex-ts-sdk/cloud';

// New types
import type {
  TaskSummary,
  TaskStatus,
  CreatedTask,
  ApplyOutcome,
  ApplyStatus,
  TaskText,
  TurnAttempt,
  AttemptStatus,
  DiffSummary,
  ListTasksOptions,
  ApplyOptions,
  CreateTaskOptions,
} from 'codex-ts-sdk/cloud';
```

**All existing exports remain unchanged.**

### Native Module Updates

The underlying native module (`native/codex-napi`) now includes cloud tasks bindings:

- `cloud_tasks_list()`
- `cloud_tasks_create()`
- `cloud_tasks_get_diff()`
- `cloud_tasks_get_messages()`
- `cloud_tasks_get_text()`
- `cloud_tasks_apply()`
- `cloud_tasks_list_attempts()`

**Graceful Degradation**: If native cloud tasks functions are unavailable (e.g., using older binaries), attempting to use `CloudTasksClient` will throw a clear error message guiding you to upgrade codex-rs.

---

## Configuration Changes

### codex-rs Dependency

**Before (v0.0.7):**
```toml
# Cargo.toml used rust-v0.42.0
```

**After (v0.1.0):**
```toml
# Cargo.toml uses rust-v0.45.0
codex-cloud-tasks-client = { path = "...", features = ["mock"] }
```

### Environment Variables

No changes required. Existing environment variables work as before:

- `CODEX_RUST_ROOT` - Still used for building from source
- `CODEX_HOME` - Still used for credentials and session data

---

## Compatibility Matrix

| SDK Version | codex-rs Version | Cloud Tasks | Core Features |
|-------------|------------------|-------------|---------------|
| v0.0.7      | rust-v0.42.0     | ❌          | ✅            |
| v0.1.0      | rust-v0.45.0     | ✅          | ✅            |

---

## Rollback Plan

If you encounter issues, you can safely rollback to v0.0.7:

```bash
npm install @flo-ai/codex-ts-sdk@0.0.7
```

Your code will continue to work as before, but cloud tasks features will be unavailable.

---

## Common Issues

### Issue: "Cloud tasks are not available in the current native binding"

**Cause**: Native bindings were compiled against codex-rs < v0.45.0

**Solution**:
1. Verify you're using SDK v0.1.0+: `npm list @flo-ai/codex-ts-sdk`
2. If building from source, rebuild with v0.45.0:
   ```bash
   export CODEX_RUST_ROOT=/path/to/codex-rs-v0.45.0
   npm run setup
   ```
3. If using pre-built binaries, reinstall: `npm install --force`

### Issue: Tests failing after upgrade

**Cause**: Native module rebuild required

**Solution**:
```bash
# Clean and rebuild
rm -rf node_modules native/codex-napi/index.node
npm install
npm run build:native
npm test
```

### Issue: TypeScript errors on cloud tasks imports

**Cause**: TypeScript cache or incomplete installation

**Solution**:
```bash
# Clear TypeScript cache
rm -rf dist node_modules/.cache
npm run build
npm run typecheck
```

---

## New Examples

Try out the new cloud tasks examples:

```bash
# Basic task management
node examples/cloud-tasks-basic.cjs

# Best-of-N workflow
node examples/cloud-tasks-best-of-n.cjs

# Safe patch application
node examples/cloud-tasks-apply.cjs
```

---

## API Compatibility

### Unchanged APIs ✅

All existing APIs remain unchanged and fully compatible:

- `CodexClient` - ✅ No changes
- `CodexClientBuilder` - ✅ No changes
- `CodexClientPool` - ✅ No changes
- `ConversationManager` - ✅ No changes
- `RolloutRecorder` - ✅ No changes
- `SessionSerializer` - ✅ No changes
- `ConversationResumer` - ✅ No changes
- `DataStorage` - ✅ No changes
- All event types - ✅ No changes
- All option types - ✅ No changes

### New APIs 🆕

- `CloudTasksClient` - ✨ New
- `CloudTasksClientBuilder` - ✨ New
- `CloudTasksError` - ✨ New
- Cloud tasks types - ✨ New

---

## Questions?

- 📖 [Cloud Tasks API Reference](cloud-tasks.md)
- 📋 [Full Specification](../spec/CODEX_CLOUD.md)
- 🐛 [Report Issues](https://github.com/flo-ai/codex-ts-sdk/issues)
- 💬 [Architecture Documentation](architecture.md)

---

## Summary

✅ **Safe to upgrade** - No breaking changes to existing code
✨ **New cloud tasks API** - Opt-in remote code generation features
📦 **Requires rust-v0.45.0** - For cloud tasks support only
🔄 **Easy rollback** - Can revert to v0.0.7 if needed

**Recommendation**: Upgrade to v0.1.0 now, start using cloud tasks when ready.
