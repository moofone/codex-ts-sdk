# Examples

These scripts demonstrate a live connection to Codex using the native Node binding. They assume you have already:

1. Logged into the Codex CLI (for example `codex login --api-key sk-...` or `codex login` for the ChatGPT flow) so the runtime is populated under `~/.codex`.
2. Exported `CODEX_HOME` to that runtime directory, e.g.:

   ```bash
   export CODEX_HOME="$HOME/.codex"
   ```

3. Built this repository (`npm run setup` or `npm run build && npm run build:native`) so `dist/cjs/` and `native/codex-napi/index.node` exist.

## Available scripts

- `error-handling.js` – prints a short answer about error-handling practices and demonstrates per-error-class logging.
- `live-smoke.js` – tiny 1+1 sanity check that prints the first agent reply.

The SDK automatically discovers the freshly built `native/codex-napi` binding, so no additional environment configuration is required before running the examples.

Run any script with Node:

```bash
node examples/live-smoke.js
# or
node examples/error-handling.js
```

Set `CODEX_LOG_LEVEL=debug` if you want verbose runtime logging while the example runs.
