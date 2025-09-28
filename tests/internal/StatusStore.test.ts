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

  it('handles edge case time windows correctly', () => {
    const store = new StatusStore();

    // Test undefined window minutes (should default to 5h)
    const eventWithUndefinedWindow: TokenCountEventMessage = {
      type: 'token_count',
      rate_limits: {
        primary: {
          used_percent: 50,
          window_minutes: undefined as any,
          resets_in_seconds: 3600,
        },
        secondary: {
          used_percent: 30,
          window_minutes: undefined as any,
          resets_in_seconds: 86400,
        },
      },
      info: {
        total_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 0,
          output_tokens: 50,
          reasoning_output_tokens: 0,
          total_tokens: 150,
        },
        last_token_usage: {
          input_tokens: 10,
          cached_input_tokens: 0,
          output_tokens: 5,
          reasoning_output_tokens: 0,
          total_tokens: 15,
        },
        model_context_window: 32000,
      },
    };

    store.updateFromTokenCountEvent(eventWithUndefinedWindow);
    const status = store.getStatus();

    // Should use default values when window_minutes is undefined
    expect(status.rate_limits.primary).toBeDefined();
    expect(status.rate_limits.secondary).toBeDefined();
    // The window_minutes being undefined should still result in valid rate limits
    expect(status.rate_limit_windows?.primary?.short_label).toBe('5h');
    expect(status.rate_limit_windows?.secondary?.short_label).toBe('5h');
  });

  it('handles monthly and annual time windows', () => {
    const store = new StatusStore();

    // Test monthly window (30 days + small bias)
    const monthlyEvent: TokenCountEventMessage = {
      type: 'token_count',
      rate_limits: {
        primary: {
          used_percent: 25,
          window_minutes: 30 * 24 * 60, // 30 days
          resets_in_seconds: 30 * 24 * 3600,
        },
        secondary: {
          used_percent: 15,
          window_minutes: 30 * 24 * 60 + 2, // Just under the 30 day + 3 minute threshold
          resets_in_seconds: 30 * 24 * 3600,
        },
      },
      info: {
        total_token_usage: {
          input_tokens: 1000,
          cached_input_tokens: 100,
          output_tokens: 500,
          reasoning_output_tokens: 50,
          total_tokens: 1650,
        },
        last_token_usage: {
          input_tokens: 50,
          cached_input_tokens: 5,
          output_tokens: 25,
          reasoning_output_tokens: 2,
          total_tokens: 82,
        },
        model_context_window: 128000,
      },
    };

    store.updateFromTokenCountEvent(monthlyEvent);
    let status = store.getStatus();
    expect(status.rate_limit_windows?.primary?.label).toBe('Monthly limit');
    expect(status.rate_limit_windows?.secondary?.label).toBe('Monthly limit');

    // Test annual window (365 days)
    const annualEvent: TokenCountEventMessage = {
      type: 'token_count',
      rate_limits: {
        primary: {
          used_percent: 10,
          window_minutes: 365 * 24 * 60, // 365 days
          resets_in_seconds: 365 * 24 * 3600,
        },
        secondary: {
          used_percent: 5,
          window_minutes: 400 * 24 * 60, // More than a year
          resets_in_seconds: 400 * 24 * 3600,
        },
      },
      info: {
        total_token_usage: {
          input_tokens: 10000,
          cached_input_tokens: 1000,
          output_tokens: 5000,
          reasoning_output_tokens: 500,
          total_tokens: 16500,
        },
        last_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 10,
          output_tokens: 50,
          reasoning_output_tokens: 5,
          total_tokens: 165,
        },
        model_context_window: 256000,
      },
    };

    store.updateFromTokenCountEvent(annualEvent);
    status = store.getStatus();
    expect(status.rate_limit_windows?.primary?.label).toBe('Annual limit');
    expect(status.rate_limit_windows?.secondary?.label).toBe('Annual limit');
  });

  it('handles edge case for window label capitalization', () => {
    const store = new StatusStore();

    // Test with numeric window (hours)
    const numericWindowEvent: TokenCountEventMessage = {
      type: 'token_count',
      rate_limits: {
        primary: {
          used_percent: 35,
          window_minutes: 120, // 2 hours
          resets_in_seconds: 7200,
        },
        secondary: {
          used_percent: 20,
          window_minutes: 180, // 3 hours
          resets_in_seconds: 10800,
        },
      },
      info: {
        total_token_usage: {
          input_tokens: 200,
          cached_input_tokens: 20,
          output_tokens: 100,
          reasoning_output_tokens: 10,
          total_tokens: 330,
        },
        last_token_usage: {
          input_tokens: 20,
          cached_input_tokens: 2,
          output_tokens: 10,
          reasoning_output_tokens: 1,
          total_tokens: 33,
        },
        model_context_window: 64000,
      },
    };

    store.updateFromTokenCountEvent(numericWindowEvent);
    const status = store.getStatus();

    // Numeric labels like "2h" should not be capitalized
    expect(status.rate_limit_windows?.primary?.short_label).toBe('2h');
    expect(status.rate_limit_windows?.secondary?.short_label).toBe('3h');

    // Test with weekly window (should be capitalized)
    const weeklyEvent: TokenCountEventMessage = {
      type: 'token_count',
      rate_limits: {
        primary: {
          used_percent: 45,
          window_minutes: 7 * 24 * 60, // 1 week
          resets_in_seconds: 7 * 24 * 3600,
        },
        secondary: {
          used_percent: 30,
          window_minutes: 7 * 24 * 60 + 2, // Just under the weekly + 3 minute threshold
          resets_in_seconds: 7 * 24 * 3600,
        },
      },
      info: {
        total_token_usage: {
          input_tokens: 500,
          cached_input_tokens: 50,
          output_tokens: 250,
          reasoning_output_tokens: 25,
          total_tokens: 825,
        },
        last_token_usage: {
          input_tokens: 25,
          cached_input_tokens: 2,
          output_tokens: 12,
          reasoning_output_tokens: 1,
          total_tokens: 40,
        },
        model_context_window: 128000,
      },
    };

    store.updateFromTokenCountEvent(weeklyEvent);
    const weeklyStatus = store.getStatus();
    expect(weeklyStatus.rate_limit_windows?.primary?.label).toBe('Weekly limit');
    expect(weeklyStatus.rate_limit_windows?.secondary?.label).toBe('Weekly limit');
  });
});
