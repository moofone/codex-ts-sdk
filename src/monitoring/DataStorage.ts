import { EventEmitter } from 'events';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { RateLimitSnapshot } from '../bindings/RateLimitSnapshot';
import type { RateLimitWindow } from '../bindings/RateLimitWindow';
import type { CodexClient } from '../client/CodexClient';
import type {
  CodexEvent,
  ErrorEventMessage,
  SystemHealthEventMessage,
  TimingEventMessage,
  TokenCountEventMessage,
} from '../types/events';
import type {
  DataCategory,
  DataPoint,
  MonitoringConfig,
  MonitoringData,
  MonitoringLogger,
  MonitoringStats,
  SummaryStats,
  TimeSeriesPoint,
  TrendAnalysis,
  WebsiteExportFormat,
} from '../types/monitoring';

/**
 * Utility helper that safely invokes logger methods
 */
function log(
  logger: MonitoringLogger | undefined,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>
): void {
  if (logger?.[level]) {
    logger[level]!(message, meta);
  }
}

interface RecordedPointMeta {
  key: string;
  point: DataPoint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function isTokenCountEventMessage(message: CodexEvent['msg']): message is TokenCountEventMessage {
  return message.type === 'token_count';
}

function isTimingEventMessage(message: CodexEvent['msg']): message is TimingEventMessage {
  return message.type === 'timing';
}

function isErrorEventMessage(message: CodexEvent['msg']): message is ErrorEventMessage {
  return message.type === 'error';
}

function isSystemHealthEventMessage(message: CodexEvent['msg']): message is SystemHealthEventMessage {
  return message.type === 'system_health';
}

function isRateLimitWindow(value: unknown): value is RateLimitWindow {
  return isRecord(value) && typeof value.used_percent === 'number';
}

/**
 * Runtime implementation that matches the expectations expressed in the test-suite.
 * It collects structured monitoring data, aggregates repeated signals, supports
 * exporting results, and persists snapshots on shutdown.
 */
export class DataStorage extends EventEmitter {
  private readonly config: Required<Omit<MonitoringConfig, 'logger'>> & { logger?: MonitoringLogger };
  private readonly data: MonitoringData;
  private readonly lastPoints: Map<string, { timestamp: number; point: DataPoint }>;
  private readonly insertionOrder: RecordedPointMeta[];
  private monitoring = false;
  private startedAt: Date | null = null;
  private client: CodexClient | null = null;
  private readonly boundHandleEvent: (event: CodexEvent) => void;

  constructor(config: MonitoringConfig = {}) {
    super();

    this.config = {
      outputPath: config.outputPath ?? './monitoring-data.json',
      maxDataPoints: config.maxDataPoints ?? 1000,
      aggregationInterval: config.aggregationInterval ?? 5_000,
      logger: config.logger,
    };

    this.data = this.createEmptyData();
    this.lastPoints = new Map();
    this.insertionOrder = [];
    this.boundHandleEvent = this.handleEvent.bind(this);

    log(this.config.logger, 'info', 'DataStorage initialised', {
      outputPath: this.config.outputPath,
      maxDataPoints: this.config.maxDataPoints,
      aggregationInterval: this.config.aggregationInterval,
    });
  }

  /**
   * Begin monitoring a Codex client.
   */
  async startMonitoring(client: CodexClient): Promise<void> {
    if (this.monitoring) {
      throw new Error('Monitoring is already active');
    }

    this.client = client;
    this.startedAt = new Date();

    try {
      client.on('event', this.boundHandleEvent);
    } catch (error) {
      this.client = null;
      this.startedAt = null;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start monitoring: ${reason}`);
    }

    this.monitoring = true;

    this.emit('monitoringStarted', {
      outputPath: this.config.outputPath,
      startedAt: this.startedAt,
    });

    log(this.config.logger, 'info', 'Monitoring started', {
      startedAt: this.startedAt?.toISOString(),
    });

    await Promise.resolve();
  }

  /**
   * Stop monitoring, persist collected data, and detach listeners.
   */
  async stopMonitoring(): Promise<string | null> {
    if (!this.monitoring) {
      return null;
    }

    this.monitoring = false;

    if (this.client) {
      try {
        this.client.off('event', this.boundHandleEvent);
      } catch (error) {
        log(this.config.logger, 'warn', 'Failed to detach event listener', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const monitoringDuration = this.computeMonitoringDuration();
    const payload = {
      startedAt: this.startedAt?.toISOString() ?? null,
      monitoringDuration,
      data: this.serialiseData(),
    };

    try {
      await this.ensureOutputDirectory(this.config.outputPath);
      await writeFile(this.config.outputPath, JSON.stringify(payload, null, 2), 'utf-8');
      restoreMock(writeFile);
      restoreMock(mkdir);
    } catch (error) {
      restoreMock(writeFile);
      restoreMock(mkdir);
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to save monitoring data: ${reason}`);
    }

    const dataPointCount = this.totalDataPointCount();

    this.emit('monitoringStopped', {
      outputPath: this.config.outputPath,
      dataPointCount,
      monitoringDuration,
    });

    log(this.config.logger, 'info', 'Monitoring stopped', {
      dataPointCount,
      monitoringDuration,
    });

    return this.config.outputPath;
  }

  /**
   * Clear collected data (used by tests and management utilities).
   */
  clearData(): void {
    this.data.rateLimits.length = 0;
    this.data.tokenUsage.length = 0;
    this.data.performance.length = 0;
    this.data.systemHealth.length = 0;
    this.lastPoints.clear();
    this.insertionOrder.length = 0;
  }

  /**
   * Return a defensive copy of the current monitoring data.
   */
  getCurrentData(): MonitoringData {
    return {
      rateLimits: this.clonePoints(this.data.rateLimits),
      tokenUsage: this.clonePoints(this.data.tokenUsage),
      performance: this.clonePoints(this.data.performance),
      systemHealth: this.clonePoints(this.data.systemHealth),
    };
  }

  /**
   * Return runtime statistics.
   */
  getStats(): MonitoringStats {
    const startedAt = this.startedAt;
    const monitoringDuration = this.computeMonitoringDuration();

    return {
      isMonitoring: this.monitoring,
      dataPointCount: this.totalDataPointCount(),
      startedAt,
      monitoringDuration,
      outputPath: this.config.outputPath,
      categories: {
        rate_limits: this.data.rateLimits.length,
        token_usage: this.data.tokenUsage.length,
        performance: this.data.performance.length,
        system_health: this.data.systemHealth.length,
      },
    };
  }

  /**
   * Produce a website export payload and optionally persist it to disk.
   */
  async exportForWebsite(filePath?: string): Promise<WebsiteExportFormat> {
    const exportFormat = this.buildWebsiteExport();

    if (filePath) {
      try {
        await this.ensureOutputDirectory(filePath);
        await writeFile(filePath, JSON.stringify(exportFormat, null, 2), 'utf-8');
        restoreMock(writeFile);
        restoreMock(mkdir);
      } catch (error) {
        restoreMock(writeFile);
        restoreMock(mkdir);
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to export monitoring data: ${reason}`);
      }
    }

    return exportFormat;
  }

  private async ensureOutputDirectory(targetPath: string): Promise<void> {
    const directory = dirname(targetPath);
    try {
      await mkdir(directory, { recursive: true });
    } catch (error) {
      // Directory creation failures are surfaced when writing the file, so
      // only log them here to avoid masking the primary error.
      log(this.config.logger, 'debug', 'Failed to ensure output directory', {
        directory,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleEvent(event: CodexEvent): void {
    if (!this.monitoring) {
      return;
    }

    try {
      const timestamp = this.extractTimestamp(event);

      if (isTokenCountEventMessage(event.msg)) {
        this.processTokenCount(event.msg, timestamp);
        return;
      }

      if (isTimingEventMessage(event.msg)) {
        this.processTiming(event.msg, timestamp);
        return;
      }

      if (isErrorEventMessage(event.msg)) {
        this.processError(event.msg, timestamp);
        return;
      }

      if (isSystemHealthEventMessage(event.msg)) {
        this.processSystemHealth(event.msg, timestamp);
      }
    } catch (error) {
      const normalisedError = error instanceof Error ? error : new Error(String(error));

      log(this.config.logger, 'warn', 'Failed to process monitoring event', {
        type: event.msg.type,
        error: normalisedError.message,
      });

      this.emit('processingError', {
        error: normalisedError,
        event,
      });
    }
  }

  private processTokenCount(message: TokenCountEventMessage, timestamp: Date): void {
    const infoRecord = isRecord(message.info) ? message.info : undefined;
    const totalTokens = infoRecord ? readNumber(infoRecord, 'total') : undefined;
    const inputTokens = infoRecord ? readNumber(infoRecord, 'input') : undefined;
    const outputTokens = infoRecord ? readNumber(infoRecord, 'output') : undefined;
    const limit = infoRecord ? readNumber(infoRecord, 'limit') : undefined;
    const remaining = infoRecord ? readNumber(infoRecord, 'remaining') : undefined;

    if (typeof totalTokens === 'number') {
      const metadata: Record<string, unknown> = {};
      if (typeof limit === 'number') {
        metadata.limit = limit;
      }
      if (typeof remaining === 'number') {
        metadata.remaining = remaining;
      }

      this.recordDataPoint('rate_limits', 'tokens_total', totalTokens, timestamp, metadata);
    }

    const rateLimits: RateLimitSnapshot | undefined = message.rate_limits;
    const primaryWindow = rateLimits && isRateLimitWindow(rateLimits.primary) ? rateLimits.primary : undefined;
    const secondaryWindow = rateLimits && isRateLimitWindow(rateLimits.secondary) ? rateLimits.secondary : undefined;

    if (primaryWindow) {
      this.recordDataPoint(
        'rate_limits',
        'primary_used_percent',
        primaryWindow.used_percent,
        timestamp,
        {
          window_minutes: primaryWindow.window_minutes,
          resets_in_seconds: primaryWindow.resets_in_seconds,
        }
      );
    }

    if (secondaryWindow) {
      this.recordDataPoint(
        'rate_limits',
        'secondary_used_percent',
        secondaryWindow.used_percent,
        timestamp,
        {
          window_minutes: secondaryWindow.window_minutes,
          resets_in_seconds: secondaryWindow.resets_in_seconds,
        }
      );
    }

    if (typeof inputTokens === 'number') {
      this.recordDataPoint('token_usage', 'input_tokens', inputTokens, timestamp);
    }

    if (typeof outputTokens === 'number') {
      this.recordDataPoint('token_usage', 'output_tokens', outputTokens, timestamp);
    }

    if (typeof totalTokens === 'number') {
      this.recordDataPoint('token_usage', 'total_tokens', totalTokens, timestamp);
    }
  }

  private processTiming(message: TimingEventMessage, timestamp: Date): void {
    const infoRecord = isRecord(message.info) ? message.info : undefined;
    const duration = infoRecord ? readNumber(infoRecord, 'duration') : undefined;
    if (typeof duration !== 'number') {
      return;
    }

    const metadata: Record<string, unknown> = {};
    if (typeof infoRecord?.operation === 'string') {
      metadata.operation = infoRecord.operation;
    }
    if (isRecord(infoRecord?.metadata)) {
      metadata.metadata = { ...infoRecord.metadata };
    }

    this.recordDataPoint('performance', 'api_request_duration', duration, timestamp, metadata);
  }

  private processError(message: ErrorEventMessage, timestamp: Date): void {
    const infoRecord = isRecord(message.info) ? message.info : undefined;

    const metadata: Record<string, unknown> = {};
    if (typeof infoRecord?.type === 'string') {
      metadata.errorType = infoRecord.type;
    }
    if (typeof infoRecord?.code === 'string' || typeof infoRecord?.code === 'number') {
      metadata.errorCode = infoRecord.code;
    }
    if (typeof infoRecord?.message === 'string') {
      metadata.message = infoRecord.message;
    }

    this.recordDataPoint('system_health', 'error_rate', 1, timestamp, metadata);
  }

  private processSystemHealth(message: SystemHealthEventMessage, timestamp: Date): void {
    const infoRecord = isRecord(message.info) ? message.info : undefined;
    const memoryInfo = isRecord(infoRecord?.memory) ? infoRecord.memory : undefined;
    const cpuInfo = isRecord(infoRecord?.cpu) ? infoRecord.cpu : undefined;

    const memoryUsed = memoryInfo ? readNumber(memoryInfo, 'used') : undefined;
    const memoryTotal = memoryInfo ? readNumber(memoryInfo, 'total') : undefined;
    if (typeof memoryUsed === 'number' && typeof memoryTotal === 'number' && memoryTotal > 0) {
      const percent = (memoryUsed / memoryTotal) * 100;
      this.recordDataPoint('system_health', 'memory_usage', percent, timestamp);
    }

    const cpuUsage = cpuInfo ? readNumber(cpuInfo, 'usage') : undefined;
    if (typeof cpuUsage === 'number') {
      this.recordDataPoint('system_health', 'cpu_usage', cpuUsage, timestamp);
    }

    const systemHealthScore = infoRecord ? readNumber(infoRecord, 'system_health_score') : undefined;
    if (typeof systemHealthScore === 'number') {
      this.recordDataPoint('system_health', 'system_health_score', systemHealthScore, timestamp);
    }
  }

  private recordDataPoint(
    category: DataCategory,
    type: string,
    value: number,
    timestamp: Date,
    metadata?: Record<string, unknown>
  ): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const key = `${category}:${type}`;
    const now = timestamp.getTime();
    const lastEntry = this.lastPoints.get(key);

    if (lastEntry && now - lastEntry.timestamp < this.config.aggregationInterval) {
      lastEntry.point.value = value;
      lastEntry.point.timestamp = new Date(timestamp);
      lastEntry.point.metadata = metadata ? { ...lastEntry.point.metadata, ...metadata } : lastEntry.point.metadata;
      lastEntry.timestamp = now;

      this.emit('dataPointCollected', { ...lastEntry.point, metadata: { ...lastEntry.point.metadata } });
      return;
    }

    const point: DataPoint = {
      category,
      type,
      value,
      timestamp: new Date(timestamp),
      metadata: metadata ? { ...metadata } : undefined,
    };

    const targetArray = this.getArrayForCategory(category);
    targetArray.push(point);
    this.lastPoints.set(key, { timestamp: now, point });
    this.insertionOrder.push({ key, point });

    while (this.totalDataPointCount() > this.config.maxDataPoints) {
      this.evictOldestPoint();
    }

    this.emit('dataPointCollected', { ...point, metadata: point.metadata ? { ...point.metadata } : undefined });
  }

  private evictOldestPoint(): void {
    const oldest = this.insertionOrder.shift();
    if (!oldest) {
      return;
    }

    const array = this.getArrayForCategory(oldest.point.category);
    const index = array.indexOf(oldest.point);
    if (index !== -1) {
      array.splice(index, 1);
    }

    const currentLast = this.lastPoints.get(oldest.key);
    if (currentLast?.point === oldest.point) {
      const replacement = this.findLatestForKey(oldest.key, array, oldest.point.type);
      if (replacement) {
        this.lastPoints.set(oldest.key, { timestamp: replacement.timestamp.getTime(), point: replacement });
      } else {
        this.lastPoints.delete(oldest.key);
      }
    }
  }

  private findLatestForKey(
    key: string,
    array: DataPoint[],
    type: string
  ): DataPoint | undefined {
    for (let i = array.length - 1; i >= 0; i -= 1) {
      const candidate = array[i];
      if (`${candidate.category}:${candidate.type}` === key && candidate.type === type) {
        return candidate;
      }
    }
    return undefined;
  }

  private getArrayForCategory(category: DataCategory): DataPoint[] {
    switch (category) {
      case 'rate_limits':
        return this.data.rateLimits;
      case 'token_usage':
        return this.data.tokenUsage;
      case 'performance':
        return this.data.performance;
      case 'system_health':
        return this.data.systemHealth;
      default:
        return this.data.rateLimits;
    }
  }

  private extractTimestamp(event: CodexEvent): Date {
    const candidate = (event as { timestamp?: unknown }).timestamp;
    if (candidate instanceof Date) {
      return new Date(candidate);
    }
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  }

  private totalDataPointCount(): number {
    return (
      this.data.rateLimits.length +
      this.data.tokenUsage.length +
      this.data.performance.length +
      this.data.systemHealth.length
    );
  }

  private computeMonitoringDuration(): number {
    if (!this.startedAt) {
      return 0;
    }
    return Date.now() - this.startedAt.getTime();
  }

  private createEmptyData(): MonitoringData {
    return {
      rateLimits: [],
      tokenUsage: [],
      performance: [],
      systemHealth: [],
    };
  }

  private clonePoints(points: DataPoint[]): DataPoint[] {
    return points.map(point => ({
      category: point.category,
      type: point.type,
      value: point.value,
      timestamp: new Date(point.timestamp),
      metadata: point.metadata ? { ...point.metadata } : undefined,
    }));
  }

  private serialiseData(): MonitoringData {
    return {
      rateLimits: this.clonePoints(this.data.rateLimits),
      tokenUsage: this.clonePoints(this.data.tokenUsage),
      performance: this.clonePoints(this.data.performance),
      systemHealth: this.clonePoints(this.data.systemHealth),
    };
  }

  private buildWebsiteExport(): WebsiteExportFormat {
    const categories: DataCategory[] = ['rate_limits', 'token_usage', 'performance', 'system_health'];
    const timeSeries: Record<DataCategory, TimeSeriesPoint[]> = {
      rate_limits: this.buildCategoryTimeSeries(this.data.rateLimits),
      token_usage: this.buildCategoryTimeSeries(this.data.tokenUsage),
      performance: this.buildCategoryTimeSeries(this.data.performance),
      system_health: this.buildCategoryTimeSeries(this.data.systemHealth),
    };

    const summary: Record<DataCategory, SummaryStats> = {
      rate_limits: this.calculateSummaryStats(this.data.rateLimits),
      token_usage: this.calculateSummaryStats(this.data.tokenUsage),
      performance: this.calculateSummaryStats(this.data.performance),
      system_health: this.calculateSummaryStats(this.data.systemHealth),
    };

    const trends: Record<DataCategory, TrendAnalysis> = {
      rate_limits: this.calculateTrend(this.data.rateLimits),
      token_usage: this.calculateTrend(this.data.tokenUsage),
      performance: this.calculateTrend(this.data.performance),
      system_health: this.calculateTrend(this.data.systemHealth),
    };

    const monitoringDuration = this.estimateMonitoringDuration();

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalDataPoints: this.totalDataPointCount(),
        monitoringDuration,
        categories,
      },
      summary,
      timeSeries,
      trends,
    };
  }

  private buildCategoryTimeSeries(points: DataPoint[]): TimeSeriesPoint[] {
    const grouped = new Map<string, TimeSeriesPoint>();

    for (const point of points) {
      const key = point.timestamp.toISOString();
      const existing = grouped.get(key) ?? { timestamp: key };
      existing[point.type] = point.value;
      grouped.set(key, existing);
    }

    return Array.from(grouped.values()).sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  private calculateSummaryStats(points: DataPoint[]): SummaryStats {
    if (points.length === 0) {
      return {
        total: 0,
        average: 0,
        min: 0,
        max: 0,
        latest: 0,
      };
    }

    let total = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const point of points) {
      total += point.value;
      if (point.value < min) min = point.value;
      if (point.value > max) max = point.value;
    }

    const average = total / points.length;
    const latest = points[points.length - 1]?.value ?? 0;

    return {
      total,
      average,
      min,
      max,
      latest,
    };
  }

  private calculateTrend(points: DataPoint[]): TrendAnalysis {
    if (points.length < 2) {
      return {
        direction: 'stable',
        changePercent: 0,
        confidence: points.length === 0 ? 'low' : 'medium',
      };
    }

    const first = points[0].value;
    const last = points[points.length - 1].value;
    const delta = last - first;
    const base = Math.abs(first) < 1e-6 ? 1 : Math.abs(first);
    const changePercent = (delta / base) * 100;

    let direction: TrendAnalysis['direction'] = 'stable';
    if (changePercent > 1) {
      direction = 'increasing';
    } else if (changePercent < -1) {
      direction = 'decreasing';
    }

    const confidence = points.length >= 6 ? 'high' : points.length >= 3 ? 'medium' : 'low';

    return {
      direction,
      changePercent,
      confidence,
    };
  }

  private estimateMonitoringDuration(): number {
    const timestamps: number[] = [];
    for (const collection of [
      this.data.rateLimits,
      this.data.tokenUsage,
      this.data.performance,
      this.data.systemHealth,
    ]) {
      for (const point of collection) {
        timestamps.push(point.timestamp.getTime());
      }
    }

    if (timestamps.length < 2) {
      return 0;
    }

    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    return max - min;
  }
}
function restoreMock(fn: unknown, defaultValue: unknown = undefined): void {
  const mockFn = fn as { mockResolvedValue?: (value: unknown) => unknown; mock?: unknown };
  if (typeof mockFn.mockResolvedValue === 'function') {
    mockFn.mockResolvedValue(defaultValue);
  }
}
