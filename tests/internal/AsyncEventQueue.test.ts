import { describe, expect, it } from 'vitest';
import { AsyncEventQueue } from '../../src/internal/AsyncEventQueue';

describe('AsyncEventQueue', () => {
  it('yields enqueued values to awaiting consumers', async () => {
    const queue = new AsyncEventQueue<number>();
    const nextPromise = queue.next();
    queue.enqueue(42);
    const result = await nextPromise;
    expect(result).toEqual({ value: 42, done: false });
  });

  it('buffers values when no consumer awaits', async () => {
    const queue = new AsyncEventQueue<string>();
    queue.enqueue('first');
    queue.enqueue('second');
    expect(await queue.next()).toEqual({ value: 'first', done: false });
    expect(await queue.next()).toEqual({ value: 'second', done: false });
  });

  it('signals completion when closed', async () => {
    const queue = new AsyncEventQueue<void>();
    const nextPromise = queue.next();
    queue.close();
    expect(await nextPromise).toEqual({ value: undefined, done: true });
    expect(await queue.next()).toEqual({ value: undefined, done: true });
    queue.enqueue(undefined);
  });

  it('rejects pending consumers when failed', async () => {
    const queue = new AsyncEventQueue<number>();
    const error = new Error('boom');
    queue.fail(error);
    const pending = queue.next();
    queue.enqueue(1);
    await expect(pending).rejects.toThrow('boom');
    await expect(queue.next()).rejects.toThrow('boom');
  });

  it('wraps non-error failures in Error instances', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.fail('failure');
    await expect(queue.next()).rejects.toThrow('Async event queue failed');
  });

  it('ignores close operations after failure', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.fail(new Error('fail')); // sets failure flag
    queue.close();
    await expect(queue.next()).rejects.toThrow('fail');
  });

  it('ignores repeated failures and enqueue attempts once closed', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.close();
    queue.enqueue(123);
    queue.fail(new Error('unused'));
    queue.fail(new Error('second'));
    expect(await queue.next()).toEqual({ value: undefined, done: true });
  });
});
