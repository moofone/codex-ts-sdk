#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const args = process.argv.slice(2);
const scenario = args.find((arg, i) => args[i - 1] === '--scenario') || 'scenario1-safe';
const outputArg = args.find((arg, i) => args[i - 1] === '--output');
const theme = args.find((arg, i) => args[i - 1] === '--theme') || 'dark';

if (!['scenario1-safe', 'scenario1-critical'].includes(scenario)) {
  console.error(`Unsupported scenario "${scenario}". Supported: scenario1-safe, scenario1-critical.`);
  process.exit(1);
}

const outputPath = outputArg || path.resolve('examples', 'html', `${scenario}.html`);

function createSafeScenarioData() {
  // Start at window beginning exactly at 9:00 AM
  const startTime = Date.parse('2024-09-21T09:00:00Z');
  const stepHours = 6;
  const totalSteps = (3 * 24) / stepHours; // 3 days of data (mid-week snapshot)
  const points = [];

  let cumulativeSecondary = 5; // Start at 5% consumed buffer
  let cumulativePrimary = 4;   // Start at 4% consumed buffer

  for (let i = 0; i <= totalSteps; i++) {
    const timestamp = startTime + i * stepHours * 60 * 60 * 1000;

    // For the first data point, don't add any consumption - just use the starting values
    if (i === 0) {
      // Keep the starting values as-is for the first point
    } else {
      // Calculate hour of day for step function pattern
      const hourOfDay = ((i * stepHours) + 9) % 24; // Start at 9 AM

      // Step function: buffer consumption rate based on activity
      let consumptionRate;
      if (hourOfDay >= 9 || hourOfDay <= 0) {
        // Active period: 9 AM to 12 AM (16 hours) - faster consumption
        // Check if this is the first active point after sleep (9 AM)
        if (hourOfDay === 9) {
          // First point after sleep: much bigger, more dynamic jump
          const wakeUpBoost = 3.0 + Math.random() * 6.0; // Random boost between 3.0-9.0 (higher and more dynamic)
          consumptionRate = wakeUpBoost; // Just the wake-up boost (much larger range and more dynamic)
        } else {
          // Add some randomness to normal active periods to reduce R²
          const randomness = 0.4 + Math.random() * 0.8; // Random factor between 0.4-1.2 (reduced for safer scenario)
          consumptionRate = 1.8 * randomness; // Lower base rate with randomness
        }
      } else {
        // Quiet period: 1 AM to 8 AM (12 hours, 2 data points) - slower/minimal consumption
        const sleepRandomness = 0.01 + Math.random() * 0.08; // Small random variation during sleep
        consumptionRate = sleepRandomness; // Very low consumption with slight variation
      }

      // Buffer can only increase (consumed buffer accumulates)
      cumulativeSecondary += consumptionRate;
      cumulativePrimary += consumptionRate * 0.8; // Primary slightly less than secondary
    }

    const secondary = parseFloat(Math.min(100, cumulativeSecondary)).toFixed(1);
    const primary = parseFloat(Math.min(100, cumulativePrimary)).toFixed(1);
    points.push({
      timestamp,
      model: 'gpt-5-low',
      queryLatency: 900 + Math.round(Math.random() * 120),
      rateLimits: {
        primary: {
          used_percent: Number(primary),
          window_minutes: 60,
          resets_in_seconds: 3600,
        },
        secondary: {
          used_percent: Number(secondary),
          window_minutes: 10080, // 7 days
          resets_in_seconds: 6 * 3600,
        },
      },
    });
  }
  return points;
}

function createCriticalScenarioData() {
  // Start at window beginning exactly at 9:00 AM
  const startTime = Date.parse('2024-09-21T09:00:00Z');
  const stepHours = 6;
  const totalSteps = (3 * 24) / stepHours; // 3 days of data (mid-week snapshot)
  const points = [];

  let cumulativeSecondary = 5; // Start at 5% consumed buffer (same as safe)
  let cumulativePrimary = 4;   // Start at 4% consumed buffer

  for (let i = 0; i <= totalSteps; i++) {
    const timestamp = startTime + i * stepHours * 60 * 60 * 1000;

    // For the first data point, don't add any consumption - just use the starting values
    if (i === 0) {
      // Keep the starting values as-is for the first point
    } else {
      // Calculate hour of day for step function pattern
      const hourOfDay = ((i * stepHours) + 9) % 24; // Start at 9 AM

      // Step function: buffer consumption rate based on activity (steeper for critical)
      let consumptionRate;
      if (hourOfDay >= 9 || hourOfDay <= 0) {
        // Active period: 9 AM to 12 AM (16 hours) - faster consumption
        // Check if this is the first active point after sleep (9 AM)
        if (hourOfDay === 9) {
          // First point after sleep: much bigger, more dynamic jump (steeper for critical)
          const wakeUpBoost = 8.0 + Math.random() * 12.0; // Random boost between 8.0-20.0 (much higher for critical)
          consumptionRate = wakeUpBoost; // Just the wake-up boost (larger and more random)
        } else {
          // Add more randomness and steeper slopes for critical scenario
          const randomness = 1.2 + Math.random() * 2.0; // Random factor between 1.2-3.2 (higher for critical)
          consumptionRate = 4.5 * randomness; // Higher base rate for critical scenario
        }
      } else {
        // Quiet period: 1 AM to 8 AM (12 hours, 2 data points) - slower/minimal consumption
        const sleepRandomness = 0.05 + Math.random() * 0.15; // Slightly more variation during sleep
        consumptionRate = sleepRandomness; // Very low consumption with slight variation
      }

      // Buffer can only increase (consumed buffer accumulates)
      cumulativeSecondary += consumptionRate;
      cumulativePrimary += consumptionRate * 0.8; // Primary slightly less than secondary
    }

    const secondary = parseFloat(Math.min(100, cumulativeSecondary)).toFixed(1);
    const primary = parseFloat(Math.min(100, cumulativePrimary)).toFixed(1);
    points.push({
      timestamp,
      model: 'gpt-5-low',
      queryLatency: 900 + Math.round(Math.random() * 120),
      rateLimits: {
        primary: {
          used_percent: Number(primary),
          window_minutes: 60,
          resets_in_seconds: 3600,
        },
        secondary: {
          used_percent: Number(secondary),
          window_minutes: 10080, // 7 days
          resets_in_seconds: 6 * 3600,
        },
      },
    });
  }
  return points;
}

function performLinearRegression(values, timestamps) {
  if (values.length < 2) {
    return { slope: 0, intercept: values[0] || 0, rSquared: 0, equation: `y = ${values[0] || 0}` };
  }
  const startTime = timestamps[0];
  const xs = timestamps.map(t => (t - startTime) / (60 * 60 * 1000));
  const xMean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const yMean = values.reduce((sum, y) => sum + y, 0) / values.length;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i++) {
    numerator += (xs[i] - xMean) * (values[i] - yMean);
    denominator += (xs[i] - xMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  let totalSumSquares = 0;
  let residualSumSquares = 0;
  for (let i = 0; i < values.length; i++) {
    const predicted = slope * xs[i] + intercept;
    totalSumSquares += (values[i] - yMean) ** 2;
    residualSumSquares += (values[i] - predicted) ** 2;
  }
  const rSquared = totalSumSquares === 0 ? 0 : Math.max(0, Math.min(1, 1 - residualSumSquares / totalSumSquares));

  return {
    slope,
    intercept,
    rSquared,
    equation: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(2)}`,
  };
}

function analyzeScenario(dataPoints) {
  const sorted = [...dataPoints].sort((a, b) => a.timestamp - b.timestamp);
  const timestamps = sorted.map(p => p.timestamp);
  const secondary = sorted.map(p => p.rateLimits.secondary?.used_percent || 0);
  const primary = sorted.map(p => p.rateLimits.primary?.used_percent || 0);

  const current = secondary[secondary.length - 1] || 0;
  const average = secondary.reduce((sum, val) => sum + val, 0) / secondary.length;
  const min = Math.min(...secondary);
  const max = Math.max(...secondary);

  const regression = performLinearRegression(secondary, timestamps);
  const dailyChange = regression.slope * 24;
  let direction = 'stable';
  if (dailyChange > 0.1) direction = 'increasing';
  if (dailyChange < -0.1) direction = 'decreasing';
  const confidence = regression.rSquared;

  const startTime = timestamps[0];
  const windowEnd = startTime + 7 * 24 * 60 * 60 * 1000;
  const hoursToEnd = (windowEnd - startTime) / (60 * 60 * 1000);
  const projectedAtWindow = Math.max(0, Math.min(100, regression.slope * hoursToEnd + regression.intercept));

  let status = 'safe';
  if (projectedAtWindow >= 100) status = 'critical';
  else if (projectedAtWindow >= 75) status = 'warning';

  let primaryConcern = 'Projected usage remains below 75% throughout the weekly window.';
  if (status === 'warning') {
    primaryConcern = 'Projection approaches the 75% caution threshold within the window.';
  } else if (status === 'critical') {
    primaryConcern = 'Projection exceeds 100% before the window completes.';
  }

  const recommendations = [];
  if (status === 'safe') {
    recommendations.push('Maintain current workload distribution.');
    recommendations.push('Re-run analysis mid-week to detect emerging trends.');
  } else {
    recommendations.push('Review automation and batch work to flatten peaks.');
    recommendations.push('Coordinate with stakeholders on contingency plans.');
    if (status === 'critical') {
      recommendations.push('Implement throttling or request deferral immediately.');
    }
  }

  return {
    timeSpan: {
      start: startTime,
      end: timestamps[timestamps.length - 1],
      hours: (timestamps[timestamps.length - 1] - startTime) / (60 * 60 * 1000),
      dataPoints: secondary.length,
    },
    secondary: {
      current,
      average,
      minimum: min,
      maximum: max,
      trend: {
        direction,
        confidence,
        dailyChangePercent: dailyChange,
        regression,
      },
    },
    primary: {
      current: primary[primary.length - 1] || 0,
      average: primary.reduce((sum, val) => sum + val, 0) / primary.length,
      minimum: Math.min(...primary),
      maximum: Math.max(...primary),
    },
    summary: {
      status,
      primaryConcern,
      recommendations,
      projectedUsageAtWindowEnd: projectedAtWindow,
    },
  };
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  return `${month}/${day} ${hour}:00`;
}

function prepareChartData(dataPoints, analysis) {
  const sorted = [...dataPoints].sort((a, b) => a.timestamp - b.timestamp);
  const timestamps = sorted.map(p => p.timestamp);
  const start = timestamps[0];
  const lastActual = timestamps[timestamps.length - 1];
  const windowEnd = start + 7 * 24 * 60 * 60 * 1000; // Full 7 days
  const stepMs = 6 * 60 * 60 * 1000; // 6-hour intervals

  // Generate time points for the full 7-day window
  const allTimestamps = [];
  for (let ts = start; ts <= windowEnd; ts += stepMs) {
    allTimestamps.push(ts);
  }
  // Ensure window end is included
  if (allTimestamps[allTimestamps.length - 1] !== windowEnd) {
    allTimestamps.push(windowEnd);
  }

  // Map actual data points
  const actualMap = new Map();
  sorted.forEach(point => {
    actualMap.set(point.timestamp, point.rateLimits.secondary?.used_percent || 0);
  });

  // Create actual values array (null for points beyond observed data)
  const actualValues = allTimestamps.map(ts => {
    if (actualMap.has(ts)) {
      return Number(actualMap.get(ts).toFixed(1));
    }
    return null; // No data beyond the observed window
  });

  // Point states for coloring
  const pointStates = actualValues.map(value => {
    if (value === null) return null;
    if (value >= 100) return 'critical';
    if (value >= 75) return 'warning';
    return 'safe';
  });

  // Regression line only from the last actual data point forward
  const regression = analysis.secondary.trend.regression;
  const lastActualIndex = allTimestamps.findIndex(ts => ts === lastActual);
  let hitHundred = false;
  const projectionValues = allTimestamps.map((ts, index) => {
    // Only show projection from the last actual data point onward
    if (index < lastActualIndex) {
      return null;
    }

    // Stop drawing once we previously hit 100%
    if (hitHundred) {
      return null;
    }

    const hours = (ts - start) / (60 * 60 * 1000);
    const projected = regression.slope * hours + regression.intercept;
    const value = Number(Math.max(0, Math.min(100, projected)).toFixed(1));

    // If we hit or exceed 100%, include this point at 100% and mark that we hit it
    if (value >= 100) {
      hitHundred = true;
      return 100;
    }
    return value;
  });

  // Calculate error indicators (±10% confidence interval)
  let errorHitHundred = false;
  const errorBars = allTimestamps.map((ts, index) => {
    if (index < lastActualIndex) {
      return { upper: null, lower: null };
    }

    // Stop error bands once projection hits 100%
    if (errorHitHundred || projectionValues[index] === null) {
      return { upper: null, lower: null };
    }

    const hours = (ts - start) / (60 * 60 * 1000);
    const projected = regression.slope * hours + regression.intercept;
    const errorMargin = Math.abs(projected * 0.1); // ±10% error margin
    const upper = Number(Math.max(0, Math.min(100, projected + errorMargin)).toFixed(1));
    const lower = Number(Math.max(0, Math.min(100, projected - errorMargin)).toFixed(1));

    // If upper bound hits 100%, mark it
    if (upper >= 100) {
      errorHitHundred = true;
    }

    return { upper, lower };
  });

  return {
    labels: allTimestamps.map(formatTimestamp),
    actual: actualValues,
    projection: projectionValues,
    errorBars,
    pointStates,
    finalProjection: analysis.summary.projectedUsageAtWindowEnd,
    coverageDays: Number(((lastActual - start) / (24 * 60 * 60 * 1000)).toFixed(1)),
    windowDays: 7,
    lastActualIndex: allTimestamps.findIndex(ts => ts === lastActual),
  };
}

function generateHtml(dataPoints, analysis) {
  const chartData = prepareChartData(dataPoints, analysis);
  const isDark = theme === 'dark';
  const colors = isDark ? {
    bg: '#121212',
    surface: '#1f1f1f',
    text: '#f5f5f5',
    textSecondary: '#666666',
    border: '#2c2c2c',
    primary: '#4fc3f7',
    secondary: '#81c784',
    warning: '#ffb74d',
    critical: '#ef5350',
    safe: '#81c784',
    grid: '#333333',
  } : {
    bg: '#ffffff',
    surface: '#f5f7fa',
    text: '#222222',
    textSecondary: '#6b7280',
    border: '#d1d5db',
    primary: '#2563eb',
    secondary: '#22c55e',
    warning: '#f59e0b',
    critical: '#ef4444',
    safe: '#22c55e',
    grid: '#e5e7eb',
  };

  const summary = analysis.summary;
  const statusEmoji = { safe: '✅', warning: '⚠️', critical: '🚨' }[summary.status];
  const projectionColor = summary.projectedUsageAtWindowEnd >= 100 ? colors.critical : summary.projectedUsageAtWindowEnd >= 75 ? colors.warning : colors.safe;

  const pointRadii = chartData.actual.map(v => v === null ? 0 : 5);
  const pointColors = chartData.pointStates.map(state => {
    if (state === 'critical') return colors.critical;
    if (state === 'warning') return colors.warning;
    if (state === 'safe') return colors.secondary;
    return 'rgba(0,0,0,0)';
  });

  // Set projection line color based on final projection
  const projectionLineColor = summary.projectedUsageAtWindowEnd >= 100 ? colors.critical :
                              summary.projectedUsageAtWindowEnd >= 75 ? colors.warning : colors.safe;

  const payload = {
    labels: chartData.labels,
    actual: chartData.actual,
    projection: chartData.projection,
    errorUpper: chartData.errorBars.map(e => e.upper),
    errorLower: chartData.errorBars.map(e => e.lower),
    pointRadii,
    pointColors,
    lastActualIndex: chartData.lastActualIndex,
    projectionLineColor,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Scenario 1 - Safe</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      color-scheme: ${isDark ? 'dark' : 'light'};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: ${colors.bg}; color: ${colors.text}; line-height: 1.6; }
    .container { max-width: 1100px; margin: 0 auto; padding: 28px; }
    header { text-align: center; margin-bottom: 28px; padding: 24px; background-color: ${colors.surface}; border-radius: 12px; border: 1px solid ${colors.border}; }
    header h1 { font-size: 2.2rem; margin-bottom: 8px; }
    header p { color: ${colors.textSecondary}; font-size: 0.95rem; }
    section { margin-bottom: 28px; padding: 24px; background-color: ${colors.surface}; border-radius: 12px; }
    .status { display: flex; align-items: center; gap: 12px; padding: 16px; border-radius: 8px; font-weight: 600; font-size: 1.05rem; margin-bottom: 18px; }
    .status-safe { background-color: ${colors.safe}22; border: 2px solid ${colors.safe}; }
    .status-warning { background-color: ${colors.warning}22; border: 2px solid ${colors.warning}; }
    .status-critical { background-color: ${colors.critical}22; border: 2px solid ${colors.critical}; }
    .primary-concern { padding: 16px; background-color: ${colors.bg}; border-radius: 8px; border-left: 4px solid ${colors.primary}; margin-bottom: 18px; }
    .recommendations ul { margin-left: 18px; }
    .recommendations li { margin-bottom: 6px; }
    .chart-wrapper { padding: 18px; background-color: ${colors.bg}; border-radius: 10px; }
    .coverage-note { margin-top: 12px; color: ${colors.textSecondary}; font-size: 0.95rem; }
    .stats-grid { display: grid; grid-template-columns: 1fr; gap: 20px; max-width: 400px; margin: 0 auto; }
    .stat-card { padding: 18px; background-color: ${colors.bg}; border-radius: 8px; border: 1px solid ${colors.border}; }
    .stat-item { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.95rem; }
    .stat-label { color: ${colors.textSecondary}; }
    .stat-value { font-weight: 600; }
    .title-container { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .plan-label { background-color: ${colors.border}; color: ${colors.text}; padding: 2px 10px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    footer { text-align: center; color: ${colors.textSecondary}; padding-top: 16px; border-top: 1px solid ${colors.border}; }
  </style>
</head>
<body>
  <div class="container">
    <section>
      <div class="title-container">
        <h2>Codex Usage</h2>
        <p style="font-size: 0.75rem; color: #1f1f1f; margin-top: -0.5rem;">Plan: Pro</p>
        <span class="plan-label">Pro</span>
      </div>
      <div class="chart-wrapper">
        <canvas id="scenarioChart" height="360"></canvas>
      </div>
    </section>


    <footer>Made with codex-ts-sdk</footer>
  </div>

  <script>
    const payload = ${JSON.stringify(payload)};
    const isDark = ${isDark ? 'true' : 'false'};
    const palette = {
      secondary: '${colors.secondary}',
      projection: '${projectionColor}',
      warning: '${colors.warning}',
      critical: '${colors.critical}',
      grid: '${colors.grid}',
      text: '${colors.text}',
    };

    const ctx = document.getElementById('scenarioChart').getContext('2d');
    const labels = payload.labels;
    const observed = payload.actual;
    const projection = payload.projection;
    const pointRadii = payload.pointRadii;
    const pointColors = payload.pointColors;
    const lastActualIndex = payload.lastActualIndex;
    const projectionLineColor = payload.projectionLineColor;
    const errorUpper = payload.errorUpper;
    const errorLower = payload.errorLower;

    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '7d',
            data: observed,
            borderColor: (context) => {
              if (!context.parsed) return palette.secondary;
              const value = context.parsed.y;
              if (value >= 75) return palette.warning;
              return palette.secondary;
            },
            backgroundColor: palette.secondary + '33',
            spanGaps: false,
            tension: 0.25,
            pointRadius: pointRadii,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            borderWidth: 3,
            segment: {
              borderColor: (ctx) => {
                const currentValue = ctx.p0.parsed.y;
                const nextValue = ctx.p1.parsed.y;
                const maxValue = Math.max(currentValue, nextValue);
                if (maxValue >= 75) return palette.warning;
                return palette.secondary;
              }
            }
          },
          {
            label: 'Projection',
            data: projection,
            borderColor: projectionLineColor,
            borderDash: [8, 4], // Always dashed
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            tension: 0,
            spanGaps: false,
          },
          {
            label: 'Error Band Upper',
            data: errorUpper,
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            fill: '+1', // Fill to the next dataset (lower bound)
            pointRadius: 0,
            tension: 0,
            spanGaps: false,
          },
          {
            label: 'Error Band Lower',
            data: errorLower,
            borderColor: 'transparent',
            backgroundColor: projectionLineColor + '20', // 20% opacity
            fill: false,
            pointRadius: 0,
            tension: 0,
            spanGaps: false,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: {
            type: 'category',
            grid: { color: palette.grid },
            ticks: {
              color: palette.text,
              maxTicksLimit: 8,
              callback: function(value, index) {
                // Only show labels at daily intervals (every 4th point)
                if (index % 4 === 0) {
                  return this.getLabelForValue(value);
                }
                return null;
              },
              major: {
                enabled: true
              }
            }
          },
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: palette.grid },
            ticks: {
              color: palette.text,
              callback: value => value + '%',
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: palette.text,
              usePointStyle: true,
              boxWidth: 14,
              padding: 18,
              filter: function(item, chart) {
                // Hide error band datasets from legend
                return !item.text.includes('Error Band');
              }
            }
          },
          tooltip: {
            callbacks: {
              label: context => context.parsed.y == null ? null : context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '%',
            }
          }
        }
      }
    });
  </script>
</body>
</html>`;
}

async function main() {
  const dataPoints = scenario === 'scenario1-critical' ? createCriticalScenarioData() : createSafeScenarioData();
  const analysis = analyzeScenario(dataPoints);
  const html = generateHtml(dataPoints, analysis);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, 'utf8');
  console.log(`Scenario report generated: ${outputPath}`);
}

main().catch(err => {
  console.error('Failed to generate scenario report:', err);
  process.exit(1);
});
