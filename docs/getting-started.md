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

Refer to `examples/basic-chat.ts` for a full end-to-end example.
