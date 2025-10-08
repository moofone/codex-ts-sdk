const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const MINUTES_PER_MONTH = 30 * MINUTES_PER_DAY;
const ROUNDING_BIAS_MINUTES = 3;
/**
 * Tracks the latest status information emitted by the runtime.
 */
export class StatusStore {
    rateLimits;
    tokenUsage;
    lastUpdated;
    sessionId;
    model;
    reasoningEffort;
    historyLogId;
    historyEntryCount;
    rolloutPath;
    lastAgentMessage;
    modelContextWindow;
    updateFromTokenCountEvent(event) {
        if (event.rate_limits) {
            this.rateLimits = clone(event.rate_limits);
        }
        if (event.info) {
            this.tokenUsage = clone(event.info);
            if (typeof event.info.model_context_window === 'number') {
                this.modelContextWindow = event.info.model_context_window;
            }
        }
        if (event.rate_limits || event.info) {
            this.lastUpdated = new Date();
        }
    }
    updateSessionInfo(event) {
        this.sessionId = event.session_id;
        this.model = event.model;
        this.reasoningEffort = event.reasoning_effort;
        this.historyLogId = event.history_log_id;
        this.historyEntryCount = event.history_entry_count;
        this.rolloutPath = event.rollout_path;
    }
    updateFromTaskStartedEvent(event) {
        if (typeof event.model_context_window === 'number') {
            this.modelContextWindow = event.model_context_window;
        }
    }
    updateFromTaskCompleteEvent(event) {
        this.lastAgentMessage = event.last_agent_message ?? undefined;
    }
    getStatus() {
        const lastUpdated = this.lastUpdated ? new Date(this.lastUpdated) : undefined;
        const rateLimitWindows = this.buildRateLimitWindows(this.rateLimits, lastUpdated);
        return {
            rate_limits: this.rateLimits ? clone(this.rateLimits) : undefined,
            rate_limit_windows: rateLimitWindows,
            usage: this.tokenUsage ? clone(this.tokenUsage) : undefined,
            model: this.model,
            reasoning_effort: this.reasoningEffort,
            session_id: this.sessionId,
            last_updated: lastUpdated,
            history_log_id: this.historyLogId,
            history_entry_count: this.historyEntryCount,
            rollout_path: this.rolloutPath,
            last_agent_message: this.lastAgentMessage,
            model_context_window: this.modelContextWindow,
        };
    }
    clear() {
        this.rateLimits = undefined;
        this.tokenUsage = undefined;
        this.lastUpdated = undefined;
        this.sessionId = undefined;
        this.model = undefined;
        this.reasoningEffort = undefined;
        this.historyLogId = undefined;
        this.historyEntryCount = undefined;
        this.rolloutPath = undefined;
        this.lastAgentMessage = undefined;
        this.modelContextWindow = undefined;
    }
    buildRateLimitWindows(snapshot, lastUpdated) {
        if (!snapshot) {
            return undefined;
        }
        const buildWindow = (window) => {
            if (!window) {
                return undefined;
            }
            const { shortLabel, fullLabel } = deriveWindowLabels(window.window_minutes);
            const resetsAt = typeof window.resets_in_seconds === 'number'
                ? new Date((lastUpdated?.getTime() ?? Date.now()) + window.resets_in_seconds * 1000)
                : undefined;
            // Calculate projected end for weekly limits over 50%
            const projectedEnd = calculateProjectedEnd(window, resetsAt);
            return {
                used_percent: window.used_percent,
                window_minutes: window.window_minutes,
                resets_in_seconds: window.resets_in_seconds,
                short_label: shortLabel,
                label: fullLabel,
                resets_at: resetsAt,
                projected_end: projectedEnd,
            };
        };
        const primary = buildWindow(snapshot.primary);
        const secondary = buildWindow(snapshot.secondary);
        if (!primary && !secondary) {
            return undefined;
        }
        return { primary, secondary };
    }
}
/**
 * Calculate projected end time for weekly limits over 50% using linear regression.
 * @param window Rate limit window data
 * @param resetsAt When the window resets
 * @returns Projected end date or undefined if not applicable
 */
function calculateProjectedEnd(window, resetsAt) {
    // Only calculate for weekly limits (7 days = 10080 minutes)
    const WEEKLY_MINUTES = 7 * 24 * 60;
    if (window.window_minutes !== WEEKLY_MINUTES) {
        return undefined;
    }
    // Only show projection if over 50% usage
    if (window.used_percent < 50) {
        return undefined;
    }
    if (!resetsAt || typeof window.resets_in_seconds !== 'number') {
        return undefined;
    }
    // Calculate elapsed time in the window
    const totalWindowMs = WEEKLY_MINUTES * 60 * 1000; // 7 days in ms
    const remainingMs = window.resets_in_seconds * 1000;
    const elapsedMs = totalWindowMs - remainingMs;
    // Linear regression: assume constant usage rate
    const usageRate = window.used_percent / elapsedMs; // percent per ms
    const msToReach100 = (100 - window.used_percent) / usageRate;
    const now = new Date();
    const projectedEnd = new Date(now.getTime() + msToReach100);
    // Only return if projection is before the reset time (otherwise it's not meaningful)
    return projectedEnd < resetsAt ? projectedEnd : undefined;
}
function clone(value) {
    const maybeStructuredClone = globalThis.structuredClone;
    if (typeof maybeStructuredClone === 'function') {
        return maybeStructuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}
function deriveWindowLabels(windowMinutes) {
    const shortLabel = computeShortLabel(windowMinutes);
    const fullLabel = `${capitalizeIfAlpha(shortLabel)} limit`;
    return { shortLabel, fullLabel };
}
function computeShortLabel(windowMinutes) {
    if (typeof windowMinutes !== 'number') {
        return '5h';
    }
    if (windowMinutes <= MINUTES_PER_DAY + ROUNDING_BIAS_MINUTES) {
        const adjusted = windowMinutes + ROUNDING_BIAS_MINUTES;
        const hours = Math.max(1, Math.floor(adjusted / MINUTES_PER_HOUR));
        return `${hours}h`;
    }
    if (windowMinutes <= MINUTES_PER_WEEK + ROUNDING_BIAS_MINUTES) {
        return 'weekly';
    }
    if (windowMinutes <= MINUTES_PER_MONTH + ROUNDING_BIAS_MINUTES) {
        return 'monthly';
    }
    return 'annual';
}
function capitalizeIfAlpha(label) {
    if (!label || !/[a-zA-Z]/.test(label[0])) {
        return label;
    }
    return label[0].toUpperCase() + label.slice(1);
}
//# sourceMappingURL=StatusStore.js.map