import type { AnalysisResult } from './RateLimitAnalyzer';
interface MockDataPoint {
    timestamp: number;
    model: string;
    queryLatency: number;
    rateLimits: {
        primary: {
            used_percent: number;
            window_minutes: number;
            resets_in_seconds: number;
        };
        secondary: {
            used_percent: number;
            window_minutes: number;
            resets_in_seconds: number;
        };
    };
}
/**
 * Report generation options
 */
export interface ReportOptions {
    title?: string;
    theme?: 'light' | 'dark';
    includeRawData?: boolean;
    chartHeight?: number;
}
/**
 * Generates HTML reports with interactive charts for rate limit analysis
 */
export declare class RateLimitReportGenerator {
    /**
     * Generate a complete HTML report
     */
    generateReport(dataPoints: MockDataPoint[], analysis: AnalysisResult, options?: ReportOptions): string;
    /**
     * Prepare data for Chart.js visualization
     */
    private prepareChartData;
    /**
     * Generate summary section HTML
     */
    private generateSummarySection;
    /**
     * Generate chart section HTML
     */
    private generateChartSection;
    /**
     * Generate statistics section HTML
     */
    private generateStatisticsSection;
    /**
     * Generate raw data section HTML
     */
    private generateRawDataSection;
    /**
     * Get CSS styles for the report
     */
    private getStyles;
    /**
     * Get JavaScript for Chart.js
     */
    private getChartScript;
}
export {};
