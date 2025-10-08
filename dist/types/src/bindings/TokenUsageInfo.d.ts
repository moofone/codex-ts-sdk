/**
 * Aggregate token usage information tracked per session.
 */
export interface TokenUsage {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_output_tokens: number;
    total_tokens: number;
}
/**
 * Token usage summary containing cumulative and last-turn information.
 */
export interface TokenUsageInfo {
    total_token_usage: TokenUsage;
    last_token_usage: TokenUsage;
    model_context_window?: number;
}
