import { fileURLToPath } from 'url';

const nativeModulePath = fileURLToPath(new URL('../native/codex-napi/index.node', import.meta.url));
if (!process.env.CODEX_NATIVE_MODULE) {
  process.env.CODEX_NATIVE_MODULE = nativeModulePath;
}

const { CodexClient } = await import(new URL('../dist/cjs/src/index.js', import.meta.url));

async function main() {
  if (!process.env.CODEX_HOME) {
    console.error('Set CODEX_HOME to your Codex runtime (e.g. ~/.codex) before running this script.');
    process.exit(1);
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
}

main().catch((error) => {
  console.error('live smoke test failed:', error);
  process.exit(1);
});
