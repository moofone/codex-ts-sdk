/// <reference types="node" />
import { EventEmitter } from 'events';
import type { CodexClient } from '../client/CodexClient';
import type { MonitoringConfig, MonitoringData, MonitoringStats, WebsiteExportFormat } from '../types/monitoring';
/**
 * Runtime implementation that matches the expectations expressed in the test-suite.
 * It collects structured monitoring data, aggregates repeated signals, supports
 * exporting results, and persists snapshots on shutdown.
 */
export declare class DataStorage extends EventEmitter {
    private readonly config;
    private readonly data;
    private readonly lastPoints;
    private readonly insertionOrder;
    private monitoring;
    private startedAt;
    private client;
    private readonly boundHandleEvent;
    constructor(config?: MonitoringConfig);
    /**
     * Begin monitoring a Codex client.
     */
    startMonitoring(client: CodexClient): Promise<void>;
    /**
     * Stop monitoring, persist collected data, and detach listeners.
     */
    stopMonitoring(): Promise<string | null>;
    /**
     * Clear collected data (used by tests and management utilities).
     */
    clearData(): void;
    /**
     * Return a defensive copy of the current monitoring data.
     */
    getCurrentData(): MonitoringData;
    /**
     * Return runtime statistics.
     */
    getStats(): MonitoringStats;
    /**
     * Produce a website export payload and optionally persist it to disk.
     */
    exportForWebsite(filePath?: string): Promise<WebsiteExportFormat>;
    private ensureOutputDirectory;
    private handleEvent;
    private processTokenCount;
    private processTiming;
    private processError;
    private processSystemHealth;
    private recordDataPoint;
    private evictOldestPoint;
    private findLatestForKey;
    private getArrayForCategory;
    private extractTimestamp;
    private totalDataPointCount;
    private computeMonitoringDuration;
    private createEmptyData;
    private clonePoints;
    private serialiseData;
    private buildWebsiteExport;
    private buildCategoryTimeSeries;
    private calculateSummaryStats;
    private calculateTrend;
    private estimateMonitoringDuration;
}
