# OpenAI Codex TypeScript SDK

Experimental TypeScript client for the [OpenAI Codex](https://openai.com/codex/) native runtime.

No conflict with native codex cli!

📖 **[Architecture Documentation](docs/architecture.md)** - Detailed system design and component overview

## Highlights
- Typed `CodexClient` for conversations, streaming events, and approvals
- Builder utilities for sharing configuration
- Plugin, logging, retry, sandbox, and approval hooks
- `getCodexCliVersion()` to ensure the SDK and codex-cli runtimes stay in sync (See Notes below)
- Native loader automatically discovers the correct `native/codex-napi` binary so deployments stay portable
- `events()` exposes a cleanup-aware async iterator backed by an internal queue, so `for await` loops stop cleanly on abort

## Version Matching

This requires using codex-rs release tag (for example `rust-v0.42.0` from https://github.com/openai/codex/tags) Do not use main branch! Explained in architecture.md the reason why. 

## Prerequisites

The Rust toolkit is required for building the native bindings.https://rust-lang.org/tools/install

## Setup

# Required environment variables
- `CODEX_RUST_ROOT=/absolute/path/to/codex/codex-rs` – points at the checked-out codex-rs release tag so `npm run setup` can read its version. Specifying this means the SDK will not conflict with any system-installed codex CLI. Once npm run setup is run, this is no longer required.
- `CODEX_HOME=~/.codex` – tells the runtime where to store credentials and session data (the default is fine).

MacOS/Linux: Depending on shell something like export CODEX_HOME="~/.codex"
Windows PowerShell: `Set-Item env:CODEX_HOME "$env:USERPROFILE\.codex"`

`npm run setup` installs dependencies, rebuilds the TypeScript bundle, recompiles the native binding, and verifies that the embedded version matches your codex checkout. The loader automatically uses the freshly compiled `native/codex-napi/index.node`, so there is no environment flag to manage afterward.

Run the installer:

   ```bash
   npm run setup
 ```

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

## Live Rate Limit Monitor

Monitor your OpenAI API rate limits with visual ASCII charts and usage projections:

```bash
node examples/live-rate-limits.cjs
```

![Rate Limit Monitor](docs/rate-limit-monitor.png)

The monitor shows:
- **Visual progress bars** with current usage in color-coded blocks
- **Projection visualization** using dashes to show projected usage and `!` to mark when limits will be hit
- **Daily usage rates** for weekly limits with linear regression analysis
- **24-hour time format** and clean, compact display

Color coding:
- **Green**: Safe usage levels
- **Yellow**: Warning - will hit limit but more than 24 hours away
- **Red**: Critical - will hit limit within 24 hours

### Authentication helpers

To persist an API key for the native runtime, call `loginWithApiKey` once (this mirrors `codex login --api-key ...`):

```ts
import { loginWithApiKey } from 'codex-ts-sdk';

loginWithApiKey(process.env.OPENAI_API_KEY!, { codexHome: process.env.CODEX_HOME });
```

If you prefer the browser-based ChatGPT OAuth flow, run `codex login` from the CLI instead.

## Useful scripts
- `npm run setup` – install, build, native compile, smoke check
- `npm run build`
- `npm run test:live:status` – live smoke test

### Live version checks

The `tests/live/statusTest.ts` harness prints the version baked into the native module. To see a real semantic version instead of `0.0.0`, check out an official tag (e.g. `git -C /path/to/codex-rs checkout rust-v0.42.0`) before running `npm run setup`. The test uses the SDK’s live API and native telemetry only—no CLI fallbacks are invoked.
- `npm test`

## Configuration reference

| Option             | Description                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `codexHome`        | Path to the Codex runtime directory (contains binaries and generated state). Supports `~` expansion. |
| `nativeModulePath` | Override path to the compiled `codex-napi` binary.                                                   |
| `logger`           | Partial logger implementation for structured output.                                                 |
| `retryPolicy`      | `{ maxRetries, initialDelayMs, backoffFactor }` for connect retries.                                 |
| `approvalPolicy`   | Default approval policy applied to `sendUserTurn` (defaults to `on-request`).                        |
| `sandboxPolicy`    | Default sandbox mode for tool execution (defaults to `workspace-write` with no network).             |
| `defaultModel`     | Canonical Codex model slug used when not provided.                                                   |
| `plugins`          | Array of `CodexPlugin` implementations.                                                              |
