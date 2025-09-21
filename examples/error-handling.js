import { fileURLToPath } from 'url';

const nativeModulePath = fileURLToPath(new URL('../native/codex-napi/index.node', import.meta.url));
if (!process.env.CODEX_NATIVE_MODULE) {
  process.env.CODEX_NATIVE_MODULE = nativeModulePath;
}

const {
  CodexClient,
  CodexAuthError,
  CodexConnectionError,
  CodexError,
  CodexSessionError,
} = await import(new URL('../dist/cjs/src/index.js', import.meta.url));
import { describeAgentMessage, describeReasoning } from './_utils/event-print.js';

async function main() {
  if (!process.env.CODEX_HOME) {
    console.error('Set CODEX_HOME to your Codex runtime (e.g. ~/.codex) before running this script.');
    process.exit(1);
    return;
  }

  const client = new CodexClient({
    codexHome: process.env.CODEX_HOME,
    retryPolicy: { maxRetries: 2, initialDelayMs: 1000 },
  });

  try {
    console.log('[codex] creating conversation…');
    await client.createConversation();
    console.log('[codex] sending request…');
    await client.sendUserTurn('Describe robust error handling strategies.', {
      model: 'gpt-5-codex',
      effort: 'low',
    });

    let finished = false;
    for await (const event of client.events()) {
      switch (event.msg.type) {
        case 'agent_reasoning_delta':
        case 'agent_reasoning': {
          const chunk = describeReasoning(event);
          if (chunk) {
            console.log('[codex] reasoning:', chunk);
          }
          break;
        }
        case 'agent_message': {
          const text = describeAgentMessage(event) ?? '(no text payload)';
          console.log('[codex] answer:\n' + text);
          finished = true;
          break;
        }
        case 'response_completed':
        case 'task_complete': {
          console.log('[codex] conversation complete');
          finished = true;
          break;
        }
        default:
          break;
      }

      if (finished) {
        break;
      }
    }
  } catch (error) {
    if (error instanceof CodexAuthError) {
      console.error('authentication failed — verify credentials', error);
    } else if (error instanceof CodexConnectionError) {
      console.error('unable to reach Codex runtime', error);
    } else if (error instanceof CodexSessionError) {
      console.error('session error', error);
    } else if (error instanceof CodexError) {
      console.error('generic Codex error', error);
    } else {
      console.error('unexpected error', error);
    }
    process.exitCode = 1;
  } finally {
    await client.close().catch((closeError) => {
      console.error('[codex] failed to close client', closeError);
    });
  }
}

main().catch((error) => {
  console.error('fatal error', error);
  process.exit(1);
});
