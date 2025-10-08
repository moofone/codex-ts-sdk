import { CloudTasksClient } from './CloudTasksClient';
/**
 * Fluent builder for constructing CloudTasksClient instances.
 *
 * Defaults match codex-rs 0.45.0+:
 * - `baseUrl` defaults to `process.env.CODEX_CLOUD_TASKS_BASE_URL`
 *   or `https://chatgpt.com/backend-api` when unset.
 * - `mock` defaults from `process.env.CODEX_CLOUD_TASKS_MODE=mock` when not provided.
 *
 * @example
 * ```typescript
 * const client = new CloudTasksClientBuilder()
 *   // .withBaseUrl('https://chatgpt.com/backend-api') // optional; default applied
 *   .withBearerToken(process.env.OPENAI_API_KEY!)
 *   .withUserAgent('my-app/1.0.0')
 *   .build();
 * ```
 */
export class CloudTasksClientBuilder {
    options = {};
    /**
     * Set the base URL for the cloud tasks API.
     *
     * If omitted in `build()`, defaults to `process.env.CODEX_CLOUD_TASKS_BASE_URL`
     * or `https://chatgpt.com/backend-api`.
     *
     * @param baseUrl - API base URL (e.g., 'https://chatgpt.com/backend-api')
     * @returns This builder instance for chaining
     */
    withBaseUrl(baseUrl) {
        this.options.baseUrl = baseUrl;
        return this;
    }
    /**
     * Set the bearer token for API authentication.
     *
     * Mutually exclusive with `withChatGptAccountId()`.
     *
     * @param token - Bearer token (e.g., from OPENAI_API_KEY)
     * @returns This builder instance for chaining
     */
    withBearerToken(token) {
        this.options.bearerToken = token;
        return this;
    }
    /**
     * Set the ChatGPT account ID for authentication.
     *
     * Mutually exclusive with `withBearerToken()`.
     *
     * @param id - ChatGPT account identifier
     * @returns This builder instance for chaining
     */
    withChatGptAccountId(id) {
        this.options.chatGptAccountId = id;
        return this;
    }
    /**
     * Set a custom user agent string for API requests.
     *
     * @param ua - User agent string (e.g., 'my-app/1.0.0')
     * @returns This builder instance for chaining
     */
    withUserAgent(ua) {
        this.options.userAgent = ua;
        return this;
    }
    /**
     * Enable mock backend for testing (no actual API calls).
     *
     * @param mock - Enable mock mode (default: true)
     * @returns This builder instance for chaining
     */
    withMockBackend(mock = true) {
        this.options.mock = mock;
        return this;
    }
    /**
     * Build and return the CloudTasksClient instance.
     *
     * @returns Configured CloudTasksClient
     *
     * @example
     * ```typescript
     * const client = new CloudTasksClientBuilder()
     *   // .withBaseUrl('https://chatgpt.com/backend-api')
     *   .build();
     * ```
     */
    build() {
        const baseUrl = this.options.baseUrl?.trim()
            || process.env.CODEX_CLOUD_TASKS_BASE_URL
            || 'https://chatgpt.com/backend-api';
        const mock = typeof this.options.mock === 'boolean'
            ? this.options.mock
            : (process.env.CODEX_CLOUD_TASKS_MODE === 'mock' || process.env.CODEX_CLOUD_TASKS_MODE === 'MOCK');
        return new CloudTasksClient({
            ...this.options,
            baseUrl,
            mock,
        });
    }
}
//# sourceMappingURL=CloudTasksClientBuilder.js.map