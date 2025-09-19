const GLOBAL_KEY = '__CODEX_NATIVE_INTEGRATION_STATE__';

function getState() {
  const globalAny = globalThis;
  if (!globalAny[GLOBAL_KEY]) {
    globalAny[GLOBAL_KEY] = {
      behavior: {},
      submissions: [],
      options: undefined,
    };
  }
  return globalAny[GLOBAL_KEY];
}

let sessionCounter = 0;

class MockSession {
  constructor() {
    this.conversationId = `mock-conversation-${++sessionCounter}`;
    this._queue = [];
    this._waiters = [];
    this._ended = false;

    const state = getState();
    const behavior = state.behavior ?? {};
    if (Array.isArray(behavior.initialEvents)) {
      for (const event of behavior.initialEvents) {
        this.enqueue(event);
      }
    }
  }

  enqueue(event) {
    if (!event || typeof event !== 'object') {
      throw new Error('MockSession.enqueue expects an event object');
    }
    const payload = JSON.stringify(event);
    if (this._waiters.length > 0) {
      const resolve = this._waiters.shift();
      resolve(payload);
    } else {
      this._queue.push(payload);
    }
  }

  end() {
    if (this._ended) {
      return;
    }
    this._ended = true;
    if (this._waiters.length > 0) {
      const resolve = this._waiters.shift();
      resolve(null);
    } else {
      this._queue.push(null);
    }
  }

  async nextEvent() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      if (next === null) {
        this._ended = true;
        return null;
      }
      return next;
    }

    if (this._ended) {
      return null;
    }

    return new Promise((resolve) => {
      this._waiters.push(resolve);
    });
  }

  async submit(submissionJson) {
    const state = getState();
    const envelope = JSON.parse(submissionJson);
    state.submissions.push(envelope);

    const behavior = state.behavior ?? {};
    if (typeof behavior.onSubmit === 'function') {
      await behavior.onSubmit(envelope, this._controller());
    }
  }

  _controller() {
    return {
      conversationId: this.conversationId,
      enqueue: (event) => this.enqueue(event),
      end: () => this.end(),
    };
  }

  async close() {
    this._ended = true;
    this._queue.length = 0;
    while (this._waiters.length > 0) {
      const resolve = this._waiters.shift();
      resolve(null);
    }
  }
}

class NativeCodex {
  constructor(options) {
    getState().options = options;
  }

  async createConversation() {
    const state = getState();
    const session = new MockSession();
    const behavior = state.behavior ?? {};
    if (typeof behavior.onCreateConversation === 'function') {
      await behavior.onCreateConversation({
        conversationId: session.conversationId,
        enqueue: (event) => session.enqueue(event),
        end: () => session.end(),
      });
    }
    return session;
  }

  getAuthMode() {
    return 'mock';
  }
}

module.exports = {
  NativeCodex,
  version() {
    return 'mock-version';
  },
};
