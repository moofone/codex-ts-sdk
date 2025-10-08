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
 * Linear regression result
 */
export interface LinearRegressionResult {
    slope: number;
    intercept: number;
    rSquared: number;
    equation: string;
}
/**
 * Trend analysis for a rate limit window
 */
export interface TrendAnalysis {
    direction: 'increasing' | 'decreasing' | 'stable';
    confidence: number;
    dailyChangePercent: number;
    regression: LinearRegressionResult;
}
/**
 * Projection analysis for exhaustion time
 */
export interface ProjectionAnalysis {
    exhaustionTime?: number;
    daysUntilExhaustion?: number;
    confidenceLevel: number;
    reliability: 'high' | 'medium' | 'low';
}
/**
 * Rate limit window analysis
 */
export interface WindowAnalysis {
    current: number;
    average: number;
    minimum: number;
    maximum: number;
    trend: TrendAnalysis;
    projection?: ProjectionAnalysis;
}
/**
 * Complete analysis result
 */
export interface AnalysisResult {
    timeSpan: {
        start: number;
        end: number;
        hours: number;
        dataPoints: number;
    };
    primary: WindowAnalysis;
    secondary: WindowAnalysis;
    summary: {
        status: 'safe' | 'warning' | 'critical';
        primaryConcern: string;
        recommendations: string[];
    };
}
/**
 * Analyzes rate limit data and provides trend analysis and projections
 */
export declare class RateLimitAnalyzer {
    /**
     * Analyze a collection of rate limit data points
     */
    analyzeData(dataPoints: MockDataPoint[]): AnalysisResult;
    /**
     * Analyze a single rate limit window
     */
    private analyzeWindow;
    /**
     * Perform linear regression and trend analysis
     */
    private analyzeTrend;
    /**
     * Perform linear regression analysis
     */
    private performLinearRegression;
    /**
     * Generate projection for exhaustion time
     */
    private generateProjection;
    /**
     * Generate analysis summary
     */
    private generateSummary;
}
export {};
