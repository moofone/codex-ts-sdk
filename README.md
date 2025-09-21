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
import { CodexClient } from 'codex-ts-sdk';

if (!process.env.CODEX_HOME) {
  throw new Error('Set CODEX_HOME to your Codex runtime (e.g. ~/.codex) before running this script.');
}

const client = new CodexClient({
  codexHome: process.env.CODEX_HOME,
});

await client.createConversation();
await client.sendUserTurn('What is 1 + 1?', {
  model: 'gpt-5-codex',
  effort: 'low',
});

for await (const event of client.events()) {
  if (event.msg.type === 'agent_message') {
    const message = event.msg.message;
    if (typeof message === 'string') {
      console.log(message);
    } else if (message && typeof message.text === 'string') {
      console.log(message.text);
    } else {
      console.log(JSON.stringify(message, null, 2));
    }
    break;
  }
}

await client.close();
```

Ensure `CODEX_HOME` is exported to the Codex runtime directory before running
the snippet (`~/.codex` for codex-cli installs, or `$CODEX_RUST_ROOT/codex-rs/target/release`
when you build locally).

By default the client uses a `workspace-write` sandbox (no network access) and
relies on Codex to request approval (`on-request`). Override those policies if
your deployment requires a different risk profile.

## CodexClient API

The `CodexClient` surface mirrors the Codex native protocol while providing
TypeScript-friendly ergonomics.

| Method | Summary |
| --- | --- |
| `connect()` | Loads the native module and establishes a Codex connection. Safe to call repeatedly; subsequent calls no-op once initialised. |
| `createConversation(options)` | Starts a new conversation session, closing any previous session before initialising a fresh handle. |
| `sendMessage(text, { images })` | Sends a plain text turn along with optional local image attachments using the lightweight `UserInput` op. |
| `sendUserTurn(text, options)` | Issues a full `UserTurn` op, allowing custom item payloads, sandbox and approval policies, and model overrides. Effort automatically resolves using registry defaults when not provided. |
| `interruptConversation()` | Emits the `Interrupt` op, signalling Codex to halt the current run. |
| `respondToExecApproval(id, decision)` | Approves or rejects an execution request via the `ExecApproval` op. |
| `respondToPatchApproval(id, decision)` | Approves or rejects a patch request via the `PatchApproval` op. |
| `events(signal?)` | Returns an async iterator of streamed Codex events. The iterator cleans up listeners when returned, thrown, or aborted via the optional signal. |
| `close()` | Gracefully shuts down the active session and event loop. Safe to call even when no session is active. |
| `testModelAvailability(model)` | Attempts to create a conversation with the supplied model, returning `true` on success and `false` when creation fails. |
| `registerPlugin(plugin)` | Adds a plugin at runtime. If the client is already initialised the plugin’s `initialize` hook is invoked immediately with automatic error logging. |

## Environment Setup

This SDK requires two components:
- **Codex runtime assets**: The Rust-based Codex runtime binaries (built from `codex-rs`)
- **Native Node.js binding**: The N-API module that connects Node.js to the Rust runtime (in `native/codex-napi` of this repo)

### Environment Variables

Pick exactly one installation option:

#### Installation Option 1 — Fresh install (codex-cli or prebuilt bundle)

1. Install and run `codex --version` once so the CLI unpacks the runtime into `~/.codex`.
2. Export (macOS/Linux):

```bash
export CODEX_TS_SDK_ROOT=/path/to/codex-ts-sdk
export CODEX_HOME=~/.codex
```

   Windows (PowerShell):
   ```powershell
   $env:CODEX_TS_SDK_ROOT = 'C:\path\to\codex-ts-sdk'
   $env:CODEX_HOME      = "$env:USERPROFILE\\.codex"
   ```

#### Installation Option 2 — Update `codex-rs` (local build)

⚠️ Updating `codex-rs` may require matching TypeScript SDK changes. After rebuilding, run the SDK tests and verify `getCodexCliVersion()` reports the expected version (see `tests/version.test.ts`).

1. Record your checkouts:

```bash
export CODEX_TS_SDK_ROOT=/path/to/codex-ts-sdk
export CODEX_RUST_ROOT=/path/to/codex
```

2. Build the runtime and point `CODEX_HOME` at Cargo's output:

   macOS / Linux:
   ```bash
   cd $CODEX_RUST_ROOT/codex-rs
   cargo build --release
   export CODEX_HOME=$CODEX_RUST_ROOT/codex-rs/target/release
   ```

   Windows (PowerShell):
   ```powershell
   Set-Location "$env:CODEX_RUST_ROOT\\codex-rs"
   cargo build --release
   $env:CODEX_HOME = "$env:CODEX_RUST_ROOT\\codex-rs\\target\\release"
   ```

3. Run `codex --version` to confirm the rebuilt runtime reports the expected version.
4. From the SDK, call `getCodexCliVersion()` (see `tests/version.test.ts`) to ensure the TS binding matches the rebuilt runtime. The helper throws if the native module is missing `cliVersion()`, signalling you need to rebuild the binding.

### Prerequisites

- Node.js >= 18 and npm (or pnpm/yarn)
- Rust toolchain installed via <https://www.rust-lang.org/tools/install> (use the default `stable` channel)
- Platform build tools (required by Cargo and `@napi-rs/cli` to compile the native binding):
  - **macOS** – Xcode Command Line Tools (`xcode-select --install`)
  - **Linux** – `build-essential`, `python3`, `pkg-config`, and OpenSSL headers
  - **Windows** – "Desktop development with C++" workload for Visual Studio Build Tools

For option B (custom `codex-rs` builds) you also need:
- Git to clone https://github.com/openai/codex
- zstd (to unpack CI artifacts if you grab prebuilt bundles from GitHub)

## Quick Setup

```bash
# After setting environment variables, in this SDK repository:
cd $CODEX_TS_SDK_ROOT
npm run setup
```

This setup script will:
1. Check for a Codex runtime directory at `$CODEX_HOME`
2. Install dependencies
3. Build the TypeScript SDK
4. Build the native N-API binding for your platform
5. Verify the setup

If `$CODEX_HOME` is empty, the script explains how to populate it:
- Run `codex --version` to let codex-cli unpack `~/.codex` (Installation Option 1).
- Or follow Installation Option 2 to rebuild `codex-rs` and point `CODEX_HOME` at `target/release`.

## Manual Setup Steps

### Installation Option 1: Fresh install (codex-cli or prebuilt bundle)

**macOS / Linux**
1. Install and run `codex --version` once so the CLI unpacks `$HOME/.codex`.
2. Export:

```bash
export CODEX_TS_SDK_ROOT=/path/to/codex-ts-sdk
export CODEX_HOME=~/.codex
```

**Windows (PowerShell)**
1. Install codex-cli and run `codex --version`. Runtime files land under `$env:USERPROFILE\.codex`.
2. Export:

```powershell
$env:CODEX_TS_SDK_ROOT = 'C:\path\to\codex-ts-sdk'
$env:CODEX_HOME      = "$env:USERPROFILE\\.codex"
```

Proceed to [Step 3](#step-3-build-the-sdk-and-its-native-binding).

### Installation Option 2: Update `codex-rs` (local build)

⚠️ Updating `codex-rs` may require matching TypeScript SDK changes. After rebuilding, run `npm run test` and confirm `getCodexCliVersion()` reports the expected runtime version (see `tests/version.test.ts`).

**macOS / Linux**
```bash
export CODEX_TS_SDK_ROOT=/path/to/codex-ts-sdk
export CODEX_RUST_ROOT=/path/to/codex
cd $CODEX_RUST_ROOT/codex-rs
cargo build --release
export CODEX_HOME=$CODEX_RUST_ROOT/codex-rs/target/release
```

**Windows (PowerShell)**
```powershell
$env:CODEX_TS_SDK_ROOT = 'C:\path\to\codex-ts-sdk'
$env:CODEX_RUST_ROOT   = 'C:\path\to\codex'
Set-Location "$env:CODEX_RUST_ROOT\\codex-rs"
cargo build --release
$env:CODEX_HOME = "$env:CODEX_RUST_ROOT\\codex-rs\\target\\release"
```

Run `codex --version` to confirm the rebuilt runtime reports the expected version.

### Step 3: Build the SDK and its native binding

**Important:** The `native/codex-napi` directory contains the Rust source code for the N-API binding. You MUST compile it for your platform.

##### Step 3a: Build TypeScript SDK (All Platforms)
```bash
cd $CODEX_TS_SDK_ROOT  # Or cd %CODEX_TS_SDK_ROOT% on Windows CMD

# Install dependencies
npm install

# Build the TypeScript SDK
npm run build
```

##### Step 3b: Build Native Binding (Platform-Specific)

The native binding MUST be built from source. This creates `native/codex-napi/index.node` for your platform.

**macOS/Linux:**
```bash
cd $CODEX_TS_SDK_ROOT
npm run build:native
# Verify: Should create native/codex-napi/index.node
ls -la native/codex-napi/index.node
```

**Windows (PowerShell - Recommended):**
```powershell
cd $env:CODEX_TS_SDK_ROOT

# REQUIRED: Set Cargo to use git CLI (fixes dependency fetching)
$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"

# Option 1: Use npm script
npm run build:native

# Option 2: Build manually if npm script fails
npx napi build --platform --manifest-path native/codex-napi/Cargo.toml --release --target x86_64-pc-windows-msvc

# Verify: Should create native\codex-napi\index.node
dir native\codex-napi\index.node
```

**Windows (Git Bash/WSL):**
```bash
cd $CODEX_TS_SDK_ROOT
export CARGO_NET_GIT_FETCH_WITH_CLI=true
npm run build:native
# Verify: Should create native/codex-napi/index.node
ls -la native/codex-napi/index.node
```

**Common Issues:**
- **"No crate found"**: Run from the repo root or pass `--manifest-path native/codex-napi/Cargo.toml`.
- **Windows build fails**: Must use "Developer PowerShell for VS" or "x64 Native Tools Command Prompt for VS"
- **"native/codex-napi not found"**: The repository is incomplete. Re-clone or ensure `native/` folder exists.
- **Git fetch errors**: On Windows, ensure `CARGO_NET_GIT_FETCH_WITH_CLI=true` is set.

</details>

### Configure the client

- Set `CODEX_HOME` environment variable to the Codex runtime directory (`~/.codex` when managed by codex-cli, or `$CODEX_RUST_ROOT/codex-rs/target/release` for local builds)
- Review sandbox and approval policies before connecting; the defaults allow workspace writes only and rely on Codex to request approvals
- If you built a custom N-API binary, provide its location via `nativeModulePath` when creating the client

## Examples

The scripts import the local CommonJS build from `dist/cjs`; run `npm run build` (or `npm run setup`) first so the compiled SDK is available.

- `examples/error-handling.js` – Demonstrates handling the structured `CodexError` hierarchy.
- `examples/live-smoke.js` – One-line 1 + 1 smoke check (logs reasoning and reply).

Environment variables used by the examples:

- `CODEX_HOME` (required) – path to your Codex runtime (e.g. `~/.codex` after `codex auth login chatgpt`)
- `CODEX_NATIVE_MODULE` (optional) – absolute path to a specific `index.node`. Each script sets this automatically to `native/codex-napi/index.node` when unset.
- `CODEX_LOG_LEVEL` (optional) – set to `debug` if you want verbose runtime logs while the example runs.

Run the examples after building the SDK and native binding:

```bash
npm run setup                 # or: npm run build && npm run build:native
export CODEX_HOME="$HOME/.codex"   # ensure `codex auth login chatgpt` has been run
node examples/live-smoke.js    # or any other script under examples/
```

## Configuration

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
- `npm run coverage` enforces the 100% global coverage thresholds configured in `vitest.config.ts`.
- `node examples/live-smoke.js` performs a real Codex round-trip (requires `codex auth login` and `CODEX_HOME`).

## Scripts

- `npm run build` – Compile ESM, CJS, and declaration outputs to `dist/`
- `npm run test` – Execute the Vitest suite (mocked runtime)
- `npm run coverage` – Run the suite with coverage reporting
- `npm run build:native` – Build platform binaries via `@napi-rs/cli`
- `npm run package` – Produce JS + native artefacts ready for publishing


## Native Module Internals

The TypeScript facade loads a Rust shared library owned by the `codex-napi` crate inside this repository. That crate depends on the [`codex-rs` workspace](https://github.com/openai/codex) and is compiled with `@napi-rs/cli`.

### Building with the pinned codex-rs revision

`npm run build:native` runs `npx napi build --platform --manifest-path native/codex-napi/Cargo.toml` under the hood. The command fetches the git revision declared in `native/codex-napi/Cargo.toml`, compiles it in release mode, and emits `native/codex-napi/index.node`. Use `npm run package` to copy that artefact into `native/codex-napi/prebuilt/<platform>-<arch>/` so it can be published to npm.

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

Set the `CODEX_HOME` environment variable (or pass `codexHome`) to the directory that contains the Codex runtime assets (`~/.codex` for codex-cli installs, or the Cargo `target/release` output when building locally). The SDK passes that path to the native runtime when loading the N-API binding.


## Binding Coverage

| Rust export | TypeScript usage | Tests hitting it | Notes |
| --- | --- | --- | --- |
| `NativeCodex::new` | `CodexClient.connect()` creates the binding (`src/client/CodexClient.ts:83`) | `tests/CodexClient.behavior.test.ts`, `tests/integration/CodexClient.integration.test.ts` | Fully wrapped; handles `~` expansion for `codexHome`. |
| `NativeCodex::create_conversation` | `CodexClient.createConversation()` (`src/client/CodexClient.ts:117`) | `tests/CodexClient.behavior.test.ts`, `tests/integration/CodexClient.integration.test.ts` | Streams the initial `session_configured` event emitted by Rust. |
| `CodexSession::next_event / submit / close` | Event loop + submission helpers in `CodexClient` (`src/client/CodexClient.ts:146-213`) | `tests/CodexClient.behavior.test.ts`, `tests/integration/CodexClient.integration.test.ts` | Core flow covered, including interrupts, approvals, and iterator cleanup behaviours. |
| `version()` | Not exposed in the SDK | — | Available in the binding; surface later if we need runtime version info. |

### Protocol Operations

| Rust `Op` variant (`codex-rs/protocol/src/protocol.rs:53-175`) | Client support | Tests | Status |
| --- | --- | --- | --- |
| `Interrupt` | `CodexClient.interruptConversation()` → `createInterruptSubmission()` (`src/client/CodexClient.ts:187`) | `tests/CodexClient.behavior.test.ts` | Covered. |
| `UserInput` | `CodexClient.sendMessage()` → `createUserInputSubmission()` (`src/client/CodexClient.ts:142`) | `tests/CodexClient.behavior.test.ts` | Covered. |
| `UserTurn` | `CodexClient.sendUserTurn()` → `createUserTurnSubmission()` (`src/client/CodexClient.ts:160`) | `tests/CodexClient.behavior.test.ts`, `tests/integration/CodexClient.integration.test.ts` | Covered. |
| `ExecApproval` | `CodexClient.respondToExecApproval()` (`src/client/CodexClient.ts:194`) | `tests/CodexClient.behavior.test.ts`, `tests/integration/CodexClient.integration.test.ts` | Covered. |
| `PatchApproval` | `CodexClient.respondToPatchApproval()` (`src/client/CodexClient.ts:205`) | `tests/CodexClient.behavior.test.ts`, `tests/integration/CodexClient.integration.test.ts` | Covered. |
| `OverrideTurnContext` | `CodexClient.overrideTurnContext()` → `createOverrideTurnContextSubmission()` (`src/client/CodexClient.ts:216`) | `tests/CodexClient.test.ts` | Covered. |
| `AddToHistory` | `CodexClient.addToHistory()` → `createAddToHistorySubmission()` (`src/client/CodexClient.ts:279`) | `tests/CodexClient.test.ts` | Covered. |
| `GetHistoryEntryRequest` | `CodexClient.getHistoryEntry()` → `createGetHistoryEntryRequestSubmission()` (`src/client/CodexClient.ts:296`) | `tests/CodexClient.test.ts` | Covered. |
| `GetPath` | `CodexClient.getPath()` → `createGetPathSubmission()` (`src/client/CodexClient.ts:320`) | `tests/CodexClient.test.ts` | Covered. |
| `ListMcpTools` | `CodexClient.listMcpTools()` → `createListMcpToolsSubmission()` (`src/client/CodexClient.ts:304`) | `tests/CodexClient.test.ts` | Covered. |
| `ListCustomPrompts` | `CodexClient.listCustomPrompts()` → `createListCustomPromptsSubmission()` (`src/client/CodexClient.ts:308`) | `tests/CodexClient.test.ts` | Covered. |
| `Compact` | `CodexClient.compact()` → `createCompactSubmission()` (`src/client/CodexClient.ts:312`) | `tests/CodexClient.test.ts` | Covered. |
| `Review` | `CodexClient.review()` → `createReviewSubmission()` (`src/client/CodexClient.ts:316`) | `tests/CodexClient.test.ts` | Covered. |
| `Shutdown` | `CodexClient.shutdown()` → `createShutdownSubmission()` (`src/client/CodexClient.ts:324`) | `tests/CodexClient.test.ts` | Covered. |
