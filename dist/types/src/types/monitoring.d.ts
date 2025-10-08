import type { CodexEvent } from './events';
export type DataCategory = 'rate_limits' | 'token_usage' | 'performance' | 'system_health';
export interface MonitoringLogger {
    debug?: (message: string, meta?: Record<string, unknown>) => void;
    info?: (message: string, meta?: Record<string, unknown>) => void;
    warn?: (message: string, meta?: Record<string, unknown>) => void;
    error?: (message: string, meta?: Record<string, unknown>) => void;
}
export interface DataPoint {
    category: DataCategory;
    type: string;
    value: number;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
export interface MonitoringData {
    rateLimits: DataPoint[];
    tokenUsage: DataPoint[];
    performance: DataPoint[];
    systemHealth: DataPoint[];
}
export interface MonitoringConfig {
    /** Path to write raw monitoring data when monitoring stops */
    outputPath?: string;
    /** Maximum number of data points to retain across all categories */
    maxDataPoints?: number;
    /** Minimum time between distinct data points of the same type */
    aggregationInterval?: number;
    /** Optional structured logger */
    logger?: MonitoringLogger;
}
export interface MonitoringStats {
    isMonitoring: boolean;
    dataPointCount: number;
    startedAt: Date | null;
    monitoringDuration: number;
    outputPath: string;
    categories: Record<DataCategory, number>;
}
export interface SummaryStats {
    total: number;
    average: number;
    min: number;
    max: number;
    latest: number;
}
export type TrendDirection = 'increasing' | 'decreasing' | 'stable';
export type TrendConfidence = 'low' | 'medium' | 'high';
export interface TrendAnalysis {
    direction: TrendDirection;
    changePercent: number;
    confidence: TrendConfidence;
}
export interface TimeSeriesPoint {
    timestamp: string;
    [key: string]: string | number | null | undefined;
}
export interface WebsiteExportFormat {
    metadata: {
        generatedAt: string;
        totalDataPoints: number;
        monitoringDuration: number;
        categories: DataCategory[];
        scenario?: MonitoringScenario;
    };
    summary: Record<DataCategory, SummaryStats>;
    timeSeries: Record<DataCategory, TimeSeriesPoint[]>;
    trends: Record<DataCategory, TrendAnalysis>;
}
export type MonitoringScenario = 'normal' | 'heavy_usage' | 'rate_limit_spike' | 'quiet_period' | 'error_prone';
export interface MockDataGeneratorConfig {
    seed?: number;
    defaultDuration?: number;
    defaultInterval?: number;
    logger?: MonitoringLogger;
}
export interface MockDataRequest {
    scenario: MonitoringScenario;
    duration: number;
    interval: number;
    seed?: number;
    startTimestamp?: number;
}
export interface WebsiteDataResult {
    outputPath: string;
    dataPoints: number;
    scenario: MonitoringScenario;
}
export type MonitoringEvent = CodexEvent;
