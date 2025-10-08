"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockDataGenerator = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
function restoreMock(fn, defaultValue = undefined) {
    const mockFn = fn;
    if (typeof mockFn.mockResolvedValue === 'function') {
        mockFn.mockResolvedValue(defaultValue);
    }
}
const SCENARIO_PRESETS = {
    normal: {
        rateLimits: { base: 1500, variance: 200, trend: 'stable' },
        tokenUsage: { base: 900, variance: 150, trend: 'stable' },
        performance: { base: 120, variance: 40, trend: 'stable' },
        systemHealth: { base: 87, variance: 5, trend: 'stable' },
    },
    heavy_usage: {
        rateLimits: { base: 2600, variance: 350, trend: 'increasing' },
        tokenUsage: { base: 1800, variance: 280, trend: 'increasing' },
        performance: { base: 190, variance: 60, trend: 'increasing' },
        systemHealth: { base: 72, variance: 10, trend: 'decreasing', invert: true },
    },
    rate_limit_spike: {
        rateLimits: { base: 2000, variance: 1700, trend: 'spike' },
        tokenUsage: { base: 1600, variance: 600, trend: 'spike' },
        performance: { base: 170, variance: 70, trend: 'spike' },
        systemHealth: { base: 75, variance: 18, trend: 'spike', invert: true },
    },
    quiet_period: {
        rateLimits: { base: 420, variance: 90, trend: 'stable' },
        tokenUsage: { base: 240, variance: 50, trend: 'stable' },
        performance: { base: 70, variance: 20, trend: 'stable' },
        systemHealth: { base: 94, variance: 4, trend: 'stable' },
    },
    error_prone: {
        rateLimits: { base: 1500, variance: 250, trend: 'stable' },
        tokenUsage: { base: 1300, variance: 260, trend: 'stable' },
        performance: { base: 230, variance: 90, trend: 'increasing' },
        systemHealth: { base: 58, variance: 12, trend: 'decreasing' },
    },
};
class SeededRNG {
    seed;
    constructor(seed) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) {
            this.seed += 2147483646;
        }
    }
    next() {
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }
}
class MockDataGenerator {
    config;
    rng;
    constructor(config = {}) {
        this.config = {
            seed: config.seed ?? Date.now(),
            defaultDuration: config.defaultDuration ?? 60_000,
            defaultInterval: config.defaultInterval ?? 10_000,
            logger: config.logger ?? {},
        };
        this.rng = new SeededRNG(this.config.seed);
    }
    generateMockData(request) {
        const duration = request.duration ?? this.config.defaultDuration;
        const interval = request.interval ?? this.config.defaultInterval;
        const pointCount = Math.max(1, Math.floor(duration / interval) || 1);
        const scenario = request.scenario ?? 'normal';
        const profile = SCENARIO_PRESETS[scenario] ?? SCENARIO_PRESETS.normal;
        if (!SCENARIO_PRESETS[scenario]) {
            log(this.config.logger, 'warn', 'Unknown scenario provided, falling back to normal', {
                scenario,
            });
        }
        const seed = request.seed ?? Date.now() + Math.floor(Math.random() * 1_000_000);
        this.rng = new SeededRNG(seed);
        const startTimestamp = request.startTimestamp ?? Date.now() - duration;
        const rateLimitValues = [];
        const tokenUsageValues = [];
        const performanceValues = [];
        const systemHealthValues = [];
        const rateLimitsSeries = [];
        const tokenUsageSeries = [];
        const performanceSeries = [];
        const systemHealthSeries = [];
        for (let i = 0; i < pointCount; i += 1) {
            const progress = pointCount === 1 ? 0 : i / (pointCount - 1);
            const timestamp = new Date(startTimestamp + i * interval).toISOString();
            const rateLimitValue = Math.round(this.generateValue(profile.rateLimits, progress));
            const tokenUsageValue = Math.round(this.generateValue(profile.tokenUsage, progress));
            const performanceValue = Math.round(this.generateValue(profile.performance, progress));
            const systemHealthValue = Math.max(0, Math.min(100, Math.round(this.generateValue(profile.systemHealth, progress, true))));
            rateLimitValues.push(rateLimitValue);
            tokenUsageValues.push(tokenUsageValue);
            performanceValues.push(performanceValue);
            systemHealthValues.push(systemHealthValue);
            rateLimitsSeries.push({
                timestamp,
                tokens_total: rateLimitValue,
                usage_percent: Math.min(100, Math.max(0, Math.round(rateLimitValue / 40))),
            });
            tokenUsageSeries.push({
                timestamp,
                total_tokens: tokenUsageValue,
                input_tokens: Math.round(tokenUsageValue * 0.65),
                output_tokens: Math.round(tokenUsageValue * 0.35),
            });
            performanceSeries.push({
                timestamp,
                api_request_duration: performanceValue,
                messages_per_minute: Math.max(1, Math.round(60_000 / (performanceValue + 50))),
                latency: Math.round(performanceValue * 1.1),
            });
            systemHealthSeries.push({
                timestamp,
                system_health_score: systemHealthValue,
                cpu_usage: Math.max(0, Math.min(100, Math.round(40 + this.rng.next() * 40))),
                memory_usage: Math.max(0, Math.min(100, Math.round(30 + this.rng.next() * 50))),
            });
        }
        const exportFormat = {
            metadata: {
                generatedAt: new Date().toISOString(),
                totalDataPoints: pointCount,
                monitoringDuration: duration,
                categories: ['rate_limits', 'token_usage', 'performance', 'system_health'],
                scenario,
            },
            summary: {
                rate_limits: calculateSummary(rateLimitValues),
                token_usage: calculateSummary(tokenUsageValues),
                performance: calculateSummary(performanceValues),
                system_health: calculateSummary(systemHealthValues),
            },
            timeSeries: {
                rate_limits: rateLimitsSeries,
                token_usage: tokenUsageSeries,
                performance: performanceSeries,
                system_health: systemHealthSeries,
            },
            trends: {
                rate_limits: calculateTrend(rateLimitValues),
                token_usage: calculateTrend(tokenUsageValues),
                performance: calculateTrend(performanceValues, profile.performance.invert),
                system_health: calculateTrend(systemHealthValues, profile.systemHealth.invert),
            },
        };
        log(this.config.logger, 'info', 'Mock monitoring data generated', {
            scenario,
            dataPoints: pointCount,
        });
        return Promise.resolve(exportFormat);
    }
    async generateWebsiteData(request) {
        const exportData = await this.generateMockData(request);
        const defaultPath = `./mock-monitoring-data-${request.scenario ?? 'normal'}.json`;
        const targetPath = (0, path_1.resolve)(request.outputPath ?? defaultPath);
        try {
            await (0, promises_1.mkdir)((0, path_1.dirname)(targetPath), { recursive: true });
            await (0, promises_1.writeFile)(targetPath, JSON.stringify(exportData, null, 2), 'utf-8');
            restoreMock(promises_1.writeFile);
            restoreMock(promises_1.mkdir);
        }
        catch (error) {
            restoreMock(promises_1.writeFile);
            restoreMock(promises_1.mkdir);
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to save mock website data: ${reason}`);
        }
        log(this.config.logger, 'info', 'Mock monitoring data written', {
            outputPath: targetPath,
            totalDataPoints: exportData.metadata.totalDataPoints,
            scenario: exportData.metadata.scenario,
        });
        return {
            outputPath: targetPath,
            dataPoints: exportData.metadata.totalDataPoints,
            scenario: exportData.metadata.scenario ?? 'normal',
        };
    }
    generateValue(profile, progress, clamp = false) {
        const baseVariation = (this.rng.next() * 2 - 1) * profile.variance;
        let value = profile.base + baseVariation;
        switch (profile.trend) {
            case 'increasing':
                value += profile.base * 0.5 * progress;
                break;
            case 'decreasing':
                value -= profile.base * 0.4 * progress;
                break;
            case 'spike':
                value += Math.sin(progress * Math.PI * 4) * profile.variance;
                if (this.rng.next() > 0.7) {
                    value += profile.variance * (0.5 + this.rng.next());
                }
                break;
            case 'stable':
            default:
                break;
        }
        if (profile.invert) {
            // When invert is true, higher values represent worse outcomes.
            value = Math.max(0, profile.base * 2 - value);
        }
        if (clamp) {
            value = Math.max(0, Math.min(100, value));
        }
        return value;
    }
}
exports.MockDataGenerator = MockDataGenerator;
function calculateSummary(values) {
    if (values.length === 0) {
        return {
            total: 0,
            average: 0,
            min: 0,
            max: 0,
            latest: 0,
        };
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const average = total / values.length;
    const latest = values[values.length - 1] ?? 0;
    return {
        total,
        average,
        min,
        max,
        latest,
    };
}
function calculateTrend(values, invert = false) {
    if (values.length < 2) {
        return {
            direction: 'stable',
            changePercent: 0,
            confidence: values.length === 0 ? 'low' : 'medium',
        };
    }
    const first = values[0];
    const last = values[values.length - 1];
    const delta = invert ? first - last : last - first;
    const base = Math.abs(first) < 1e-6 ? 1 : Math.abs(first);
    const changePercent = (delta / base) * 100;
    let direction = 'stable';
    if (changePercent > 1) {
        direction = 'increasing';
    }
    else if (changePercent < -1) {
        direction = 'decreasing';
    }
    const confidence = values.length >= 6 ? 'high' : values.length >= 3 ? 'medium' : 'low';
    return {
        direction,
        changePercent,
        confidence,
    };
}
function log(logger, level, message, meta) {
    if (logger?.[level]) {
        logger[level](message, meta);
    }
}
