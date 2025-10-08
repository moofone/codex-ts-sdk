/**
 * Analyzes rate limit data and provides trend analysis and projections
 */
export class RateLimitAnalyzer {
    /**
     * Analyze a collection of rate limit data points
     */
    analyzeData(dataPoints) {
        if (dataPoints.length === 0) {
            throw new Error('No data points provided for analysis');
        }
        // Sort by timestamp
        const sortedPoints = [...dataPoints].sort((a, b) => a.timestamp - b.timestamp);
        const timeSpan = {
            start: sortedPoints[0].timestamp,
            end: sortedPoints[sortedPoints.length - 1].timestamp,
            hours: (sortedPoints[sortedPoints.length - 1].timestamp - sortedPoints[0].timestamp) / (1000 * 60 * 60),
            dataPoints: sortedPoints.length,
        };
        // Extract primary and secondary usage percentages
        const primaryUsage = sortedPoints.map(p => p.rateLimits.primary?.used_percent || 0);
        const secondaryUsage = sortedPoints.map(p => p.rateLimits.secondary?.used_percent || 0);
        const timestamps = sortedPoints.map(p => p.timestamp);
        // Analyze each window
        const primary = this.analyzeWindow(primaryUsage, timestamps);
        const secondary = this.analyzeWindow(secondaryUsage, timestamps);
        // Generate summary
        const summary = this.generateSummary(primary, secondary);
        return {
            timeSpan,
            primary,
            secondary,
            summary,
        };
    }
    /**
     * Analyze a single rate limit window
     */
    analyzeWindow(usage, timestamps) {
        const current = usage[usage.length - 1] || 0;
        const average = usage.reduce((sum, val) => sum + val, 0) / usage.length;
        const minimum = Math.min(...usage);
        const maximum = Math.max(...usage);
        // Perform trend analysis
        const trend = this.analyzeTrend(usage, timestamps);
        // Generate projection if trending upward
        let projection;
        if (trend.direction === 'increasing' && trend.confidence > 0.5) {
            projection = this.generateProjection(usage, timestamps, trend);
        }
        return {
            current,
            average,
            minimum,
            maximum,
            trend,
            projection,
        };
    }
    /**
     * Perform linear regression and trend analysis
     */
    analyzeTrend(usage, timestamps) {
        const regression = this.performLinearRegression(usage, timestamps);
        // Calculate daily change percentage
        const timeSpanHours = (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60);
        const dailyChangePercent = (regression.slope * 24 * 3600 * 1000) * (24 / Math.max(timeSpanHours, 1));
        // Determine direction and confidence
        let direction;
        if (Math.abs(dailyChangePercent) < 0.1) {
            direction = 'stable';
        }
        else if (dailyChangePercent > 0) {
            direction = 'increasing';
        }
        else {
            direction = 'decreasing';
        }
        const confidence = Math.min(regression.rSquared, 1.0);
        return {
            direction,
            confidence,
            dailyChangePercent: isNaN(dailyChangePercent) ? 0 : dailyChangePercent,
            regression,
        };
    }
    /**
     * Perform linear regression analysis
     */
    performLinearRegression(y, timestamps) {
        const n = y.length;
        if (n < 2) {
            return {
                slope: 0,
                intercept: y[0] || 0,
                rSquared: 0,
                equation: `y = ${y[0] || 0}`,
            };
        }
        // Convert timestamps to relative values (hours from start)
        const startTime = timestamps[0];
        const x = timestamps.map(t => (t - startTime) / (1000 * 60 * 60));
        // Calculate linear regression
        const xMean = x.reduce((sum, val) => sum + val, 0) / n;
        const yMean = y.reduce((sum, val) => sum + val, 0) / n;
        let numerator = 0;
        let denominator = 0;
        for (let i = 0; i < n; i++) {
            numerator += (x[i] - xMean) * (y[i] - yMean);
            denominator += (x[i] - xMean) ** 2;
        }
        const slope = denominator !== 0 ? numerator / denominator : 0;
        const intercept = yMean - slope * xMean;
        // Calculate R-squared
        let totalSumSquares = 0;
        let residualSumSquares = 0;
        for (let i = 0; i < n; i++) {
            const predicted = slope * x[i] + intercept;
            totalSumSquares += (y[i] - yMean) ** 2;
            residualSumSquares += (y[i] - predicted) ** 2;
        }
        const rSquared = totalSumSquares !== 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;
        return {
            slope: isNaN(slope) ? 0 : slope,
            intercept: isNaN(intercept) ? yMean : intercept,
            rSquared: isNaN(rSquared) ? 0 : Math.max(0, Math.min(1, rSquared)),
            equation: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(2)}`,
        };
    }
    /**
     * Generate projection for exhaustion time
     */
    generateProjection(usage, timestamps, trend) {
        if (trend.direction !== 'increasing' || trend.regression.slope <= 0) {
            return {
                confidenceLevel: 0,
                reliability: 'low',
            };
        }
        // Project when usage will reach 100%
        const currentUsage = usage[usage.length - 1];
        const remainingCapacity = 100 - currentUsage;
        if (remainingCapacity <= 0) {
            return {
                exhaustionTime: timestamps[timestamps.length - 1],
                daysUntilExhaustion: 0,
                confidenceLevel: 1.0,
                reliability: 'high',
            };
        }
        // Calculate hours until exhaustion based on trend
        const hoursUntilExhaustion = remainingCapacity / trend.regression.slope;
        const exhaustionTime = timestamps[timestamps.length - 1] + (hoursUntilExhaustion * 60 * 60 * 1000);
        const daysUntilExhaustion = hoursUntilExhaustion / 24;
        // Determine reliability based on R-squared and trend consistency
        let reliability = 'low';
        if (trend.confidence > 0.8) {
            reliability = 'high';
        }
        else if (trend.confidence > 0.5) {
            reliability = 'medium';
        }
        return {
            exhaustionTime: isNaN(exhaustionTime) ? undefined : exhaustionTime,
            daysUntilExhaustion: isNaN(daysUntilExhaustion) ? undefined : daysUntilExhaustion,
            confidenceLevel: trend.confidence,
            reliability,
        };
    }
    /**
     * Generate analysis summary
     */
    generateSummary(primary, secondary) {
        const primaryCritical = primary.current > 80 || (primary.projection?.daysUntilExhaustion && primary.projection.daysUntilExhaustion < 7);
        const secondaryCritical = secondary.current > 80 || (secondary.projection?.daysUntilExhaustion && secondary.projection.daysUntilExhaustion < 7);
        const primaryWarning = primary.current > 60 || (primary.projection?.daysUntilExhaustion && primary.projection.daysUntilExhaustion < 14);
        const secondaryWarning = secondary.current > 60 || (secondary.projection?.daysUntilExhaustion && secondary.projection.daysUntilExhaustion < 14);
        let status = 'safe';
        if (primaryCritical || secondaryCritical) {
            status = 'critical';
        }
        else if (primaryWarning || secondaryWarning) {
            status = 'warning';
        }
        // Determine primary concern
        let primaryConcern = 'Usage levels are within safe limits';
        if (primaryCritical) {
            primaryConcern = 'Primary rate limit approaching exhaustion';
        }
        else if (secondaryCritical) {
            primaryConcern = 'Secondary rate limit approaching exhaustion';
        }
        else if (primaryWarning) {
            primaryConcern = 'Primary rate limit usage elevated';
        }
        else if (secondaryWarning) {
            primaryConcern = 'Secondary rate limit usage elevated';
        }
        // Generate recommendations
        const recommendations = [];
        if (status === 'safe') {
            recommendations.push('Continue monitoring usage patterns');
            recommendations.push('Current usage levels are sustainable');
        }
        else {
            if (primary.trend.direction === 'increasing') {
                recommendations.push('Reduce request frequency during peak hours');
                recommendations.push('Implement request batching where possible');
            }
            if (secondary.trend.direction === 'increasing') {
                recommendations.push('Consider distributing requests across longer time periods');
                recommendations.push('Review weekly usage patterns for optimization opportunities');
            }
            if (status === 'critical') {
                recommendations.push('URGENT: Implement immediate rate limiting measures');
                recommendations.push('Monitor usage every hour until levels decrease');
            }
            else {
                recommendations.push('Schedule usage review within the next few days');
                recommendations.push('Consider implementing proactive throttling');
            }
        }
        return {
            status,
            primaryConcern,
            recommendations,
        };
    }
}
//# sourceMappingURL=RateLimitAnalyzer.js.map