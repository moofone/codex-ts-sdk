#!/usr/bin/env node

/**
 * Simple Rate Limit Analyzer
 *
 * Analyzes collected rate limit data and generates HTML reports with
 * interactive charts showing trends and projections.
 */

const fs = require('fs/promises');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const dataDir = args.find((arg, i) => args[i - 1] === '--data-dir') || '/tmp/data';
const outputFile = args.find((arg, i) => args[i - 1] === '--output') || path.join(dataDir, 'rate-limit-report.html');
const theme = args.find((arg, i) => args[i - 1] === '--theme') || 'dark';
const verbose = args.includes('--verbose');

const config = {
  dataFile: path.resolve(dataDir, 'rate-limit-data.json'),
  outputFile: path.resolve(outputFile),
  theme,
  verbose,
};

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(message, color = '') {
  const timestamp = new Date().toISOString();
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

async function loadData() {
  try {
    const fileContent = await fs.readFile(config.dataFile, 'utf8');
    const storageData = JSON.parse(fileContent);
    const data = storageData.data || [];

    log(`Loaded ${data.length} data points from ${config.dataFile}`, colors.blue);

    if (data.length === 0) {
      throw new Error('No data points found in storage file');
    }

    return data;
  } catch (error) {
    throw new Error(`Failed to load data: ${error.message}`);
  }
}

function performLinearRegression(y, timestamps) {
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

  // Use two-point regression from first to last data point for better visual fit
  const startY = y[0];
  const endY = y[y.length - 1];
  const startX = x[0]; // Should be 0
  const endX = x[x.length - 1];

  const slope = (endY - startY) / (endX - startX);
  const intercept = startY;

  // Calculate R-squared
  const yMean = y.reduce((sum, val) => sum + val, 0) / n;
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

function analyzeWindow(usage, timestamps, windowType) {
  const current = usage[usage.length - 1] || 0;
  const average = usage.reduce((sum, val) => sum + val, 0) / usage.length;
  const minimum = Math.min(...usage);
  const maximum = Math.max(...usage);

  // Perform trend analysis
  const regression = performLinearRegression(usage, timestamps);

  // Calculate daily change percentage (slope is per hour, convert to per day)
  const dailyChangePercent = regression.slope * 24;

  // Determine direction and confidence
  let direction;
  if (Math.abs(dailyChangePercent) < 0.1) {
    direction = 'stable';
  } else if (dailyChangePercent > 0) {
    direction = 'increasing';
  } else {
    direction = 'decreasing';
  }

  const confidence = Math.min(regression.rSquared, 1.0);

  const trend = {
    direction,
    confidence,
    dailyChangePercent: isNaN(dailyChangePercent) ? 0 : dailyChangePercent,
    regression,
  };

  // Only generate projection if we have 3+ days of data (72+ hours) and trending upward
  let projection;
  const timeSpanHours = (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60);
  const hasMinimumData = timeSpanHours >= 72; // 3+ days minimum for projections

  if (hasMinimumData && trend.direction === 'increasing' && trend.confidence > 0.5) {
    const remainingCapacity = 100 - current;
    if (remainingCapacity > 0) {
      const hoursUntilExhaustion = remainingCapacity / regression.slope;
      const exhaustionTime = timestamps[timestamps.length - 1] + (hoursUntilExhaustion * 60 * 60 * 1000);
      const daysUntilExhaustion = hoursUntilExhaustion / 24;

      let reliability = 'low';
      if (trend.confidence > 0.8) {
        reliability = 'high';
      } else if (trend.confidence > 0.5) {
        reliability = 'medium';
      }

      projection = {
        exhaustionTime: isNaN(exhaustionTime) ? undefined : exhaustionTime,
        daysUntilExhaustion: isNaN(daysUntilExhaustion) ? undefined : daysUntilExhaustion,
        confidenceLevel: trend.confidence,
        reliability,
      };
    }
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

function analyzeData(dataPoints) {
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

  // Extract secondary usage percentages only
  const secondaryUsage = sortedPoints.map(p => p.rateLimits.secondary?.used_percent || 0);
  const timestamps = sortedPoints.map(p => p.timestamp);

  // Analyze secondary window only
  const secondary = analyzeWindow(secondaryUsage, timestamps, 'secondary');

  // Determine status based on projection:
  // RED (critical): Projected usage at 7-day window end >= 100%
  // YELLOW (warning): Projected usage at 7-day window end between 80-100%
  // GREEN (safe): Otherwise

  const windowEndTime = timeSpan.start + (7 * 24 * 60 * 60 * 1000); // 7 days from start
  const hoursToWindowEnd = (windowEndTime - timeSpan.start) / (1000 * 60 * 60);
  const projectedUsageAtWindowEnd = (() => {
    if (!secondary.trend?.regression) return secondary.current;
    const projected = secondary.trend.regression.slope * hoursToWindowEnd + secondary.trend.regression.intercept;
    return Math.max(0, Math.min(100, projected));
  })();

  let status = 'safe';
  if (projectedUsageAtWindowEnd >= 100) {
    status = 'critical';
  } else if (projectedUsageAtWindowEnd >= 80) {
    status = 'warning';
  }

  let primaryConcern = 'Projected usage stays comfortably below 80% for the full window';
  if (status === 'critical') {
    primaryConcern = 'Projected to exhaust the secondary window before the week ends';
  } else if (status === 'warning') {
    primaryConcern = 'Projected usage approaches the 80% caution threshold';
  }

  const recommendations = [];
  if (status === 'safe') {
    recommendations.push('Continue monitoring usage patterns');
    recommendations.push('Maintain current request distribution to preserve headroom');
  } else {
    if (secondary.trend.direction === 'increasing') {
      recommendations.push('Distribute workload more evenly across the week');
      recommendations.push('Review automation and batch jobs for bursty behaviour');
    }

    if (status === 'critical') {
      recommendations.push('Trigger pre-defined rate limit mitigation playbooks immediately');
      recommendations.push('Increase monitoring frequency until usage normalises');
    } else {
      recommendations.push('Schedule a capacity review before the window ends');
      recommendations.push('Consider proactive throttling during peak intervals');
    }
  }

  const summary = {
    status,
    primaryConcern,
    recommendations,
    projectedUsageAtWindowEnd,
  };

  return {
    timeSpan,
    secondary,
    summary,
  };
}

function generateReport(dataPoints, analysis) {
  const chartData = prepareChartData(dataPoints, analysis);
  const isDark = config.theme === 'dark';

  // Generate CSS
  const colors = isDark ? {
    bg: '#1a1a1a',
    surface: '#2d2d2d',
    text: '#e0e0e0',
    textSecondary: '#b0b0b0',
    border: '#404040',
    primary: '#4fc3f7',
    secondary: '#81c784',
    warning: '#ffb74d',
    critical: '#e57373',
    safe: '#81c784',
    grid: '#404040',
  } : {
    bg: '#ffffff',
    surface: '#f8f9fa',
    text: '#333333',
    textSecondary: '#666666',
    border: '#e0e0e0',
    primary: '#2196f3',
    secondary: '#4caf50',
    warning: '#ff9800',
    critical: '#f44336',
    safe: '#4caf50',
    grid: '#e0e0e0',
  };

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: ${colors.bg}; color: ${colors.text}; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { text-align: center; margin-bottom: 30px; padding: 20px; background-color: ${colors.surface}; border-radius: 8px; border: 1px solid ${colors.border}; }
    h1 { font-size: 2.5em; margin-bottom: 10px; }
    h2 { font-size: 1.8em; margin-bottom: 20px; padding-bottom: 10px; }
    h3 { font-size: 1.3em; margin-bottom: 15px; }
    .timestamp { color: ${colors.textSecondary}; font-size: 0.9em; }
    section { margin-bottom: 40px; padding: 20px; background-color: ${colors.surface}; border-radius: 8px; border: 1px solid ${colors.border}; }
    .status { display: flex; align-items: center; gap: 10px; padding: 15px; border-radius: 6px; margin-bottom: 20px; font-weight: bold; font-size: 1.2em; }
    .status-safe { background-color: ${colors.safe}22; border: 2px solid ${colors.safe}; }
    .status-warning { background-color: ${colors.warning}22; border: 2px solid ${colors.warning}; }
    .status-critical { background-color: ${colors.critical}22; border: 2px solid ${colors.critical}; }
    .primary-concern { margin-bottom: 20px; padding: 15px; background-color: ${colors.bg}; border-radius: 4px; border-left: 4px solid ${colors.primary}; }
    .recommendations ul { list-style-position: inside; margin-left: 20px; }
    .recommendations li { margin-bottom: 8px; }
    .chart-container { margin: 20px 0; padding: 20px; background-color: ${colors.bg}; border-radius: 6px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; }
    .stat-group { padding: 20px; background-color: ${colors.bg}; border-radius: 6px; border: 1px solid ${colors.border}; }
    .stat-item { display: flex; justify-content: space-between; margin-bottom: 12px; padding: 8px 0; border-bottom: 1px solid ${colors.border}; }
    .stat-item:last-child { border-bottom: none; }
    .stat-label { color: ${colors.textSecondary}; font-weight: 500; }
    .stat-value { font-weight: bold; }
    .stat-value.increasing { color: ${colors.critical}; }
    .stat-value.decreasing { color: ${colors.safe}; }
    .stat-value.stable { color: ${colors.textSecondary}; }
    footer { text-align: center; margin-top: 40px; padding: 20px; color: ${colors.textSecondary}; border-top: 1px solid ${colors.border}; }
  `;

  const statusEmoji = { safe: '✅', warning: '⚠️', critical: '🚨' }[analysis.summary.status];

  const formatProjection = (projection) => {
    if (!projection?.exhaustionTime) return 'Not projected';
    const date = new Date(projection.exhaustionTime);
    const days = projection.daysUntilExhaustion?.toFixed(1) || '?';
    return `${date.toLocaleString()} (${days} days)`;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rate Limit Analysis Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>${css}</style>
</head>
<body>
    <div class="container">
        <section class="charts">
            <h2>Secondary Rate Limit Analysis (7d)</h2>
            <div class="chart-container">
                <canvas id="usageChart" width="800" height="400"></canvas>
            </div>
        </section>

        <section class="statistics">
            <div class="stats-grid">
                <div class="stat-group">
                    <h3>Current Status</h3>
                    <div class="stat-item">
                        <span class="stat-label">Current Usage:</span>
                        <span class="stat-value">${analysis.secondary.current.toFixed(1)}%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Average:</span>
                        <span class="stat-value">${analysis.secondary.average.toFixed(1)}%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Range:</span>
                        <span class="stat-value">${analysis.secondary.minimum.toFixed(1)}% - ${analysis.secondary.maximum.toFixed(1)}%</span>
                    </div>
                </div>

                <div class="stat-group">
                    <h3>Trend Analysis</h3>
                    <div class="stat-item">
                        <span class="stat-label">Daily Change:</span>
                        <span class="stat-value">${analysis.secondary.trend.dailyChangePercent.toFixed(2)}%/day</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Confidence:</span>
                        <span class="stat-value">${(analysis.secondary.trend.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">R-Squared:</span>
                        <span class="stat-value">${analysis.secondary.trend.regression.rSquared.toFixed(3)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Regression Equation:</span>
                        <span class="stat-value">${analysis.secondary.trend.regression.equation}</span>
                    </div>
                </div>

                <div class="stat-group">
                    <h3>Projection & Data</h3>
                    <div class="stat-item">
                        <span class="stat-label">End:</span>
                        <span class="stat-value">${formatProjection(analysis.secondary.projection)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Time Span:</span>
                        <span class="stat-value">${analysis.timeSpan.hours.toFixed(1)} hours</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Data Points:</span>
                        <span class="stat-value">${analysis.timeSpan.dataPoints}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Start Time:</span>
                        <span class="stat-value">${new Date(analysis.timeSpan.start).toLocaleString()}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">End Time:</span>
                        <span class="stat-value">${new Date(analysis.timeSpan.end).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </section>

        <footer>
            <p>Generated by Rate Limit Monitoring System</p>
        </footer>
    </div>

    <script>
        const ctx = document.getElementById('usageChart').getContext('2d');

        // Prepare datasets - just actual data and projection
        const secondaryData = ${JSON.stringify(chartData.secondary)};
        const datasets = [
            {
                label: 'Secondary Rate Limit (%) with Trend',
                data: [...secondaryData, ...${JSON.stringify(chartData.projection)}],
                borderColor: '${colors.secondary}',
                backgroundColor: '${colors.secondary}44',
                tension: 0.1,
                fill: false,
                pointRadius: function(context) {
                    return context.dataIndex < secondaryData.length ? 5 : 0;
                },
                pointHoverRadius: 8,
                borderWidth: 3,
                borderDash: function(context) {
                    return context.dataIndex >= secondaryData.length ? [10, 5] : [];
                },
                pointBackgroundColor: function(context) {
                    const value = context.raw;
                    return value >= 80 ? '${colors.warning}' : '${colors.secondary}';
                },
                pointBorderColor: function(context) {
                    const value = context.raw;
                    return value >= 80 ? '${colors.warning}' : '${colors.secondary}';
                }
            }
        ];

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(chartData.labels)},
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { color: '${colors.grid}' },
                        ticks: { color: '${colors.text}', maxTicksLimit: 10 }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: '${colors.grid}' },
                        ticks: {
                            color: '${colors.text}',
                            callback: function(value) { return value + '%'; }
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '${colors.text}',
                            usePointStyle: true,
                            pointStyle: 'line',
                            boxWidth: 30,
                            boxHeight: 3,
                            padding: 20
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '%';
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;
}

function prepareChartData(dataPoints, analysis) {
  if (!dataPoints.length) {
    return {
      labels: [],
      actual: [],
      projection: [],
      pointStates: [],
      lastActualIndex: -1,
      finalProjection: 0,
      coverageDays: 0,
      windowDays: 7,
    };
  }

  const sortedPoints = [...dataPoints].sort((a, b) => a.timestamp - b.timestamp);
  const timestamps = sortedPoints.map(p => p.timestamp);
  const secondaryUsage = sortedPoints.map(p => p.rateLimits.secondary?.used_percent || 0);

  const startTime = timestamps[0];
  const lastActualTime = timestamps[timestamps.length - 1];
  const windowDays = 7;
  const windowEndTime = startTime + windowDays * 24 * 60 * 60 * 1000;

  // Determine sampling cadence – use median delta when possible, default to 6h
  let stepMs = 6 * 60 * 60 * 1000;
  if (timestamps.length > 1) {
    const deltas = [];
    for (let i = 1; i < timestamps.length; i++) {
      deltas.push(timestamps[i] - timestamps[i - 1]);
    }
    const sortedDeltas = deltas.sort((a, b) => a - b);
    const median = sortedDeltas[Math.floor(sortedDeltas.length / 2)];
    if (median > 0) {
      stepMs = median;
    }
  }

  const allTimestamps = [];
  for (let t = startTime; t <= windowEndTime; t += stepMs) {
    allTimestamps.push(t);
  }
  if (allTimestamps[allTimestamps.length - 1] !== windowEndTime) {
    allTimestamps.push(windowEndTime);
  }

  const valueMap = new Map();
  sortedPoints.forEach((point, index) => {
    valueMap.set(point.timestamp, secondaryUsage[index]);
  });

  const actual = allTimestamps.map(ts => {
    if (!valueMap.has(ts)) return null;
    return parseFloat((valueMap.get(ts) ?? 0).toFixed(1));
  });

  const pointStates = actual.map(value => {
    if (value === null) return null;
    if (value >= 100) return 'critical';
    if (value >= 80) return 'warning';
    return 'safe';
  });

  const regression = analysis.secondary.trend?.regression;
  const projection = allTimestamps.map(ts => {
    if (!regression) return null;
    const hoursFromStart = (ts - startTime) / (1000 * 60 * 60);
    const value = regression.slope * hoursFromStart + regression.intercept;
    return parseFloat(Math.max(0, Math.min(100, value)).toFixed(1));
  });

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    return `${month}/${day} ${hour}:00`;
  };

  const labels = allTimestamps.map(ts => formatTimestamp(ts));
  const lastActualIndex = allTimestamps.findIndex(ts => ts === lastActualTime);
  const finalProjection = projection.length ? (projection[projection.length - 1] ?? analysis.secondary.current) : analysis.secondary.current;
  const coverageDays = parseFloat(((lastActualTime - startTime) / (24 * 60 * 60 * 1000)).toFixed(1));

  return {
    labels,
    actual,
    projection,
    pointStates,
    lastActualIndex,
    finalProjection,
    coverageDays,
    windowDays,
  };
}

async function runAnalysis() {
  try {
    log('Starting rate limit analysis...', colors.bold);

    const dataPoints = await loadData();
    const analysis = analyzeData(dataPoints);

    if (config.verbose) {
      console.log('\nAnalysis Summary:');
      console.log(`- Time span: ${analysis.timeSpan.hours.toFixed(1)} hours`);
      console.log(`- Secondary trend: ${analysis.secondary.trend.direction} (${analysis.secondary.trend.dailyChangePercent.toFixed(2)}% daily)`);
      console.log(`- Confidence: ${(analysis.secondary.trend.confidence * 100).toFixed(1)}%`);

      if (analysis.secondary.projection?.exhaustionTime) {
        console.log(`- Secondary exhaustion projected: ${new Date(analysis.secondary.projection.exhaustionTime).toLocaleString()}`);
      }
    }

    log('Generating HTML report...', colors.blue);
    const html = generateReport(dataPoints, analysis);

    await fs.writeFile(config.outputFile, html, 'utf8');

    log(`Report saved to: ${config.outputFile}`, colors.green);
    log('Analysis completed successfully!', colors.green);
    log(`Open ${config.outputFile} in your browser to view the report`, colors.dim);

  } catch (error) {
    log(`Error during analysis: ${error.message}`, colors.red);
    process.exit(1);
  }
}

// Run the analysis
runAnalysis().catch(error => {
  log(`Fatal error: ${error.message}`, colors.red);
  process.exit(1);
});
