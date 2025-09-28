#!/usr/bin/env node

/**
 * Live Rate Limit Monitor
 *
 * Shows live rate limit stats with projected end times and daily usage rates.
 * Uses real OpenAI API data (not mocked).
 *
 * Run with: node examples/live-rate-limits.cjs
 */

const { CodexClient } = require('../dist/cjs/src/index.js');

/**
 * ANSI color codes
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

/**
 * Calculate detailed analytics for weekly rate limit windows
 */
function analyzeWeeklyRateLimit(window) {
  const WEEKLY_MINUTES = 7 * 24 * 60; // 10080 minutes
  // Allow for slight variations in weekly window size
  if (Math.abs(window.window_minutes - WEEKLY_MINUTES) > 5) {
    return null;
  }

  // Calculate window start and end
  const now = new Date();
  const remainingMs = window.resets_in_seconds * 1000;
  const totalWindowMs = window.window_minutes * 60 * 1000; // Use actual window size
  const elapsedMs = totalWindowMs - remainingMs;

  const windowStart = new Date(now.getTime() - elapsedMs);
  const windowEnd = new Date(now.getTime() + remainingMs);

  // Calculate daily usage rate
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  const usagePerDay = window.used_percent / elapsedDays;

  // Calculate projected end if usage continues at current rate
  const usageRate = window.used_percent / elapsedMs; // percent per ms
  const msToReach100 = (100 - window.used_percent) / usageRate;
  const projectedEnd = new Date(now.getTime() + msToReach100);

  // Determine color based on projected end vs window end
  let color, status;
  if (projectedEnd >= windowEnd) {
    // Safe - won't hit 100% before reset
    color = colors.green;
    status = 'SAFE';
  } else {
    // Will hit 100% before reset - determine urgency
    const hoursToEnd = msToReach100 / (1000 * 60 * 60);
    if (hoursToEnd <= 24) {
      color = colors.red;
      status = 'CRITICAL';
    } else {
      color = colors.yellow;
      status = 'WARNING';
    }
  }

  return {
    windowStart,
    windowEnd,
    projectedEnd,
    usagePerDay: usagePerDay.toFixed(1),
    willHit100: projectedEnd < windowEnd,
    color,
    status
  };
}

/**
 * Format a date for display using 24h time
 */
function formatDate(date) {
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Create ASCII progress bar showing current usage and projected end
 */
function createProgressChart(window, analysis) {
  const width = 50; // Shorter bar to prevent wrapping
  const usedPercent = window.used_percent;
  const usedBlocks = Math.floor((usedPercent / 100) * width);

  // Calculate where the projected end would be on the timeline
  let projectedBlocks = width; // Default to end of bar if no projection
  if (analysis && analysis.willHit100) {
    const now = new Date();
    const windowStart = analysis.windowStart;
    const windowEnd = analysis.windowEnd;
    const projectedEnd = analysis.projectedEnd;

    const totalDuration = windowEnd.getTime() - windowStart.getTime();
    const projectedDuration = projectedEnd.getTime() - windowStart.getTime();
    const projectedPercent = (projectedDuration / totalDuration) * 100;
    projectedBlocks = Math.floor((projectedPercent / 100) * width);
  }

  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i < usedBlocks) {
      // Used portion - color based on projection
      if (analysis && analysis.willHit100) {
        bar += analysis.color + '█' + colors.reset;
      } else {
        bar += colors.green + '█' + colors.reset;
      }
    } else if (analysis && analysis.willHit100 && i === projectedBlocks) {
      // Projected end point
      bar += analysis.color + colors.bold + '!' + colors.reset;
    } else if (i < projectedBlocks && analysis && analysis.willHit100) {
      // Space between current usage and projected end - use simpler character
      bar += colors.dim + '-' + colors.reset;
    } else {
      // Unused space
      bar += colors.dim + '·' + colors.reset;
    }
  }

  return {
    bar
  };
}

async function showLiveRateLimits() {
  console.log(`${colors.bold}Connecting and fetching live data...${colors.reset}\n`);

  const client = new CodexClient({
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: console.error,
    },
  });

  try {
    await client.connect();
    await client.createConversation();

    // Send a simple query to trigger rate limit data
    await client.sendUserTurn('Quick rate limit check');

    // Wait for events to process
    await new Promise(resolve => setTimeout(resolve, 3000));

    const status = await client.getStatus();
    await client.close();

    if (!status.rate_limit_windows) {
      console.log('No rate limit data available');
      console.log('   This might happen if:');
      console.log('   • Not authenticated with OpenAI');
      console.log('   • Using mock/development environment');
      console.log('   • API hasn\'t provided rate limit headers yet');
      return;
    }

    console.log(`\n${colors.bold}Current Rate Limits${colors.reset}`);

    // Primary window
    if (status.rate_limit_windows.primary) {
      const p = status.rate_limit_windows.primary;
      console.log(`\n${colors.bold}Primary (${p.label}):${colors.reset}`);

      // Show detailed analysis for weekly limits only
      const analysis = analyzeWeeklyRateLimit(p);
      const chart = createProgressChart(p, analysis);

      const percentColor = analysis && analysis.willHit100 ? analysis.color : colors.green;
      const dailyRate = analysis ? ` ${percentColor}(~${analysis.usagePerDay}%/day)${colors.reset}` : '';
      console.log(`  [${chart.bar}] ${percentColor}${p.used_percent}%${colors.reset}${dailyRate}`);

      if (!analysis && p.resets_at) {
        console.log(`  Resets: ${formatDate(p.resets_at)}`);
      }

      if (analysis) {
        console.log(`  Window: ${formatDate(analysis.windowStart)} ${colors.dim}→${colors.reset} ${formatDate(analysis.windowEnd)}`);
        if (analysis.willHit100) {
          console.log(`  ${analysis.color}Projected 100%: ${formatDate(analysis.projectedEnd)}${colors.reset}`);
        } else {
          console.log(`  ${analysis.color}Safe - won't hit 100% before reset${colors.reset}`);
        }
      }
    }

    // Secondary window
    if (status.rate_limit_windows.secondary) {
      const s = status.rate_limit_windows.secondary;
      console.log(`\n${colors.bold}Secondary (${s.label}):${colors.reset}`);

      // Show detailed analysis for weekly limits only
      const analysis = analyzeWeeklyRateLimit(s);
      const chart = createProgressChart(s, analysis);

      const percentColor = analysis && analysis.willHit100 ? analysis.color : colors.green;
      const dailyRate = analysis ? ` ${percentColor}(~${analysis.usagePerDay}%/day)${colors.reset}` : '';
      console.log(`  [${chart.bar}] ${percentColor}${s.used_percent}%${colors.reset}${dailyRate}`);

      if (!analysis && s.resets_at) {
        console.log(`  Resets: ${formatDate(s.resets_at)}`);
      }

      if (analysis) {
        console.log(`  Window: ${formatDate(analysis.windowStart)} ${colors.dim}→${colors.reset} ${formatDate(analysis.windowEnd)}`);
        if (analysis.willHit100) {
          console.log(`  ${analysis.color}Projected 100%: ${formatDate(analysis.projectedEnd)}${colors.reset}`);
        } else {
          console.log(`  ${analysis.color}Safe - won't hit 100% before reset${colors.reset}`);
        }
      }
    }


  } catch (error) {
    console.error(`\nError: ${error.message}`);
    console.log(`\n${colors.dim}This usually means:${colors.reset}`);
    console.log('• Not authenticated (run `codex auth login`)');
    console.log('• Network connectivity issues');
    console.log('• OpenAI API temporarily unavailable');

    await client.close().catch(() => {});
  }
}

// Run the monitor
showLiveRateLimits().catch(console.error);