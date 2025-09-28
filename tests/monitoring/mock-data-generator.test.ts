import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MockDataGenerator } from '../../src/monitoring/MockDataGenerator';
import type { WebsiteExportFormat, MonitoringScenario } from '../../src/types/monitoring';

// Mock filesystem operations
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock path operations
vi.mock('path', () => ({
  resolve: vi.fn((path: string) => path),
  dirname: vi.fn().mockReturnValue('/test'),
}));

describe('MockDataGenerator', () => {
  let generator: MockDataGenerator;

  beforeEach(() => {
    vi.clearAllMocks();

    generator = new MockDataGenerator({
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
  });

  describe('generateMockData', () => {
    it('should generate mock data for normal scenario', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'normal',
        duration: 60000, // 1 minute
        interval: 10000, // 10 seconds
      });

      expect(mockData).toMatchObject({
        metadata: {
          generatedAt: expect.any(String),
          totalDataPoints: expect.any(Number),
          monitoringDuration: 60000,
          categories: expect.arrayContaining(['rate_limits', 'token_usage', 'performance', 'system_health']),
          scenario: 'normal',
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

    it('should generate different data for heavy usage scenario', async () => {
      const heavyData = await generator.generateMockData({
        scenario: 'heavy_usage',
        duration: 30000,
        interval: 5000,
      });

      const normalData = await generator.generateMockData({
        scenario: 'normal',
        duration: 30000,
        interval: 5000,
      });

      // Heavy usage should have higher token counts and request rates
      expect(heavyData.summary.rate_limits.average).toBeGreaterThan(
        normalData.summary.rate_limits.average
      );
      expect(heavyData.summary.token_usage.average).toBeGreaterThan(
        normalData.summary.token_usage.average
      );
    });

    it('should generate spike patterns for rate limit spike scenario', async () => {
      const spikeData = await generator.generateMockData({
        scenario: 'rate_limit_spike',
        duration: 60000,
        interval: 10000,
      });

      // Should have high variance in rate limits
      const rateLimitValues = spikeData.timeSeries.rate_limits.map(point =>
        point.tokens_total || 0
      );
      const variance = calculateVariance(rateLimitValues);
      expect(variance).toBeGreaterThan(1000); // Expect high variance for spikes
    });

    it('should generate low activity for quiet period scenario', async () => {
      const quietData = await generator.generateMockData({
        scenario: 'quiet_period',
        duration: 30000,
        interval: 5000,
      });

      // Should have lower averages across all metrics
      expect(quietData.summary.rate_limits.average).toBeLessThan(1000);
      expect(quietData.summary.token_usage.average).toBeLessThan(500);
      expect(quietData.summary.performance.average).toBeLessThan(100);
    });

    it('should respect duration and interval parameters', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'normal',
        duration: 120000, // 2 minutes
        interval: 30000,  // 30 seconds
      });

      // Should have approximately duration/interval data points
      const expectedPoints = Math.floor(120000 / 30000);
      expect(mockData.timeSeries.rate_limits).toHaveLength(expectedPoints);
      expect(mockData.metadata.monitoringDuration).toBe(120000);
    });

    it('should include proper timestamp progression', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'normal',
        duration: 60000,
        interval: 20000,
      });

      const timestamps = mockData.timeSeries.rate_limits.map(point =>
        new Date(point.timestamp).getTime()
      );

      // Timestamps should be in ascending order
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
        // Should be approximately interval apart
        expect(timestamps[i] - timestamps[i - 1]).toBeCloseTo(20000, -2);
      }
    });

    it('should generate different data on subsequent calls', async () => {
      const data1 = await generator.generateMockData({
        scenario: 'normal',
        duration: 30000,
        interval: 10000,
      });

      const data2 = await generator.generateMockData({
        scenario: 'normal',
        duration: 30000,
        interval: 10000,
      });

      // Data should be different (not identical)
      expect(data1.timeSeries.rate_limits[0].tokens_total).not.toBe(
        data2.timeSeries.rate_limits[0].tokens_total
      );
    });

    it('should handle edge cases with minimal duration', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'normal',
        duration: 5000,   // 5 seconds
        interval: 10000,  // 10 seconds (longer than duration)
      });

      // Should handle gracefully and generate at least some data
      expect(mockData.timeSeries.rate_limits.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('generateWebsiteData', () => {
    it('should generate and save website data to file', async () => {
      const { writeFile } = await import('fs/promises');
      const outputPath = './test-website-data.json';

      const result = await generator.generateWebsiteData({
        scenario: 'normal',
        duration: 60000,
        interval: 10000,
        outputPath,
      });

      expect(result.outputPath).toBe(outputPath);
      expect(result.dataPoints).toBeGreaterThan(0);
      expect(writeFile).toHaveBeenCalledWith(
        outputPath,
        expect.any(String),
        'utf-8'
      );
    });

    it('should use default output path when not provided', async () => {
      const { writeFile } = await import('fs/promises');

      const result = await generator.generateWebsiteData({
        scenario: 'heavy_usage',
        duration: 30000,
        interval: 5000,
      });

      expect(result.outputPath).toContain('mock-monitoring-data');
      expect(writeFile).toHaveBeenCalled();
    });

    it('should handle file write errors', async () => {
      const { writeFile } = await import('fs/promises');
      (writeFile as Mock).mockRejectedValue(new Error('Write failed'));

      await expect(
        generator.generateWebsiteData({
          scenario: 'normal',
          duration: 30000,
          interval: 5000,
          outputPath: './failed-path.json',
        })
      ).rejects.toThrow('Failed to save mock website data');
    });

    it('should create directory if it does not exist', async () => {
      const { mkdir } = await import('fs/promises');

      await generator.generateWebsiteData({
        scenario: 'normal',
        duration: 30000,
        interval: 5000,
        outputPath: './new-dir/website-data.json',
      });

      expect(mkdir).toHaveBeenCalledWith(
        '/test',
        { recursive: true }
      );
    });
  });

  describe('scenario-specific data generation', () => {
    it('should generate normal scenario with steady metrics', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'normal',
        duration: 60000,
        interval: 10000,
      });

      // Normal scenario should have moderate, stable values
      expect(mockData.summary.rate_limits.average).toBeGreaterThan(500);
      expect(mockData.summary.rate_limits.average).toBeLessThan(3000);

      expect(mockData.summary.performance.average).toBeGreaterThan(50);
      expect(mockData.summary.performance.average).toBeLessThan(200);
    });

    it('should generate heavy usage scenario with high metrics', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'heavy_usage',
        duration: 60000,
        interval: 10000,
      });

      // Heavy usage should have higher values
      expect(mockData.summary.rate_limits.average).toBeGreaterThan(2000);
      expect(mockData.summary.token_usage.average).toBeGreaterThan(1500);
      expect(mockData.summary.performance.average).toBeGreaterThan(100);

      // Should have increasing trend
      expect(mockData.trends.rate_limits.direction).toBe('increasing');
      expect(mockData.trends.token_usage.direction).toBe('increasing');
    });

    it('should generate rate limit spike scenario with volatility', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'rate_limit_spike',
        duration: 60000,
        interval: 10000,
      });

      // Should have high variance and potential trend changes
      const rateLimitMax = mockData.summary.rate_limits.max;
      const rateLimitMin = mockData.summary.rate_limits.min;
      expect(rateLimitMax - rateLimitMin).toBeGreaterThan(2000); // High range

      // Should show volatility in trends
      expect(['increasing', 'decreasing', 'stable']).toContain(
        mockData.trends.rate_limits.direction
      );
    });

    it('should generate quiet period scenario with low metrics', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'quiet_period',
        duration: 60000,
        interval: 10000,
      });

      // Quiet period should have low values
      expect(mockData.summary.rate_limits.average).toBeLessThan(1000);
      expect(mockData.summary.token_usage.average).toBeLessThan(500);
      expect(mockData.summary.performance.average).toBeLessThan(100);
      expect(mockData.summary.system_health.average).toBeGreaterThan(80); // High health
    });

    it('should generate error prone scenario with high error rates', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'error_prone',
        duration: 60000,
        interval: 10000,
      });

      // Should have degraded system health and higher error rates
      expect(mockData.summary.system_health.average).toBeLessThan(70);

      // Should have performance impacts
      expect(mockData.summary.performance.average).toBeGreaterThan(150);
    });
  });

  describe('data consistency and validation', () => {
    it('should generate data with proper structure for all categories', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'normal',
        duration: 60000,
        interval: 10000,
      });

      // All required categories should be present
      const categories = ['rate_limits', 'token_usage', 'performance', 'system_health'];

      for (const category of categories) {
        expect(mockData.summary).toHaveProperty(category);
        expect(mockData.timeSeries).toHaveProperty(category);
        expect(mockData.trends).toHaveProperty(category);

        // Summary should have required fields
        expect(mockData.summary[category]).toMatchObject({
          total: expect.any(Number),
          average: expect.any(Number),
          min: expect.any(Number),
          max: expect.any(Number),
          latest: expect.any(Number),
        });

        // Trends should have required fields
        expect(mockData.trends[category]).toMatchObject({
          direction: expect.stringMatching(/increasing|decreasing|stable/),
          changePercent: expect.any(Number),
          confidence: expect.stringMatching(/high|medium|low/),
        });
      }
    });

    it('should generate realistic value ranges', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'normal',
        duration: 60000,
        interval: 10000,
      });

      // Token values should be in reasonable ranges
      mockData.timeSeries.rate_limits.forEach(point => {
        expect(point.tokens_total).toBeGreaterThan(0);
        expect(point.tokens_total).toBeLessThan(10000);
      });

      // Performance values should be positive
      mockData.timeSeries.performance.forEach(point => {
        expect(point.api_request_duration).toBeGreaterThan(0);
        expect(point.api_request_duration).toBeLessThan(5000);
      });

      // System health should be 0-100
      mockData.timeSeries.system_health.forEach(point => {
        expect(point.system_health_score).toBeGreaterThanOrEqual(0);
        expect(point.system_health_score).toBeLessThanOrEqual(100);
      });
    });

    it('should maintain temporal consistency', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'normal',
        duration: 60000,
        interval: 10000,
      });

      // All time series should have the same number of data points
      const rateLimitsCount = mockData.timeSeries.rate_limits.length;
      expect(mockData.timeSeries.token_usage).toHaveLength(rateLimitsCount);
      expect(mockData.timeSeries.performance).toHaveLength(rateLimitsCount);
      expect(mockData.timeSeries.system_health).toHaveLength(rateLimitsCount);

      // Timestamps should align across categories
      for (let i = 0; i < rateLimitsCount; i++) {
        const timestamp = mockData.timeSeries.rate_limits[i].timestamp;
        expect(mockData.timeSeries.token_usage[i].timestamp).toBe(timestamp);
        expect(mockData.timeSeries.performance[i].timestamp).toBe(timestamp);
        expect(mockData.timeSeries.system_health[i].timestamp).toBe(timestamp);
      }
    });

    it('should calculate summary statistics correctly', async () => {
      const mockData = await generator.generateMockData({
        scenario: 'normal',
        duration: 60000,
        interval: 10000,
      });

      // Verify rate limits summary calculations
      const rateLimitValues = mockData.timeSeries.rate_limits.map(point =>
        point.tokens_total || 0
      );

      expect(mockData.summary.rate_limits.min).toBe(Math.min(...rateLimitValues));
      expect(mockData.summary.rate_limits.max).toBe(Math.max(...rateLimitValues));
      expect(mockData.summary.rate_limits.total).toBe(
        rateLimitValues.reduce((sum, val) => sum + val, 0)
      );
      expect(mockData.summary.rate_limits.average).toBeCloseTo(
        rateLimitValues.reduce((sum, val) => sum + val, 0) / rateLimitValues.length,
        1
      );
      expect(mockData.summary.rate_limits.latest).toBe(
        rateLimitValues[rateLimitValues.length - 1]
      );
    });
  });

  describe('configuration and options', () => {
    it('should handle different logger configurations', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const customGenerator = new MockDataGenerator({
        logger: mockLogger,
      });

      await customGenerator.generateMockData({
        scenario: 'normal',
        duration: 30000,
        interval: 10000,
      });

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should work without logger', async () => {
      const noLoggerGenerator = new MockDataGenerator();

      await expect(
        noLoggerGenerator.generateMockData({
          scenario: 'normal',
          duration: 30000,
          interval: 10000,
        })
      ).resolves.toBeDefined();
    });

    it('should handle invalid scenario gracefully', async () => {
      await expect(
        generator.generateMockData({
          scenario: 'invalid_scenario' as MonitoringScenario,
          duration: 30000,
          interval: 10000,
        })
      ).resolves.toBeDefined();
    });
  });
});

// Helper function for variance calculation
function calculateVariance(values: number[]): number {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
}