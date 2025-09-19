# codex-ts-sdk

A TypeScript client for the Codex native runtime. **Experimental preview** – the
API surface and defaults may change without notice; use at your own risk and
verify in your environment before adopting in production.

It exposes the `CodexClient` API used to open conversations, stream events, and
respond to approval requests from JavaScript and TypeScript applications.

## Motivation

The Codex runtime is written in Rust and surfaced to Node.js through the
`codex-napi` bindings under `native/`. This SDK keeps that binding pinned,
loads the right native module for the host, and presents a small typed façade
so apps can manage conversations and stream events without touching the FFI
layer.

## Features

- Typed `CodexClient` and helpers to manage conversations and streaming events
- Optional plugin hooks for request enrichment, telemetry, and error handling
- Builder utilities (`CodexClientBuilder`, `CodexClientPool`) for sharing
  configuration across clients
- Configurable retry policy, logging, and sandbox/approval defaults
- Helpers for resolving Codex model variants and reasoning effort metadata

## Installation

Install the SDK directly from this folder during development:

```bash
npm install ../codex-ts-sdk
```

## Quickstart

```ts
import { CodexClient, CodexClientBuilder } from 'codex-ts-sdk';

const client = new CodexClientBuilder()
  .withCodexHome(process.env.CODEX_HOME ?? '~/.codex')
  .withSandboxPolicy({
    mode: 'workspace-write',
    network_access: false,
  })
  .withApprovalPolicy('on-request')
  .build();

await client.connect();
await client.createConversation();
await client.sendUserTurn('List the steps for safe git rebases.');

for await (const event of client.events()) {
  console.log(event.msg);
}
```

By default the client uses a `workspace-write` sandbox (no network access) and
relies on Codex to request approval (`on-request`). Override those policies if
your deployment requires a different risk profile.

## Environment Setup

1. **Install prerequisites**
   - Node.js >= 18 and npm (or pnpm/yarn)
   - Rust toolchain installed via <https://www.rust-lang.org/tools/install> (use the default `stable` channel)
   - Platform build tools (required by Cargo and `@napi-rs/cli` to compile the native binding):
     - macOS – Xcode Command Line Tools (`xcode-select --install`)
     - Linux – `build-essential`, `python3`, `pkg-config`, and OpenSSL headers
     - Windows – "Desktop development with C++" workload for Visual Studio Build Tools
2. **Build the Codex runtime assets**
   - Clone the upstream repo: `git clone https://github.com/openai/codex.git`
   - Enter the workspace: `cd codex/codex-rs`
   - Compile the runtime: `cargo build --release`
   - Copy or symlink the resulting assets (for example from `target/release`) into your preferred directory and set `CODEX_HOME` to that path. The SDK defaults to `~/.codex`, so many setups simply copy the assets there.
3. **Compile the Node binding**
   - From this SDK repository run `npm install` to fetch dependencies (including `@napi-rs/cli`).
   - Run `npm run build:native` to build `native/codex-napi/index.node` against the pinned `codex-rs` revision. See [Native Module Internals](#native-module-internals) if you need to point the build at a different checkout.
4. **Wire up the client**
   - Export `CODEX_HOME` (or pass `codexHome`) so the SDK can find the assets you staged in step 2.
   - Review sandbox and approval policies before connecting; the defaults allow workspace writes only and rely on Codex to request approvals.
   - If you compiled a custom N-API binary, provide its location via `nativeModulePath` when creating the client.

## Examples

- `examples/basic-chat.ts` – Minimal conversation loop streaming the first response.
- `examples/approval-demo.ts` – Auto-approve exec and patch requests via event listeners.
- `examples/streaming.ts` – Print streaming deltas in real time.
- `examples/error-handling.ts` – Demonstrates handling the structured `CodexError` hierarchy.

## Configuration

| Option             | Description                                                          |
| ------------------ | -------------------------------------------------------------------- |
| `codexHome`        | Path to the Codex assets. Supports `~` expansion.                    |
| `nativeModulePath` | Override path to the compiled `codex-napi` binary.                   |
| `logger`           | Partial logger implementation for structured output.                 |
| `retryPolicy`      | `{ maxRetries, initialDelayMs, backoffFactor }` for connect retries. |
| `approvalPolicy`   | Default approval policy applied to `sendUserTurn` (defaults to `on-request`). |
| `sandboxPolicy`    | Default sandbox mode for tool execution (defaults to `workspace-write` with no network). |
| `defaultModel`     | Canonical Codex model slug used when not provided.                   |
| `plugins`          | Array of `CodexPlugin` implementations.                              |

## Plugin API

```ts
import type { CodexPlugin } from 'codex-ts-sdk';

const telemetryPlugin: CodexPlugin = {
  name: 'telemetry',
  initialize: ({ logger }) => logger?.info?.('Telemetry enabled'),
  afterEvent: async (event) => {
    // ship event to analytics pipeline
  },
};
```

Register plugins via the constructor config or call `client.registerPlugin()` at
runtime.

## Testing

- `npm run test` executes the Vitest suite, including the mocked native integration harness.
- `npm run coverage` enforces the 80%+ global coverage thresholds configured in `vitest.config.ts`.

## Scripts

- `npm run build` – Compile ESM, CJS, and declaration outputs to `dist/`
- `npm run test` – Execute the Vitest suite (mocked runtime)
- `npm run coverage` – Run the suite with coverage reporting
- `npm run build:native` – Build platform binaries via `@napi-rs/cli`
- `npm run package` – Produce JS + native artefacts ready for publishing


## Native Module Internals

The TypeScript facade loads a Rust shared library owned by the `codex-napi` crate inside this repository. That crate depends on the [`codex-rs` workspace](https://github.com/openai/codex) and is compiled with `@napi-rs/cli`.

### Building with the pinned codex-rs revision

`npm run build:native` runs `npx napi build --platform` under the hood. The command fetches the git revision declared in `native/codex-napi/Cargo.toml`, compiles it in release mode, and emits `native/codex-napi/index.node`. Use `npm run package` to copy that artefact into `native/codex-napi/prebuilt/<platform>-<arch>/` so it can be published to npm.

### Building against a local codex-rs checkout

If you have local changes to the Codex runtime:

1. Clone the runtime if you have not already: `git clone https://github.com/openai/codex.git`.
2. Add a Cargo patch file at `native/codex-napi/.cargo/config.toml` (create the directory if needed):

   ```toml
   [patch.'https://github.com/openai/codex']
   codex-core = { path = "/absolute/path/to/codex/codex-rs/core" }
   codex-protocol = { path = "/absolute/path/to/codex/codex-rs/protocol" }
   ```

3. Re-run `npm run build:native`. Cargo will reuse the local sources instead of downloading the pinned git revision.

### Deploying prebuilt artefacts

`native/codex-napi/prebuilt/` mirrors the directory structure expected by `@napi-rs/cli`. When you cross-compile for additional targets, drop each `index.node` under `prebuilt/<platform>-<arch>/`. The client automatically picks up the correct binary at runtime, or you can override it with `nativeModulePath`.

### Pointing the SDK at a custom build

```ts
import { CodexClient } from 'codex-ts-sdk';

const client = new CodexClient({
  codexHome: '/opt/codex',
  nativeModulePath: '/opt/codex-sdk/prebuilt/darwin-arm64/index.node',
});
```

Set the `CODEX_HOME` environment variable (or pass `codexHome`) to the directory containing the Codex runtime assets produced by `codex-rs` and the SDK will load the matching napi binary.


## Binding Coverage

| Rust export | TypeScript usage | Tests hitting it | Notes |
| --- | --- | --- | --- |
| `NativeCodex::new` | `CodexClient.connect()` creates the binding (`src/client/CodexClient.ts:73`) | `tests/CodexClient.test.ts:77` | Fully wrapped; handles `~` expansion for `codexHome`. |
| `NativeCodex::create_conversation` | `CodexClient.createConversation()` (`src/client/CodexClient.ts:112`) | `tests/CodexClient.test.ts:77`, `tests/integration/CodexClient.integration.test.ts:28` | Streams the initial `session_configured` event emitted by Rust. |
| `CodexSession::next_event / submit / close` | Event loop + submission helpers in `CodexClient` (`src/client/CodexClient.ts:133-200`) | `tests/CodexClient.test.ts:90`, `tests/integration/CodexClient.integration.test.ts:28`, `tests/examples/examples.test.ts:284` | Core flow covered; `interruptConversation()` and patch approvals exist but lack assertions. |
| `version()` | Not exposed in the SDK | — | Available in the binding; surface later if we need runtime version info. |

### Protocol Operations

| Rust `Op` variant (`codex-rs/protocol/src/protocol.rs:53-175`) | Client support | Tests | Status |
| --- | --- | --- | --- |
| `Interrupt` | `CodexClient.interruptConversation()` → `createInterruptSubmission()` (`src/client/CodexClient.ts:178`) | — | Implemented, currently untested. |
| `UserInput` | `CodexClient.sendMessage()` → `createUserInputSubmission()` (`src/client/CodexClient.ts:133`) | `tests/CodexClient.test.ts:90` | Covered. |
| `UserTurn` | `CodexClient.sendUserTurn()` → `createUserTurnSubmission()` (`src/client/CodexClient.ts:150`) | `tests/CodexClient.test.ts:108`, `tests/integration/CodexClient.integration.test.ts:28`, `tests/examples/examples.test.ts:284` | Covered. |
| `ExecApproval` | `CodexClient.respondToExecApproval()` (`src/client/CodexClient.ts:184`) | `tests/integration/CodexClient.integration.test.ts:67`, `tests/examples/examples.test.ts:308` | Covered. |
| `PatchApproval` | `CodexClient.respondToPatchApproval()` (`src/client/CodexClient.ts:194`) | — | Implemented, awaiting targeted test. |
| `OverrideTurnContext` | — | — | Currently not exposed via the SDK. |
| `AddToHistory` | — | — | Currently not exposed via the SDK. |
| `GetHistoryEntryRequest` | — | — | Currently not exposed via the SDK. |
| `GetPath` | — | — | Currently not exposed via the SDK. |
| `ListMcpTools` | — | — | Currently not exposed via the SDK. |
| `ListCustomPrompts` | — | — | Currently not exposed via the SDK. |
| `Compact` | — | — | Currently not exposed via the SDK. |
| `Review` | — | — | Currently not exposed via the SDK. |
| `Shutdown` | — | — | Currently not exposed via the SDK. |
