import { describe, it, expect } from 'vitest';
import { RateLimitReportGenerator } from '../../src/monitoring/ReportGenerator';
import type { AnalysisResult } from '../../src/monitoring/RateLimitAnalyzer';

describe('RateLimitReportGenerator', () => {
  const generator = new RateLimitReportGenerator();

  const createMockDataPoint = (timestamp: number, primaryUsed: number, secondaryUsed: number) => ({
    timestamp,
    model: 'test-model',
    queryLatency: 100 + Math.random() * 50,
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

  const createMockAnalysis = (status: 'safe' | 'warning' | 'critical' = 'safe'): AnalysisResult => ({
    timeSpan: {
      start: Date.now() - 7200000,
      end: Date.now(),
      hours: 2,
      dataPoints: 10
    },
    primary: {
      current: 45,
      average: 40,
      minimum: 30,
      maximum: 50,
      trend: {
        direction: 'increasing',
        confidence: 0.85,
        dailyChangePercent: 5.2,
        regression: {
          slope: 0.5,
          intercept: 30,
          rSquared: 0.85,
          equation: 'y = 0.5x + 30'
        }
      },
      projection: {
        exhaustionTime: Date.now() + 86400000,
        daysUntilExhaustion: 1,
        confidenceLevel: 0.85,
        reliability: 'high'
      }
    },
    secondary: {
      current: 25,
      average: 20,
      minimum: 15,
      maximum: 30,
      trend: {
        direction: 'stable',
        confidence: 0.95,
        dailyChangePercent: 0.1,
        regression: {
          slope: 0.01,
          intercept: 20,
          rSquared: 0.95,
          equation: 'y = 0.01x + 20'
        }
      }
    },
    summary: {
      status,
      primaryConcern: status === 'critical' ? 'Primary rate limit approaching exhaustion' :
                      status === 'warning' ? 'Primary rate limit usage elevated' :
                      'Usage levels are within safe limits',
      recommendations: status === 'safe' ?
        ['Continue monitoring usage patterns', 'Current usage levels are sustainable'] :
        ['Reduce request frequency during peak hours', 'Implement request batching where possible']
    }
  });

  describe('generateReport', () => {
    it('should generate a complete HTML report', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now - 3600000, 30, 20),
        createMockDataPoint(now - 1800000, 35, 22),
        createMockDataPoint(now, 40, 25)
      ];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('<!DOCTYPE html>');
      expect(report).toContain('<html lang="en">');
      expect(report).toContain('Rate Limit Analysis Report');
      expect(report).toContain('chart.js');
    });

    it('should include custom title when provided', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis, {
        title: 'Custom Test Report'
      });

      expect(report).toContain('<title>Custom Test Report</title>');
      expect(report).toContain('<h1>Custom Test Report</h1>');
    });

    it('should apply dark theme styles', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis, {
        theme: 'dark'
      });

      expect(report).toContain('background-color: #1a1a1a');
      expect(report).toContain('color: #e0e0e0');
    });

    it('should apply light theme styles', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis, {
        theme: 'light'
      });

      expect(report).toContain('background-color: #ffffff');
      expect(report).toContain('color: #333333');
    });

    it('should include raw data section when requested', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now - 3600000, 30, 20),
        createMockDataPoint(now, 40, 25)
      ];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis, {
        includeRawData: true
      });

      expect(report).toContain('Raw Data');
      expect(report).toContain('<table>');
      expect(report).toContain('Timestamp');
      expect(report).toContain('Primary Usage');
      expect(report).toContain('Secondary Usage');
    });

    it('should not include raw data section by default', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).not.toContain('Raw Data');
      expect(report).not.toContain('<th>Timestamp</th>');
    });

    it('should use custom chart height', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis, {
        chartHeight: 600
      });

      expect(report).toContain('height="600"');
    });
  });

  describe('summary section', () => {
    it('should display safe status correctly', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis('safe');

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('✅');
      expect(report).toContain('Status: SAFE');
      expect(report).toContain('status-safe');
      expect(report).toContain('Usage levels are within safe limits');
    });

    it('should display warning status correctly', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 65, 55)];
      const analysis = createMockAnalysis('warning');

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('⚠️');
      expect(report).toContain('Status: WARNING');
      expect(report).toContain('status-warning');
    });

    it('should display critical status correctly', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 85, 75)];
      const analysis = createMockAnalysis('critical');

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('🚨');
      expect(report).toContain('Status: CRITICAL');
      expect(report).toContain('status-critical');
      expect(report).toContain('approaching exhaustion');
    });

    it('should display all recommendations', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis('warning');

      const report = generator.generateReport(dataPoints, analysis);

      analysis.summary.recommendations.forEach(rec => {
        expect(report).toContain(rec);
      });
    });
  });

  describe('statistics section', () => {
    it('should display primary rate limit statistics', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 45, 25)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('Primary Rate Limit');
      expect(report).toContain('45.0%'); // Current usage
      expect(report).toContain('40.0%'); // Average
      expect(report).toContain('30.0% - 50.0%'); // Range
      expect(report).toContain('increasing'); // Trend
      expect(report).toContain('5.20%/day'); // Daily change
      expect(report).toContain('85.0%'); // Confidence
    });

    it('should display secondary rate limit statistics', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 45, 25)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('Secondary Rate Limit');
      expect(report).toContain('25.0%'); // Current usage
      expect(report).toContain('20.0%'); // Average
      expect(report).toContain('15.0% - 30.0%'); // Range
      expect(report).toContain('stable'); // Trend
    });

    it('should format projection correctly', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 45, 25)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('Exhaustion Projection:');
      expect(report).toContain('1.0 days'); // Days until exhaustion
    });

    it('should handle missing projection', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 45, 25)];
      const analysis = createMockAnalysis();
      analysis.primary.projection = undefined;

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('Not projected');
    });

    it('should display data overview', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 45, 25)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('Data Overview');
      expect(report).toContain('2.0 hours'); // Time span
      expect(report).toContain('10'); // Data points count
    });
  });

  describe('chart generation', () => {
    it('should include Chart.js initialization script', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('new Chart(ctx');
      expect(report).toContain("getElementById('usageChart')");
      expect(report).toContain("type: 'line'");
    });

    it('should include both datasets', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('Primary Rate Limit (%)');
      expect(report).toContain('Secondary Rate Limit (%)');
    });

    it('should sort data points chronologically', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now, 40, 25),
        createMockDataPoint(now - 3600000, 30, 20),
        createMockDataPoint(now - 1800000, 35, 22)
      ];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      // Check that data arrays in script are sorted
      const primaryMatch = report.match(/data: (\[[^\]]+\])/);
      if (primaryMatch) {
        const primaryData = JSON.parse(primaryMatch[1]);
        expect(primaryData).toEqual([30, 35, 40]);
      }
    });

    it('should apply theme colors to chart', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const darkReport = generator.generateReport(dataPoints, analysis, { theme: 'dark' });
      const lightReport = generator.generateReport(dataPoints, analysis, { theme: 'light' });

      expect(darkReport).toContain('#4fc3f7'); // Dark theme primary color
      expect(lightReport).toContain('#2196f3'); // Light theme primary color
    });
  });

  describe('raw data table', () => {
    it('should display data in reverse chronological order', () => {
      const now = Date.now();
      const dataPoints = [
        createMockDataPoint(now - 7200000, 30, 20),
        createMockDataPoint(now - 3600000, 35, 22),
        createMockDataPoint(now, 40, 25)
      ];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis, {
        includeRawData: true
      });

      // Most recent should appear first in table
      const tableSection = report.match(/<tbody>([\s\S]*)<\/tbody>/);
      if (tableSection) {
        const rows = tableSection[1].match(/<tr>/g);
        expect(rows).toHaveLength(3);
      }
    });

    it('should format values correctly in raw data table', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 45.678, 23.456)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis, {
        includeRawData: true
      });

      expect(report).toContain('45.7%'); // Primary usage rounded
      expect(report).toContain('23.5%'); // Secondary usage rounded
      expect(report).toContain('test-model'); // Model name
    });

    it('should handle missing values in raw data', () => {
      const dataPoint = {
        timestamp: Date.now(),
        model: 'test-model',
        queryLatency: null as any,
        rateLimits: {
          primary: null as any,
          secondary: null as any
        }
      };
      const analysis = createMockAnalysis();

      const report = generator.generateReport([dataPoint], analysis, {
        includeRawData: true
      });

      expect(report).toContain('0.0%'); // Default to 0 for null percentages
      expect(report).toContain('N/A'); // N/A for null latency
    });
  });

  describe('responsive design', () => {
    it('should include responsive CSS rules', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('@media (max-width: 768px)');
      expect(report).toContain('grid-template-columns: 1fr');
      expect(report).toContain('flex-direction: column');
    });

    it('should include viewport meta tag', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('<meta name="viewport"');
      expect(report).toContain('width=device-width, initial-scale=1.0');
    });
  });

  describe('chart legend', () => {
    it('should include visual chart legend', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('chart-legend');
      expect(report).toContain('Primary Rate Limit (60 min window)');
      expect(report).toContain('Secondary Rate Limit (7 day window)');
      expect(report).toContain('legend-color primary');
      expect(report).toContain('legend-color secondary');
    });
  });

  describe('footer', () => {
    it('should include footer with attribution', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('<footer>');
      expect(report).toContain('Generated by Rate Limit Monitoring System');
    });
  });

  describe('timestamp formatting', () => {
    it('should include generation timestamp', () => {
      const dataPoints = [createMockDataPoint(Date.now(), 30, 20)];
      const analysis = createMockAnalysis();

      const report = generator.generateReport(dataPoints, analysis);

      expect(report).toContain('Generated on');
      expect(report).toContain(new Date().getFullYear().toString());
    });
  });
});