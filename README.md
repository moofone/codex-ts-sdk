# OpenAI Codex TypeScript SDK

![Node Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Tests](https://img.shields.io/badge/tests-320%2F322%20passed-green)
![Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen)
![Lint](https://img.shields.io/badge/lint-3%20errors-yellow)
![NPM Version](https://img.shields.io/badge/npm-v0.0.7-orange)
![License](https://img.shields.io/badge/license-MIT-green)

Experimental TypeScript client for the [OpenAI Codex](https://openai.com/codex/) native runtime.

This will not conflict with Codex system CLI

📖 **[Architecture Documentation](docs/architecture.md)** - Detailed system design and component overview

## Key Features

- **Native Rust Integration** – Direct NAPI bindings to codex-rs for maximum performance and CLI compatibility
- **Multi-Conversation Management** – Orchestrate concurrent conversations with automatic lifecycle management and resumption
- **Session Persistence & Replay** – Record conversations to JSONL/JSON and resume from any point with full state restoration
- **Real-Time Rate Monitoring** – Live rate limit tracking with visual progress indicators and usage projections
- **Enterprise-Ready Architecture** – Connection pooling, retry logic, plugin system, and comprehensive error handling
- **Type-Safe Streaming** – Fully typed event streams with async iterators and automatic cleanup

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

Simple Bundled Example: Monitor your Plan-Based Codex rate limits with visual ASCII charts and usage projections:

```bash
node examples/live-rate-limits.cjs
```

```text
Connecting and fetching live data...

Current Rate Limits

Primary (gpt-4.1-mini per-week):
  [██████████████████████████---------------·······················] 58% (~8.4%/day)
  Window: 2025-09-20 08:41 → 2025-09-27 08:41
  Safe - won't hit 100% before reset

Secondary (gpt-4.1-mini per-day):
  [███████████████████████████!-----------·······················] 83%
  Projected 100%: 2025-09-26 19:07
```

### Authentication helpers

To persist an API key for the native runtime, call `loginWithApiKey` once (this mirrors `codex login --api-key ...`):

```ts
import { loginWithApiKey } from 'codex-ts-sdk';

loginWithApiKey(process.env.OPENAI_API_KEY!, { codexHome: process.env.CODEX_HOME });
```

If you prefer the browser-based ChatGPT OAuth flow, run `codex login` from the CLI instead.

## Development Scripts

### Setup & Build
- **`npm run setup`** – Complete SDK setup: install dependencies, discover codex-rs version, build native bindings, and run smoke tests. Requires `CODEX_RUST_ROOT` environment variable pointing to your codex-rs checkout.
- **`npm run build:native`** – Compile the Rust NAPI bindings only. Faster than full setup when you just need to rebuild native code.
- **`npm run package`** – Full build pipeline: TypeScript compilation (ESM/CJS), type definitions, and native bindings. Used for publishing.

### Testing & Validation
- **`npm run test:live:status`** – Live integration test that connects to Codex runtime, sends a conversation turn, and validates rate limit monitoring. Requires active authentication (via `codex login` or API key).
- **`npm run test:live:auth`** – Authentication system test that verifies API key functionality works correctly, especially when ChatGPT OAuth is already active. Uses intentionally invalid keys to test failure paths.
- **`npm run test`** – Run full test suite (unit tests only, no live API calls)
- **`npm run coverage`** – Generate test coverage report

### Code Quality
- **`npm run lint`** – Run ESLint on source code
- **`npm run typecheck`** – TypeScript compilation check without output generation