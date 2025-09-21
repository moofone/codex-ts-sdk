# Getting Started

1. Install the package: `npm install codex-ts-sdk`
2. Ensure Codex native assets are available on disk (see `native/README.md`).
3. Instantiate the client with an explicit configuration:

```ts
import { CodexClient } from 'codex-ts-sdk';

const client = new CodexClient({
  codexHome: process.env.CODEX_HOME,
  sandboxPolicy: {
    mode: 'workspace-write',
    network_access: false,
  },
  approvalPolicy: 'on-request',
});
```

4. Call `createConversation()` before streaming events.

Refer to `examples/error-handling.js` for a full end-to-end example. Run `npm run setup` (or `npm run build` followed by `npm run build:native`) so `dist/cjs` and `native/codex-napi/index.node` exist before running `node examples/...`.

Environment variables:

- `CODEX_HOME` – required; points to the Codex runtime (`~/.codex` after `codex auth login chatgpt`).
- `CODEX_NATIVE_MODULE` – optional; override the native binding path. Defaults to the repository build when unset.
- `CODEX_LOG_LEVEL` – optional; set to `debug` to mirror the runtime’s streaming logs.
