export declare class AsyncEventQueue<T> {
    private readonly values;
    private readonly waiters;
    private closed;
    private failure;
    enqueue(value: T): void;
    fail(error: unknown): void;
    close(): void;
    next(): Promise<IteratorResult<T>>;
}
