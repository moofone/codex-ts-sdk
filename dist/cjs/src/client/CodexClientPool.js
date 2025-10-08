"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexClientPool = void 0;
const CodexClient_1 = require("./CodexClient");
class CodexClientPool {
    config;
    maxSize;
    idle = [];
    busy = new Set();
    waiters = [];
    size = 0;
    constructor(config, maxSize = 4) {
        this.config = config;
        this.maxSize = maxSize;
    }
    async acquire() {
        const available = this.idle.pop();
        if (available) {
            this.busy.add(available);
            return available;
        }
        if (this.size < this.maxSize) {
            const client = new CodexClient_1.CodexClient({ ...this.config });
            this.size += 1;
            this.busy.add(client);
            return client;
        }
        return new Promise((resolve, reject) => {
            this.waiters.push({
                resolve: (client) => {
                    this.busy.add(client);
                    resolve(client);
                },
                reject,
            });
        });
    }
    release(client) {
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
    async withClient(callback) {
        const client = await this.acquire();
        try {
            return await callback(client);
        }
        finally {
            this.release(client);
        }
    }
    async close() {
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
exports.CodexClientPool = CodexClientPool;
