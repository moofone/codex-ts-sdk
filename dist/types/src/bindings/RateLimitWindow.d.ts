/**
 * Snapshot of a single rate limit window.
 */
export interface RateLimitWindow {
    /**
     * Percentage (0-100) of the window that has been consumed.
     */
    used_percent: number;
    /**
     * Rolling window duration, in minutes.
     */
    window_minutes?: number;
    /**
     * Seconds until the window resets.
     */
    resets_in_seconds?: number;
}
