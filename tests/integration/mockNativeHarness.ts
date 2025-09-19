import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { SubmissionEnvelope } from '../../src/internal/submissions';
import type { CodexEvent } from '../../src/types/events';

type GlobalWithState = typeof globalThis & {
  __CODEX_NATIVE_INTEGRATION_STATE__?: MockNativeState;
};

export interface MockSessionController {
  conversationId: string;
  enqueue(event: CodexEvent): void;
  end(): void;
}

export interface MockNativeBehavior {
  initialEvents?: CodexEvent[];
  onCreateConversation?: (session: MockSessionController) => void | Promise<void>;
  onSubmit?: (submission: SubmissionEnvelope, session: MockSessionController) => void | Promise<void>;
}

interface MockNativeState {
  behavior: MockNativeBehavior;
  submissions: SubmissionEnvelope[];
  options: unknown;
}

function getState(): MockNativeState {
  const globalAny = globalThis as GlobalWithState;
  if (!globalAny.__CODEX_NATIVE_INTEGRATION_STATE__) {
    globalAny.__CODEX_NATIVE_INTEGRATION_STATE__ = {
      behavior: {},
      submissions: [],
      options: undefined,
    };
  }
  return globalAny.__CODEX_NATIVE_INTEGRATION_STATE__ as MockNativeState;
}

export function configureMockNative(behavior: MockNativeBehavior): void {
  const state = getState();
  state.behavior = behavior;
  state.submissions = [];
}

export function resetMockNative(): void {
  const state = getState();
  state.behavior = {};
  state.submissions = [];
  state.options = undefined;
  eventCounter = 0;
}

export function getRecordedSubmissions(): SubmissionEnvelope[] {
  return [...getState().submissions];
}

export function getMockModulePath(): string {
  const here = fileURLToPath(import.meta.url);
  const dir = path.dirname(here);
  return path.join(dir, 'fixtures', 'mock-native-module.cjs');
}

export function getLastNativeOptions(): unknown {
  return getState().options;
}

let eventCounter = 0;
export function createMockEvent<T extends Record<string, unknown>>(
  type: string,
  extra: T = {} as T,
): CodexEvent {
  eventCounter += 1;
  return {
    id: `evt-${eventCounter}`,
    msg: {
      type,
      ...extra,
    },
  };
}
