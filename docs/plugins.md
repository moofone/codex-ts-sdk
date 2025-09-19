# Writing Plugins

Plugins extend `CodexClient` without modifying core behaviour. Implement the
`CodexPlugin` interface and register it via the constructor or
`client.registerPlugin()`.

```ts
import type { CodexPlugin } from 'codex-ts-sdk';

export const metricsPlugin: CodexPlugin = {
  name: 'metrics',
  initialize: ({ logger }) => logger?.info?.('metrics plugin ready'),
  afterEvent: async (event) => {
    if (event.msg.type === 'notification') {
      // ship telemetry
    }
  },
};
```

Plugins should avoid heavy synchronous work in hooks to keep the streaming
pipeline responsive.
