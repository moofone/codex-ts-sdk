import { CodexClient } from 'codex-ts-sdk';

async function main() {
  const client = new CodexClient({
    codexHome: process.env.CODEX_HOME,
  });

  await client.createConversation();
  await client.sendUserTurn('Say hello in JSON format.', {
    summary: 'concise',
  });

  for await (const event of client.events()) {
    if (event.msg.type === 'notification') {
      console.log(event.msg);
      break;
    }
  }

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
