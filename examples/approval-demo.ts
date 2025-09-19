import { CodexClient } from 'codex-ts-sdk';

async function main() {
  const client = new CodexClient({
    codexHome: process.env.CODEX_HOME,
  });

  const streamPromise = (async () => {
    for await (const event of client.events()) {
      if (event.msg.type === 'exec_approval_request') {
        const id = typeof event.msg.id === 'string' ? event.msg.id : undefined;
        if (id) {
          console.log(`[codex] auto-approving exec request`, event.msg);
          await client.respondToExecApproval(id, 'approve');
        }
      } else if (event.msg.type === 'apply_patch_approval_request') {
        const id = typeof event.msg.id === 'string' ? event.msg.id : undefined;
        if (id) {
          console.log(`[codex] auto-approving patch request`, event.msg);
          await client.respondToPatchApproval(id, 'approve');
        }
      } else if (event.msg.type === 'response_completed') {
        console.log('[codex] conversation complete');
        break;
      }
    }
  })();

  try {
    await client.createConversation();
    await client.sendUserTurn('List the files in the current directory.');
    await streamPromise;
  } finally {
    await client.close().catch((error) => {
      console.error('[codex] failed to close client', error);
    });
  }
}

main().catch((error) => {
  console.error('[codex] approval demo failed', error);
  process.exit(1);
});
