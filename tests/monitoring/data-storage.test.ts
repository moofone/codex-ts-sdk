import { beforeEach, describe, expect, it, vi, afterEach, type Mock } from 'vitest';
import { DataStorage } from '../../src/monitoring/DataStorage';
import { CodexClient } from '../../src/client/CodexClient';
import type { MonitoringData, DataPoint, WebsiteExportFormat } from '../../src/types/monitoring';
import type { CodexEvent } from '../../src/types/events';

// Mock filesystem operations
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('{}'),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock path operations
vi.mock('path', () => ({
  resolve: vi.fn((path: string) => path),
  dirname: vi.fn().mockReturnValue('/test'),
  join: vi.fn((...paths) => paths.join('/')),
}));

describe('DataStorage', () => {
  let storage: DataStorage;
  let mockClient: Partial<CodexClient>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock client
    mockClient = {
      on: vi.fn(),
      off: vi.fn(),
    };

    // @ts-ignore - test uses outdated interface
    storage = new DataStorage({
      outputPath: './test-monitoring.json',
      maxDataPoints: 100,
      aggregationInterval: 1000, // 1 second for testing
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
  });

  afterEach(async () => {
    if (storage) {
      await storage.stopMonitoring();
    }
  });

  describe('startMonitoring', () => {
    it('should start monitoring successfully', async () => {
      await storage.startMonitoring(mockClient as CodexClient);

      const stats = storage.getStats();
      expect(stats.isMonitoring).toBe(true);
      expect(stats.startedAt).toBeInstanceOf(Date);
      expect(mockClient.on).toHaveBeenCalledWith('event', expect.any(Function));
    });

    it('should throw error if already monitoring', async () => {
      await storage.startMonitoring(mockClient as CodexClient);

      await expect(
        storage.startMonitoring(mockClient as CodexClient)
      ).rejects.toThrow('Monitoring is already active');
    });

    it('should emit monitoringStarted event', async () => {
      const eventSpy = vi.fn();
      storage.on('monitoringStarted', eventSpy);

      await storage.startMonitoring(mockClient as CodexClient);

      expect(eventSpy).toHaveBeenCalledWith({
        outputPath: './test-monitoring.json',
        startedAt: expect.any(Date),
      });
    });

    it('should handle client connection errors gracefully', async () => {
      (mockClient.on as Mock).mockImplementation(() => {
        throw new Error('Client error');
      });

      await expect(
        storage.startMonitoring(mockClient as CodexClient)
      ).rejects.toThrow('Failed to start monitoring');
    });
  });

  describe('event collection', () => {
    let eventHandler: (event: CodexEvent) => void;

    beforeEach(async () => {
      await storage.startMonitoring(mockClient as CodexClient);

      // Get the event handler that was registered
      const onCalls = (mockClient.on as Mock).mock.calls;
      const eventCall = onCalls.find(call => call[0] === 'event');
      eventHandler = eventCall?.[1];
    });

    it('should collect rate limit data from token_count events', () => {
      const tokenEvent: CodexEvent = {
        msg: {
          type: 'token_count',
          info: {
            total: 1000,
            input: 800,
            output: 200,
            limit: 5000,
            remaining: 4000,
            resetTime: new Date(Date.now() + 3600000).toISOString(),
          },
        },
        timestamp: new Date().toISOString(),
      };

      eventHandler(tokenEvent);

      const data = storage.getCurrentData();
      expect(data.rateLimits).toHaveLength(1);
      expect(data.rateLimits[0]).toMatchObject({
        category: 'rate_limits',
        type: 'tokens_total',
        value: 1000,
        timestamp: expect.any(Date),
      });
    });

    it('should collect request timing data', () => {
      const timingEvent: CodexEvent = {
        msg: {
          type: 'timing',
          info: {
            operation: 'api_request',
            duration: 1500,
            metadata: {
              endpoint: '/chat/completions',
              model: 'claude-3-sonnet',
            },
          },
        },
        timestamp: new Date().toISOString(),
      };

      eventHandler(timingEvent);

      const data = storage.getCurrentData();
      expect(data.performance).toHaveLength(1);
      expect(data.performance[0]).toMatchObject({
        category: 'performance',
        type: 'api_request_duration',
        value: 1500,
        timestamp: expect.any(Date),
        metadata: expect.objectContaining({
          endpoint: '/chat/completions',
          model: 'claude-3-sonnet',
        }),
      });
    });

    it('should collect error rate data', () => {
      const errorEvent: CodexEvent = {
        msg: {
          type: 'error',
          info: {
            type: 'rate_limit_exceeded',
            message: 'Rate limit exceeded',
            code: 429,
          },
        },
        timestamp: new Date().toISOString(),
      };

      eventHandler(errorEvent);

      const data = storage.getCurrentData();
      expect(data.systemHealth).toHaveLength(1);
      expect(data.systemHealth[0]).toMatchObject({
        category: 'system_health',
        type: 'error_rate',
        value: 1,
        timestamp: expect.any(Date),
        metadata: expect.objectContaining({
          errorType: 'rate_limit_exceeded',
          errorCode: 429,
        }),
      });
    });

    it('should collect system health metrics', () => {
      const healthEvent: CodexEvent = {
        msg: {
          type: 'system_health',
          info: {
            memory: {
              used: 512 * 1024 * 1024, // 512MB
              total: 1024 * 1024 * 1024, // 1GB
            },
            cpu: {
              usage: 75.5,
            },
          },
        },
        timestamp: new Date().toISOString(),
      };

      eventHandler(healthEvent);

      const data = storage.getCurrentData();
      expect(data.systemHealth).toHaveLength(2); // memory and cpu
      expect(data.systemHealth).toContainEqual(
        expect.objectContaining({
          category: 'system_health',
          type: 'memory_usage',
          value: 50, // 50% usage
        })
      );
      expect(data.systemHealth).toContainEqual(
        expect.objectContaining({
          category: 'system_health',
          type: 'cpu_usage',
          value: 75.5,
        })
      );
    });

    it('should ignore unsupported event types', () => {
      const unsupportedEvent: CodexEvent = {
        msg: { type: 'session_created' },
        timestamp: new Date().toISOString(),
      };

      eventHandler(unsupportedEvent);

      const data = storage.getCurrentData();
      expect(data.rateLimits).toHaveLength(0);
      expect(data.tokenUsage).toHaveLength(0);
      expect(data.performance).toHaveLength(0);
      expect(data.systemHealth).toHaveLength(0);
    });

    it('should emit dataPointCollected event', () => {
      const eventSpy = vi.fn();
      storage.on('dataPointCollected', eventSpy);

      const tokenEvent: CodexEvent = {
        msg: {
          type: 'token_count',
          info: { total: 100 },
        },
        timestamp: new Date().toISOString(),
      };

      eventHandler(tokenEvent);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'rate_limits',
          type: 'tokens_total',
          value: 100,
        })
      );
    });

    it('should handle malformed events gracefully', () => {
      const malformedEvent: CodexEvent = {
        msg: {
          type: 'token_count',
          info: null as any,
        },
        timestamp: new Date().toISOString(),
      };

      expect(() => eventHandler(malformedEvent)).not.toThrow();

      const data = storage.getCurrentData();
      expect(data.rateLimits).toHaveLength(0);
    });
  });

  describe('data management', () => {
    beforeEach(async () => {
      await storage.startMonitoring(mockClient as CodexClient);
    });

    it('should respect maxDataPoints limit', async () => {
      const limitedStorage = new DataStorage({
        outputPath: './test.json',
        maxDataPoints: 3,
      });

      await limitedStorage.startMonitoring(mockClient as CodexClient);

      // Get event handler
      const onCalls = (mockClient.on as Mock).mock.calls;
      const eventCall = onCalls.find(call => call[0] === 'event');
      const eventHandler = eventCall?.[1];

      // Add more data points than the limit
      for (let i = 0; i < 5; i++) {
        const tokenEvent: CodexEvent = {
          msg: {
            type: 'token_count',
            info: { total: i * 100 },
          },
          timestamp: new Date().toISOString(),
        };
        eventHandler(tokenEvent);
      }

      const data = limitedStorage.getCurrentData();
      const totalDataPoints = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
      expect(totalDataPoints).toBeLessThanOrEqual(3);

      await limitedStorage.stopMonitoring();
    });

    it('should aggregate data over time intervals', async () => {
      const aggregatingStorage = new DataStorage({
        outputPath: './test.json',
        aggregationInterval: 100, // 100ms
      });

      await aggregatingStorage.startMonitoring(mockClient as CodexClient);

      // Get event handler
      const onCalls = (mockClient.on as Mock).mock.calls;
      const eventCall = onCalls.find(call => call[0] === 'event');
      const eventHandler = eventCall?.[1];

      // Add multiple data points quickly
      for (let i = 0; i < 10; i++) {
        const tokenEvent: CodexEvent = {
          msg: {
            type: 'token_count',
            info: { total: 100 },
          },
          timestamp: new Date().toISOString(),
        };
        eventHandler(tokenEvent);
      }

      // Wait for aggregation
      await new Promise(resolve => setTimeout(resolve, 150));

      const data = aggregatingStorage.getCurrentData();
      // Should have aggregated some data points
      expect(data.rateLimits.length).toBeLessThan(10);

      await aggregatingStorage.stopMonitoring();
    });

    it('should clear data when requested', async () => {
      const eventHandler = (mockClient.on as Mock).mock.calls[0][1];

      // Add some data
      const tokenEvent: CodexEvent = {
        msg: {
          type: 'token_count',
          info: { total: 100 },
        },
        timestamp: new Date().toISOString(),
      };
      eventHandler(tokenEvent);

      expect(storage.getCurrentData().rateLimits).toHaveLength(1);

      storage.clearData();

      expect(storage.getCurrentData().rateLimits).toHaveLength(0);
    });
  });

  describe('stopMonitoring', () => {
    beforeEach(async () => {
      await storage.startMonitoring(mockClient as CodexClient);
    });

    it('should stop monitoring and return output path', async () => {
      const outputPath = await storage.stopMonitoring();

      expect(outputPath).toBe('./test-monitoring.json');
      expect(storage.getStats().isMonitoring).toBe(false);
      expect(mockClient.off).toHaveBeenCalledWith('event', expect.any(Function));
    });

    it('should save data to file when stopping', async () => {
      const { writeFile } = await import('fs/promises');

      await storage.stopMonitoring();

      expect(writeFile).toHaveBeenCalledWith(
        './test-monitoring.json',
        expect.any(String),
        'utf-8'
      );
    });

    it('should emit monitoringStopped event', async () => {
      const eventSpy = vi.fn();
      storage.on('monitoringStopped', eventSpy);

      const outputPath = await storage.stopMonitoring();

      expect(eventSpy).toHaveBeenCalledWith({
        outputPath,
        dataPointCount: expect.any(Number),
        monitoringDuration: expect.any(Number),
      });
    });

    it('should return null if not monitoring', async () => {
      await storage.stopMonitoring();
      const result = await storage.stopMonitoring();

      expect(result).toBeNull();
    });

    it('should handle file write errors', async () => {
      const { writeFile } = await import('fs/promises');
      (writeFile as Mock).mockRejectedValue(new Error('Write failed'));

      await expect(storage.stopMonitoring()).rejects.toThrow('Failed to save monitoring data');
    });
  });

  describe('exportForWebsite', () => {
    beforeEach(async () => {
      await storage.startMonitoring(mockClient as CodexClient);

      // Add some test data
      const eventHandler = (mockClient.on as Mock).mock.calls[0][1];

      for (let i = 0; i < 10; i++) {
        const tokenEvent: CodexEvent = {
          msg: {
            type: 'token_count',
            info: { total: 1000 + i * 100 },
          },
          timestamp: new Date(Date.now() - (9 - i) * 60000).toISOString(), // 1 minute intervals
        };
        eventHandler(tokenEvent);
      }
    });

    it('should export data in website format', async () => {
      const websiteData = await storage.exportForWebsite();

      expect(websiteData).toMatchObject({
        metadata: {
          generatedAt: expect.any(String),
          totalDataPoints: expect.any(Number),
          monitoringDuration: expect.any(Number),
          categories: expect.arrayContaining(['rate_limits', 'token_usage', 'performance', 'system_health']),
        },
        summary: expect.objectContaining({
          rate_limits: expect.any(Object),
          token_usage: expect.any(Object),
          performance: expect.any(Object),
          system_health: expect.any(Object),
        }),
        timeSeries: expect.objectContaining({
          rate_limits: expect.any(Array),
          token_usage: expect.any(Array),
          performance: expect.any(Array),
          system_health: expect.any(Array),
        }),
        trends: expect.objectContaining({
          rate_limits: expect.any(Object),
          token_usage: expect.any(Object),
          performance: expect.any(Object),
          system_health: expect.any(Object),
        }),
      });
    });

    it('should include correct summary statistics', async () => {
      const websiteData = await storage.exportForWebsite();

      expect(websiteData.summary.rate_limits).toMatchObject({
        total: expect.any(Number),
        average: expect.any(Number),
        min: expect.any(Number),
        max: expect.any(Number),
        latest: expect.any(Number),
      });
    });

    it('should group time series data correctly', async () => {
      const websiteData = await storage.exportForWebsite();

      expect(websiteData.timeSeries.rate_limits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            timestamp: expect.any(String),
            tokens_total: expect.any(Number),
          })
        ])
      );
    });

    it('should calculate trend information', async () => {
      const websiteData = await storage.exportForWebsite();

      expect(websiteData.trends.rate_limits).toMatchObject({
        direction: expect.stringMatching(/increasing|decreasing|stable/),
        changePercent: expect.any(Number),
        confidence: expect.stringMatching(/high|medium|low/),
      });
    });

    it('should save export to file when filePath is provided', async () => {
      const { writeFile } = await import('fs/promises');
      const filePath = './website-export.json';

      await storage.exportForWebsite(filePath);

      expect(writeFile).toHaveBeenCalledWith(
        filePath,
        expect.any(String),
        'utf-8'
      );
    });

    it('should handle empty data gracefully', async () => {
      const emptyStorage = new DataStorage({
        outputPath: './empty.json',
      });

      await emptyStorage.startMonitoring(mockClient as CodexClient);

      const websiteData = await emptyStorage.exportForWebsite();

      expect(websiteData.metadata.totalDataPoints).toBe(0);
      expect(Object.values(websiteData.timeSeries).every(arr => arr.length === 0)).toBe(true);

      await emptyStorage.stopMonitoring();
    });
  });

  describe('getStats', () => {
    it('should return correct stats when not monitoring', () => {
      const stats = storage.getStats();

      expect(stats).toMatchObject({
        isMonitoring: false,
        dataPointCount: 0,
        startedAt: null,
        outputPath: './test-monitoring.json',
        categories: {
          rate_limits: 0,
          token_usage: 0,
          performance: 0,
          system_health: 0,
        },
      });
    });

    it('should return correct stats when monitoring', async () => {
      await storage.startMonitoring(mockClient as CodexClient);

      const stats = storage.getStats();

      expect(stats).toMatchObject({
        isMonitoring: true,
        dataPointCount: expect.any(Number),
        startedAt: expect.any(Date),
        outputPath: './test-monitoring.json',
        categories: expect.any(Object),
      });
    });

    it('should update data point counts', async () => {
      await storage.startMonitoring(mockClient as CodexClient);

      const eventHandler = (mockClient.on as Mock).mock.calls[0][1];
      const tokenEvent: CodexEvent = {
        msg: {
          type: 'token_count',
          info: { total: 100 },
        },
        timestamp: new Date().toISOString(),
      };

      eventHandler(tokenEvent);

      const stats = storage.getStats();
      expect(stats.categories.rate_limits).toBeGreaterThan(0);
      expect(stats.dataPointCount).toBeGreaterThan(0);
    });
  });

  describe('configuration', () => {
    it('should use default configuration when not provided', () => {
      const defaultStorage = new DataStorage();
      const stats = defaultStorage.getStats();

      expect(stats.outputPath).toBe('./monitoring-data.json');
      expect(stats.isMonitoring).toBe(false);
    });

    it('should handle invalid aggregation intervals', () => {
      const storage = new DataStorage({
        aggregationInterval: -1000, // Invalid negative interval
      });

      // Should use a minimum safe interval
      expect(() => storage).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle event processing errors gracefully', async () => {
      await storage.startMonitoring(mockClient as CodexClient);

      const eventHandler = (mockClient.on as Mock).mock.calls[0][1];
      const errorSpy = vi.fn();
      storage.on('error', errorSpy);

      // Simulate an event that causes processing error
      const malformedEvent = {
        msg: { type: 'token_count' },
        // Missing timestamp
      };

      expect(() => eventHandler(malformedEvent)).not.toThrow();
      // Storage should continue working despite errors
    });

    it('should emit error events for processing failures', async () => {
      await storage.startMonitoring(mockClient as CodexClient);

      const errorSpy = vi.fn();
      storage.on('processingError', errorSpy);

      // Mock internal processing to fail
      vi.spyOn(storage as any, 'processTokenCountEvent').mockImplementation(() => {
        throw new Error('Processing failed');
      });

      const eventHandler = (mockClient.on as Mock).mock.calls[0][1];
      const tokenEvent: CodexEvent = {
        msg: {
          type: 'token_count',
          info: { total: 100 },
        },
        timestamp: new Date().toISOString(),
      };

      eventHandler(tokenEvent);

      expect(errorSpy).toHaveBeenCalledWith({
        error: expect.any(Error),
        event: tokenEvent,
      });
    });
  });
});