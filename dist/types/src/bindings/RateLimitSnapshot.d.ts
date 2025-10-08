import type { RateLimitWindow } from "./RateLimitWindow";
/**
 * Collection of rate limit windows for the current account.
 */
export interface RateLimitSnapshot {
    /**
     * Primary rate limit window (usually per-short-period quota).
     */
    primary?: RateLimitWindow;
    /**
     * Secondary rate limit window (longer duration quota).
     */
    secondary?: RateLimitWindow;
}
