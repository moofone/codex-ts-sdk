import { describe, it, expect } from 'vitest';
import { RateLimitAnalyzer } from '../../src/monitoring/RateLimitAnalyzer';

describe('RateLimitAnalyzer', () => {
  const analyzer = new RateLimitAnalyzer();

  const createMockDataPoint = (timestamp: number, primaryUsed: number, secondaryUsed: number) => ({
    timestamp,
    model: 'test-model',
    queryLatency: 100,
    rateLimits: {
      primary: {
        used_percent: primaryUsed,
        window_minutes: 60,
        resets_in_seconds: 3600
      },
      secondary: {
        used_percent: secondaryUsed,
        window_minutes: 1440,
        resets_in_seconds: 86400
      }
    }
  });

  describe('analyzeData', () => {
    it('should throw error when no data points provided', () => {
      expect(() => analyzer.analyzeData([])).toThrow('No data points provided for analysis');
    });

    it('should analyze single data point', () => {
      const dataPoint = createMockDataPoint(Date.now(), 30, 20);
      const result = analyzer.analyzeData([dataPoint]);

      expect(result.timeSpan.dataPoints).toBe(1);
      expect(result.primary.current).toBe(30);
      expect(result.secondary.current).toBe(20);
      expect(result.summary.status).toBe('safe');
    });

    it('should sort data points by timestamp', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now + 2000, 50, 40),
        createMockDataPoint(now, 30, 20),
        createMockDataPoint(now + 1000, 40, 30)
      ];

      const result = analyzer.analyzeData(dataPoints);
      expect(result.timeSpan.start).toBe(now);
      expect(result.timeSpan.end).toBe(now + 2000);
    });

    it('should calculate correct statistics', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 10, 5),
        createMockDataPoint(now + 1000, 20, 10),
        createMockDataPoint(now + 2000, 30, 15),
        createMockDataPoint(now + 3000, 40, 20)
      ];

      const result = analyzer.analyzeData(dataPoints);

      expect(result.primary.current).toBe(40);
      expect(result.primary.average).toBe(25);
      expect(result.primary.minimum).toBe(10);
      expect(result.primary.maximum).toBe(40);

      expect(result.secondary.current).toBe(20);
      expect(result.secondary.average).toBe(12.5);
      expect(result.secondary.minimum).toBe(5);
      expect(result.secondary.maximum).toBe(20);
    });

    it('should detect increasing trend', () => {
      const now = Date.now();
      const dataPoints = [];
      for (let i = 0; i < 10; i++) {
        dataPoints.push(createMockDataPoint(now + i * 3600000, i * 10, i * 5));
      }

      const result = analyzer.analyzeData(dataPoints);
      expect(result.primary.trend.direction).toBe('increasing');
      expect(result.secondary.trend.direction).toBe('increasing');
    });

    it('should detect decreasing trend', () => {
      const now = Date.now();
      const dataPoints = [];
      for (let i = 0; i < 10; i++) {
        dataPoints.push(createMockDataPoint(now + i * 3600000, 90 - i * 10, 45 - i * 5));
      }

      const result = analyzer.analyzeData(dataPoints);
      expect(result.primary.trend.direction).toBe('decreasing');
      expect(result.secondary.trend.direction).toBe('decreasing');
    });

  });

  describe('projection analysis', () => {
    it('should generate projection for increasing trend', () => {
      const now = Date.now();
      const dataPoints = [];
      for (let i = 0; i < 10; i++) {
        dataPoints.push(createMockDataPoint(now + i * 3600000, i * 5, i * 3));
      }

      const result = analyzer.analyzeData(dataPoints);
      expect(result.primary.projection).toBeDefined();
      expect(result.primary.projection?.exhaustionTime).toBeGreaterThan(now);
      expect(result.primary.projection?.daysUntilExhaustion).toBeGreaterThan(0);
    });

    it('should not generate projection for decreasing trend', () => {
      const now = Date.now();
      const dataPoints = [];
      for (let i = 0; i < 10; i++) {
        dataPoints.push(createMockDataPoint(now + i * 3600000, 90 - i * 5, 45 - i * 3));
      }

      const result = analyzer.analyzeData(dataPoints);
      expect(result.primary.projection).toBeUndefined();
      expect(result.secondary.projection).toBeUndefined();
    });

    it('should handle usage at 100%', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 80, 70),
        createMockDataPoint(now + 3600000, 90, 80),
        createMockDataPoint(now + 7200000, 100, 90)
      ];

      const result = analyzer.analyzeData(dataPoints);
      if (result.primary.projection) {
        expect(result.primary.projection.daysUntilExhaustion).toBe(0);
        expect(result.primary.projection.reliability).toBe('high');
      }
    });

    it('should set appropriate reliability levels', () => {
      const now = Date.now();
      const dataPoints = [];

      // High confidence trend
      for (let i = 0; i < 20; i++) {
        dataPoints.push(createMockDataPoint(now + i * 3600000, i * 3, i * 2));
      }

      const result = analyzer.analyzeData(dataPoints);
      if (result.primary.projection) {
        expect(result.primary.projection.reliability).toBe('high');
      }
    });
  });

  describe('summary generation', () => {
    it('should generate safe status for low usage', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 10, 5),
        createMockDataPoint(now + 3600000, 11, 5.5),
        createMockDataPoint(now + 7200000, 10.5, 5.2)  // Very slight fluctuation, not increasing trend
      ];

      const result = analyzer.analyzeData(dataPoints);
      expect(result.summary.status).toBe('safe');
      expect(result.summary.primaryConcern).toBe('Usage levels are within safe limits');
      expect(result.summary.recommendations).toContain('Continue monitoring usage patterns');
    });

    it('should generate warning status for elevated usage', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 62, 45),
        createMockDataPoint(now + 3600000, 63, 46),
        createMockDataPoint(now + 7200000, 62.5, 45.5)  // Stable around 62%, triggers warning but not critical
      ];

      const result = analyzer.analyzeData(dataPoints);
      expect(result.summary.status).toBe('warning');
      expect(result.summary.primaryConcern).toContain('elevated');
      expect(result.summary.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate critical status for high usage', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 75, 65),
        createMockDataPoint(now + 3600000, 80, 70),
        createMockDataPoint(now + 7200000, 85, 75)
      ];

      const result = analyzer.analyzeData(dataPoints);
      expect(result.summary.status).toBe('critical');
      expect(result.summary.primaryConcern).toContain('exhaustion');
      expect(result.summary.recommendations).toContain('URGENT: Implement immediate rate limiting measures');
    });

    it('should prioritize primary rate limit in concerns', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 85, 30),
        createMockDataPoint(now + 3600000, 90, 35)
      ];

      const result = analyzer.analyzeData(dataPoints);
      expect(result.summary.primaryConcern).toContain('Primary');
    });

    it('should prioritize secondary rate limit when applicable', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 30, 85),
        createMockDataPoint(now + 3600000, 31, 86),
        createMockDataPoint(now + 7200000, 30.5, 85.5)  // Secondary stays high and critical
      ];

      const result = analyzer.analyzeData(dataPoints);
      expect(result.summary.primaryConcern).toContain('Secondary');
    });
  });

  describe('linear regression', () => {
    it('should handle single data point', () => {
      const dataPoint = createMockDataPoint(Date.now(), 50, 25);
      const result = analyzer.analyzeData([dataPoint]);

      expect(result.primary.trend.regression.slope).toBe(0);
      expect(result.primary.trend.regression.intercept).toBe(50);
      expect(result.primary.trend.regression.rSquared).toBe(0);
    });

    it('should calculate correct linear regression for perfect linear data', () => {
      const now = Date.now();
      const dataPoints = [];
      for (let i = 0; i < 10; i++) {
        dataPoints.push(createMockDataPoint(now + i * 3600000, 10 + i * 5, 5 + i * 2));
      }

      const result = analyzer.analyzeData(dataPoints);
      expect(result.primary.trend.regression.rSquared).toBeCloseTo(1, 1);
      expect(result.primary.trend.confidence).toBeCloseTo(1, 1);
    });

    it('should handle data with no variance', () => {
      const now = Date.now();
      const dataPoints = [];
      for (let i = 0; i < 5; i++) {
        dataPoints.push(createMockDataPoint(now + i * 3600000, 50, 25));
      }

      const result = analyzer.analyzeData(dataPoints);
      expect(result.primary.trend.regression.slope).toBeCloseTo(0, 5);
      expect(result.primary.trend.direction).toBe('stable');
    });

    it('should handle NaN and edge cases gracefully', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 0, 0),
        createMockDataPoint(now, 0, 0) // Same timestamp
      ];

      const result = analyzer.analyzeData(dataPoints);
      expect(result.primary.trend.regression.slope).toBeDefined();
      expect(result.primary.trend.regression.intercept).toBeDefined();
      expect(result.primary.trend.regression.rSquared).toBeDefined();
      expect(isNaN(result.primary.trend.regression.slope)).toBe(false);
    });
  });

  describe('time calculations', () => {
    it('should calculate time span correctly', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 10, 5),
        createMockDataPoint(now + 3600000, 20, 10), // 1 hour later
        createMockDataPoint(now + 7200000, 30, 15)  // 2 hours later
      ];

      const result = analyzer.analyzeData(dataPoints);
      expect(result.timeSpan.hours).toBeCloseTo(2, 1);
      expect(result.timeSpan.dataPoints).toBe(3);
    });

    it('should handle daily change calculation', () => {
      const now = Date.now();
      const dataPoints = [];
      // Create 24 hours of data with steady increase
      for (let i = 0; i <= 24; i++) {
        dataPoints.push(createMockDataPoint(now + i * 3600000, i * 2, i));
      }

      const result = analyzer.analyzeData(dataPoints);
      expect(result.primary.trend.dailyChangePercent).toBeGreaterThan(0);
      expect(result.secondary.trend.dailyChangePercent).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle missing rate limit data gracefully', () => {
      const now = Date.now();
      const dataPoint = {
        timestamp: now,
        model: 'test-model',
        queryLatency: 100,
        rateLimits: {
          primary: null as any,
          secondary: null as any
        }
      };

      const result = analyzer.analyzeData([dataPoint]);
      expect(result.primary.current).toBe(0);
      expect(result.secondary.current).toBe(0);
    });

    it('should handle very large datasets', () => {
      const now = Date.now();
      const dataPoints = [];
      for (let i = 0; i < 1000; i++) {
        dataPoints.push(createMockDataPoint(now + i * 60000, Math.random() * 100, Math.random() * 50));
      }

      const result = analyzer.analyzeData(dataPoints);
      expect(result).toBeDefined();
      expect(result.timeSpan.dataPoints).toBe(1000);
    });

    it('should handle projection with low confidence', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 30, 20),
        createMockDataPoint(now + 3600000, 35, 18),  // Inconsistent changes
        createMockDataPoint(now + 7200000, 32, 22),  // More variance
        createMockDataPoint(now + 10800000, 36, 19),
        createMockDataPoint(now + 14400000, 33, 21)
      ];

      const result = analyzer.analyzeData(dataPoints);

      // Inconsistent data should result in low confidence
      if (result.primary.projection) {
        expect(result.primary.projection.reliability).toBe('low');
      }
    });
  });
});