import {
  CodexAuthError,
  CodexClient,
  CodexConnectionError,
  CodexError,
  CodexSessionError,
} from 'codex-ts-sdk';

async function main() {
  const client = new CodexClient({
    codexHome: process.env.CODEX_HOME,
    retryPolicy: { maxRetries: 2, initialDelayMs: 1000 },
  });

  try {
    await client.createConversation();
    await client.sendUserTurn('Describe robust error handling strategies.');

    for await (const event of client.events()) {
      if (event.msg.type === 'response_completed') {
        console.log('[codex] response completed');
        break;
      }
    }
  } catch (error) {
    if (error instanceof CodexAuthError) {
      console.error('[codex] authentication failed — verify credentials', error);
    } else if (error instanceof CodexConnectionError) {
      console.error('[codex] unable to reach Codex runtime', error);
    } else if (error instanceof CodexSessionError) {
      console.error('[codex] session error', error);
    } else if (error instanceof CodexError) {
      console.error('[codex] generic Codex error', error);
    } else {
      console.error('[codex] unexpected error', error);
    }
    process.exitCode = 1;
  } finally {
    await client.close().catch((closeError) => {
      console.error('[codex] failed to close client', closeError);
    });
  }
}

main().catch((error) => {
  console.error('[codex] fatal error', error);
  process.exit(1);
});
