import { describe, expect, it, vi } from 'vitest';
import { StatusStore } from '../../src/internal/StatusStore';
import type {
  SessionConfiguredEventMessage,
  TaskCompleteEventMessage,
  TaskStartedEventMessage,
  TokenCountEventMessage,
} from '../../src/types/events';

function createTokenCountEvent(): TokenCountEventMessage {
  return {
    type: 'token_count',
    rate_limits: {
      primary: {
        used_percent: 42.5,
        window_minutes: 300,
        resets_in_seconds: 900,
      },
      secondary: {
        used_percent: 61,
        window_minutes: 7 * 24 * 60,
        resets_in_seconds: 86_400,
      },
    },
    info: {
      total_token_usage: {
        input_tokens: 100,
        cached_input_tokens: 10,
        output_tokens: 90,
        reasoning_output_tokens: 0,
        total_tokens: 200,
      },
      last_token_usage: {
        input_tokens: 20,
        cached_input_tokens: 0,
        output_tokens: 15,
        reasoning_output_tokens: 0,
        total_tokens: 35,
      },
      model_context_window: 32000,
    },
  };
}

function createSessionConfiguredEvent(): SessionConfiguredEventMessage {
  return {
    type: 'session_configured',
    session_id: 'abc-123',
    model: 'gpt-5-codex',
    reasoning_effort: 'medium',
    history_log_id: 1,
    history_entry_count: 0,
    rollout_path: '/tmp/rollout.json',
  };
}

function createTaskStartedEvent(): TaskStartedEventMessage {
  return {
    type: 'task_started',
    model_context_window: 272_000,
  };
}

function createTaskCompleteEvent(): TaskCompleteEventMessage {
  return {
    type: 'task_complete',
    last_agent_message: '1 + 1 = 2.',
  };
}

describe('StatusStore', () => {
  it('stores rate limits and usage from token count events', () => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00Z') });
    try {
      const store = new StatusStore();
      const event = createTokenCountEvent();

      store.updateFromTokenCountEvent(event);
      const status = store.getStatus();

      expect(status.rate_limits).toEqual(event.rate_limits);
      expect(status.usage).toEqual(event.info);
      expect(status.last_updated).toBeInstanceOf(Date);
      expect(status.rate_limit_windows?.primary?.short_label).toBe('5h');
      expect(status.rate_limit_windows?.primary?.label).toBe('5h limit');
      expect(status.rate_limit_windows?.primary?.resets_at).toEqual(new Date('2024-01-01T00:15:00.000Z'));
      expect(status.rate_limit_windows?.secondary?.short_label).toBe('weekly');
      expect(status.rate_limit_windows?.secondary?.label).toBe('Weekly limit');
      expect(status.rate_limit_windows?.secondary?.resets_at).toEqual(new Date('2024-01-02T00:00:00.000Z'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('stores session metadata from configuration events', () => {
    const store = new StatusStore();
    const sessionEvent = createSessionConfiguredEvent();

    store.updateSessionInfo(sessionEvent);
    const status = store.getStatus();

    expect(status.session_id).toBe('abc-123');
    expect(status.model).toBe('gpt-5-codex');
    expect(status.reasoning_effort).toBe('medium');
    expect(status.history_log_id).toBe(1);
    expect(status.history_entry_count).toBe(0);
    expect(status.rollout_path).toBe('/tmp/rollout.json');
  });

  it('clears all stored state when clear is called', () => {
    const store = new StatusStore();
    store.updateSessionInfo(createSessionConfiguredEvent());
    store.updateFromTokenCountEvent(createTokenCountEvent());
    store.updateFromTaskStartedEvent(createTaskStartedEvent());
    store.updateFromTaskCompleteEvent(createTaskCompleteEvent());

    store.clear();
    const status = store.getStatus();

    expect(status.rate_limits).toBeUndefined();
    expect(status.rate_limit_windows).toBeUndefined();
    expect(status.usage).toBeUndefined();
    expect(status.session_id).toBeUndefined();
    expect(status.last_updated).toBeUndefined();
    expect(status.history_log_id).toBeUndefined();
    expect(status.last_agent_message).toBeUndefined();
    expect(status.model_context_window).toBeUndefined();
  });

  it('returns defensive copies of stored data', () => {
    const store = new StatusStore();
    store.updateSessionInfo(createSessionConfiguredEvent());
    store.updateFromTokenCountEvent(createTokenCountEvent());

    const snapshot = store.getStatus();
    snapshot.rate_limits!.primary!.used_percent = 1;
    snapshot.usage!.total_token_usage.input_tokens = 1;
    snapshot.rate_limit_windows!.primary!.used_percent = 1;

    const nextSnapshot = store.getStatus();
    expect(nextSnapshot.rate_limits!.primary!.used_percent).toBe(42.5);
    expect(nextSnapshot.usage!.total_token_usage.input_tokens).toBe(100);
    expect(nextSnapshot.rate_limit_windows!.primary!.used_percent).toBe(42.5);
  });

  it('records model context windows from task started events', () => {
    const store = new StatusStore();
    store.updateFromTaskStartedEvent(createTaskStartedEvent());

    const status = store.getStatus();
    expect(status.model_context_window).toBe(272_000);
  });

  it('records last agent message from task complete events', () => {
    const store = new StatusStore();
    store.updateFromTaskCompleteEvent(createTaskCompleteEvent());

    const status = store.getStatus();
    expect(status.last_agent_message).toBe('1 + 1 = 2.');
  });
});
