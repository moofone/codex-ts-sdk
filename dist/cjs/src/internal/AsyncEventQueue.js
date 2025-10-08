"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncEventQueue = void 0;
class AsyncEventQueue {
    values = [];
    waiters = [];
    closed = false;
    failure;
    enqueue(value) {
        if (this.closed || this.failure) {
            return;
        }
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter.resolve({ value, done: false });
            return;
        }
        this.values.push(value);
    }
    fail(error) {
        if (this.closed || this.failure) {
            return;
        }
        this.failure = error;
        while (this.waiters.length > 0) {
            const waiter = this.waiters.shift();
            waiter?.reject(error);
        }
    }
    close() {
        if (this.closed || this.failure) {
            return;
        }
        this.closed = true;
        while (this.waiters.length > 0) {
            const waiter = this.waiters.shift();
            waiter?.resolve({ value: undefined, done: true });
        }
    }
    async next() {
        if (this.values.length > 0) {
            return { value: this.values.shift(), done: false };
        }
        if (this.failure) {
            if (this.failure instanceof Error) {
                throw this.failure;
            }
            throw new Error('Async event queue failed', { cause: this.failure });
        }
        if (this.closed) {
            return { value: undefined, done: true };
        }
        return new Promise((resolve, reject) => {
            this.waiters.push({ resolve, reject });
        });
    }
}
exports.AsyncEventQueue = AsyncEventQueue;
