# Examples

These scripts demonstrate a live connection to Codex using the native Node binding. They assume you have already:

1. Logged into the Codex CLI (for example `codex login --api-key sk-...` or `codex login` for the ChatGPT flow) so the runtime is populated under `~/.codex`.
2. Exported `CODEX_HOME` to that runtime directory, e.g.:

   ```bash
   export CODEX_HOME="$HOME/.codex"
   ```

3. Built this repository (`npm run setup` or `npm run build && npm run build:native`) so `dist/cjs/` and `native/codex-napi/index.node` exist.

## Available scripts

### Core Examples
- `error-handling.js` – Prints a short answer about error-handling practices and demonstrates per-error-class logging.
- `live-smoke.js` – Tiny 1+1 sanity check that prints the first agent reply.

### Rate Limiting & Monitoring Examples
- `live-rate-limits.cjs` – Demonstrates real-time rate limit monitoring and tracking.
- `rate-limit-collector.cjs` – Collects rate limit data from conversations.
- `rate-limit-analyzer.cjs` – Analyzes collected rate limit data.
- `rate-limit-analyzer-simple.cjs` – Simplified rate limit analysis tool.
- `rate-limit-projection.cjs` – Projects future rate limit usage based on current patterns.

### Data Generation & Reporting
- `generate-realistic-data.cjs` – Generates realistic conversation data for testing.
- `generate-scenario-report.cjs` – Creates scenario-based reports from collected data.

The SDK automatically discovers the freshly built `native/codex-napi` binding, so no additional environment configuration is required before running the examples.

Run any script with Node:

```bash
# ES modules (.js)
node examples/live-smoke.js
node examples/error-handling.js

# CommonJS modules (.cjs)
node examples/live-rate-limits.cjs
node examples/rate-limit-collector.cjs
# etc...
```

Set `CODEX_LOG_LEVEL=debug` if you want verbose runtime logging while the example runs.
