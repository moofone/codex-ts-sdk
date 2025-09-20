import { CodexClient } from './CodexClient';
import type { CodexClientConfig } from '../types/options';

export class CodexClientPool {
  private readonly idle: CodexClient[] = [];
  private readonly busy = new Set<CodexClient>();
  private readonly waiters: Array<{
    resolve: (client: CodexClient) => void;
    reject: (error: Error) => void;
  }> = [];
  private size = 0;

  constructor(private readonly config: CodexClientConfig, private readonly maxSize = 4) {}

  async acquire(): Promise<CodexClient> {
    const available = this.idle.pop();
    if (available) {
      this.busy.add(available);
      return available;
    }

    if (this.size < this.maxSize) {
      const client = new CodexClient({ ...this.config });
      this.size += 1;
      this.busy.add(client);
      return client;
    }

    return new Promise<CodexClient>((resolve, reject) => {
      this.waiters.push({
        resolve: (client) => {
          this.busy.add(client);
          resolve(client);
        },
        reject,
      });
    });
  }

  release(client: CodexClient): void {
    if (!this.busy.has(client)) {
      return;
    }

    this.busy.delete(client);
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(client);
      return;
    }

    this.idle.push(client);
  }

  async withClient<T>(callback: (client: CodexClient) => Promise<T>): Promise<T> {
    const client = await this.acquire();
    try {
      return await callback(client);
    } finally {
      this.release(client);
    }
  }

  async close(): Promise<void> {
    const closingError = new Error('CodexClientPool is closing');
    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(closingError);
    }
    const toClose = [...this.idle, ...this.busy];
    this.idle.length = 0;
    this.busy.clear();
    await Promise.allSettled(toClose.map((client) => client.close().catch(() => undefined)));
    this.size = 0;
  }
}
