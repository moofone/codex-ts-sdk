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
export declare class CloudTasksClientBuilder {
    private options;
    /**
     * Set the base URL for the cloud tasks API.
     *
     * If omitted in `build()`, defaults to `process.env.CODEX_CLOUD_TASKS_BASE_URL`
     * or `https://chatgpt.com/backend-api`.
     *
     * @param baseUrl - API base URL (e.g., 'https://chatgpt.com/backend-api')
     * @returns This builder instance for chaining
     */
    withBaseUrl(baseUrl: string): this;
    /**
     * Set the bearer token for API authentication.
     *
     * Mutually exclusive with `withChatGptAccountId()`.
     *
     * @param token - Bearer token (e.g., from OPENAI_API_KEY)
     * @returns This builder instance for chaining
     */
    withBearerToken(token: string): this;
    /**
     * Set the ChatGPT account ID for authentication.
     *
     * Mutually exclusive with `withBearerToken()`.
     *
     * @param id - ChatGPT account identifier
     * @returns This builder instance for chaining
     */
    withChatGptAccountId(id: string): this;
    /**
     * Set a custom user agent string for API requests.
     *
     * @param ua - User agent string (e.g., 'my-app/1.0.0')
     * @returns This builder instance for chaining
     */
    withUserAgent(ua: string): this;
    /**
     * Enable mock backend for testing (no actual API calls).
     *
     * @param mock - Enable mock mode (default: true)
     * @returns This builder instance for chaining
     */
    withMockBackend(mock?: boolean): this;
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
    build(): CloudTasksClient;
}
