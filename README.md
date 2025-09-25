# OpenAI Codex TypeScript SDK

Experimental TypeScript client for the [OpenAI Codex](https://openai.com/codex/) native runtime.

📖 **[Architecture Documentation](docs/architecture.md)** - Detailed system design and component overview

## Highlights
- Typed `CodexClient` for conversations, streaming events, and approvals
- Builder utilities for sharing configuration
- Plugin, logging, retry, sandbox, and approval hooks
- `getCodexCliVersion()` to ensure the SDK and codex-cli runtimes stay in sync
- Native loader finds the right `native/codex-napi` binary (or respects `CODEX_NATIVE_MODULE`) so deployments stay portable
- `events()` exposes a cleanup-aware async iterator backed by an internal queue, so `for await` loops stop cleanly on abort

## Setup
1. Requirements: Node.js >= 18, npm, Rust toolchain, Codex runtime (`codex --version` creates `~/.codex`).
2. Run the installer:

   ```bash
   npm run setup
   ```

   - macOS/Linux use `~/.codex` automatically
   - Windows PowerShell: `Set-Item env:CODEX_HOME "$env:USERPROFILE\.codex"`
   - Custom runtime build? Point `CODEX_HOME` at its output first

## Quickstart
```ts
import { CodexClient, CodexClientBuilder } from 'codex-ts-sdk';

const client = new CodexClientBuilder()
  .withCodexHome(process.env.CODEX_HOME!)
  .withSandboxPolicy({ mode: 'workspace-write', network_access: false })
  .withApprovalPolicy('on-request')
  .build();

await client.connect();
await client.createConversation();
await client.sendUserTurn('List the steps for safe git rebases.');

for await (const event of client.events()) {
  console.log(event.msg);
}
```

### Authentication helpers

To persist an API key for the native runtime, call `loginWithApiKey` once (this mirrors `codex login --api-key ...`):

```ts
import { loginWithApiKey } from 'codex-ts-sdk';

loginWithApiKey(process.env.OPENAI_API_KEY!, { codexHome: process.env.CODEX_HOME });
```

If you prefer the browser-based ChatGPT OAuth flow, run `codex login` from the CLI instead.

## Useful scripts
- `npm run setup` – install, build, native compile, smoke check
- `npm run build` / `npm run build:native`
- `npm test`

## Examples
Run after `npm run setup`:

```bash
export CODEX_HOME="$HOME/.codex"
node examples/live-smoke.js
```

Each script automatically uses `native/codex-napi/index.node` unless `CODEX_NATIVE_MODULE` overrides it.

## Configuration reference

| Option             | Description                                                          |
| ------------------ | -------------------------------------------------------------------- |
| `codexHome`        | Path to the Codex runtime directory (contains binaries and generated state). Supports `~` expansion. |
| `nativeModulePath` | Override path to the compiled `codex-napi` binary.                   |
| `logger`           | Partial logger implementation for structured output.                 |
| `retryPolicy`      | `{ maxRetries, initialDelayMs, backoffFactor }` for connect retries. |
| `approvalPolicy`   | Default approval policy applied to `sendUserTurn` (defaults to `on-request`). |
| `sandboxPolicy`    | Default sandbox mode for tool execution (defaults to `workspace-write` with no network). |
| `defaultModel`     | Canonical Codex model slug used when not provided.                   |
| `plugins`          | Array of `CodexPlugin` implementations.                              |

## Advanced: building the runtime yourself
- Clone `openai/codex`, build `codex-rs` with `cargo build --release`
- Set `CODEX_HOME=codex-rs/target/release`
- Re-run `npm run setup`; confirm with `npm test` or `node examples/live-smoke.js`
