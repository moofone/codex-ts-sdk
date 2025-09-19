import { CodexClient } from 'codex-ts-sdk';

async function main() {
  const client = new CodexClient({
    codexHome: process.env.CODEX_HOME,
  });

  try {
    await client.createConversation();

    const streamPromise = (async () => {
      for await (const event of client.events()) {
        if (event.msg.type === 'response_delta' && typeof event.msg.delta === 'string') {
          process.stdout.write(event.msg.delta);
        } else if (event.msg.type === 'response_completed') {
          const text = typeof event.msg.text === 'string' ? event.msg.text : undefined;
          if (text) {
            process.stdout.write(`\n\n[final]\n${text}\n`);
          }
          break;
        }
      }
    })();

    await client.sendUserTurn('Explain how Codex streaming works in two sentences.');
    await streamPromise;
  } finally {
    await client.close().catch((error) => {
      console.error('[codex] failed to close client', error);
    });
  }
}

main().catch((error) => {
  console.error('[codex] streaming example failed', error);
  process.exit(1);
});
