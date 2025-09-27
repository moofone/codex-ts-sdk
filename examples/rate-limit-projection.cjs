#!/usr/bin/env node

/**
 * Rate Limit Projection Example
 *
 * This example demonstrates how to calculate projected end times for weekly
 * rate limits over 50% using linear regression on usage trends.
 *
 * Run with: node examples/rate-limit-projection.cjs
 */

const { CodexClient } = require('../dist/cjs/src/index.js');

/**
 * Calculate projected end time for weekly limits over 50% using linear regression
 * @param {Object} window Rate limit window data
 * @param {number} window.used_percent Current usage percentage
 * @param {number} window.window_minutes Window duration in minutes
 * @param {number} window.resets_in_seconds Seconds until reset
 * @returns {Date|null} Projected end date or null if not applicable
 */
function calculateProjectedEnd(window) {
  // Only calculate for weekly limits (7 days = 10080 minutes)
  const WEEKLY_MINUTES = 7 * 24 * 60;
  if (window.window_minutes !== WEEKLY_MINUTES) {
    console.log(`  ℹ️  Skipping projection for ${window.window_minutes}m window (not weekly)`);
    return null;
  }

  // Only show projection if over 50% usage
  if (window.used_percent < 50) {
    console.log(`  ℹ️  Skipping projection for ${window.used_percent}% usage (under 50%)`);
    return null;
  }

  // Calculate elapsed time in the window
  const totalWindowMs = WEEKLY_MINUTES * 60 * 1000; // 7 days in ms
  const remainingMs = window.resets_in_seconds * 1000;
  const elapsedMs = totalWindowMs - remainingMs;

  console.log(`  📊 Linear regression analysis:`);
  console.log(`    • Total window: ${WEEKLY_MINUTES} minutes (7 days)`);
  console.log(`    • Elapsed time: ${Math.round(elapsedMs / (1000 * 60 * 60))} hours`);
  console.log(`    • Remaining time: ${Math.round(remainingMs / (1000 * 60 * 60))} hours`);
  console.log(`    • Current usage: ${window.used_percent}%`);

  // Linear regression: assume constant usage rate
  const usageRate = window.used_percent / elapsedMs; // percent per ms
  const msToReach100 = (100 - window.used_percent) / usageRate;

  console.log(`    • Usage rate: ${(usageRate * 1000 * 60 * 60).toFixed(4)}% per hour`);
  console.log(`    • Time to 100%: ${Math.round(msToReach100 / (1000 * 60 * 60))} hours`);

  const now = new Date();
  const projectedEnd = new Date(now.getTime() + msToReach100);
  const resetTime = new Date(now.getTime() + remainingMs);

  console.log(`    • Projected end: ${projectedEnd.toISOString()}`);
  console.log(`    • Window resets: ${resetTime.toISOString()}`);

  // Only return if projection is before the reset time (otherwise it's not meaningful)
  if (projectedEnd < resetTime) {
    console.log(`    ✅ Projection is valid (before reset)`);
    return projectedEnd;
  } else {
    console.log(`    ❌ Projection is after reset (usage rate too slow)`);
    return null;
  }
}

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

/**
 * Format time duration in a human-readable way
 */
function formatDuration(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return `${minutes}m`;
  } else if (minutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Get color-coded warning level based on time to projected end
 * @param {number} timeToEndMs Milliseconds until projected limit hit
 * @returns {Object} Color and warning level info
 */
function getWarningLevel(timeToEndMs) {
  const hours = timeToEndMs / (1000 * 60 * 60);

  if (hours < 0) {
    // Already exceeded
    return {
      color: colors.red,
      level: 'CRITICAL',
      emoji: '🚨',
      message: 'ALREADY EXCEEDED PROJECTION'
    };
  } else if (hours <= 24) {
    // Within 24 hours
    return {
      color: colors.yellow,
      level: 'WARNING',
      emoji: '⚠️',
      message: 'PROJECTED TO EXCEED WITHIN 24 HOURS'
    };
  } else {
    // More than 24 hours away
    return {
      color: colors.green,
      level: 'OK',
      emoji: '✅',
      message: 'PROJECTED END TIME'
    };
  }
}

async function demonstrateProjection() {
  console.log('🔮 Rate Limit Projection Demo\n');

  // Example scenarios to demonstrate the linear regression
  const scenarios = [
    {
      name: "CRITICAL: Very High Usage (Red Alert)",
      used_percent: 95,
      window_minutes: 10080, // 7 days
      resets_in_seconds: 518400, // 6 days left (will project to exceed soon)
    },
    {
      name: "WARNING: High Usage (Yellow Alert)",
      used_percent: 80,
      window_minutes: 10080, // 7 days
      resets_in_seconds: 432000, // 5 days left (will project within 24h)
    },
    {
      name: "OK: Moderate Usage (Green)",
      used_percent: 60,
      window_minutes: 10080, // 7 days
      resets_in_seconds: 432000, // 5 days left (safe)
    },
    {
      name: "Low Usage Weekly Limit (No Projection)",
      used_percent: 30,
      window_minutes: 10080, // 7 days
      resets_in_seconds: 432000, // 5 days left
    },
    {
      name: "5-Hour Limit (No Projection - Wrong Window)",
      used_percent: 80,
      window_minutes: 300, // 5 hours
      resets_in_seconds: 3600, // 1 hour left
    }
  ];

  for (const [index, scenario] of scenarios.entries()) {
    console.log(`\n${index + 1}. ${scenario.name}`);
    console.log(`  Current usage: ${scenario.used_percent}%`);
    console.log(`  Window: ${scenario.window_minutes} minutes`);
    console.log(`  Resets in: ${formatDuration(scenario.resets_in_seconds * 1000)}`);

    const projectedEnd = calculateProjectedEnd(scenario);

    if (projectedEnd) {
      const now = new Date();
      const timeToEnd = projectedEnd.getTime() - now.getTime();
      const warning = getWarningLevel(timeToEnd);

      console.log(`\n  ${warning.emoji} ${warning.color}${warning.level}${colors.reset}: ${warning.message}`);
      console.log(`  ${warning.color}📅 Projected end: ${projectedEnd.toLocaleString()}${colors.reset}`);
      console.log(`  ${warning.color}⏰ Time until limit: ${formatDuration(timeToEnd)}${colors.reset}`);
    } else {
      console.log(`\n  ✅ No projection needed or applicable`);
    }

    console.log(`  ${'─'.repeat(60)}`);
  }

  console.log('\n💡 Tips:');
  console.log('  • Projections only show for weekly limits over 50% usage');
  console.log('  • Linear regression assumes constant usage rate');
  console.log('  • Projections are only shown if they occur before window reset');
  console.log('  • Color coding: 🚨 Red = Critical, ⚠️ Yellow = Within 24h, ✅ Green = Safe');
  console.log('  • Use this data to plan usage and avoid hitting limits');

  // Try to connect to real SDK and show actual rate limits if available
  console.log('\n🔄 Attempting to fetch real rate limit data...\n');

  try {
    const client = new CodexClient({
      logger: {
        debug: () => {}, // Suppress debug logs
        info: () => {},
        warn: console.warn,
        error: console.error,
      },
    });

    await client.connect();
    await client.createConversation();

    // Send a simple query to trigger rate limit data
    await client.sendUserTurn('Hello, quick test for rate limits');

    // Wait a moment for events to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    const status = await client.getStatus();
    await client.close();

    if (status.rate_limit_windows) {
      console.log('📊 Real Rate Limit Data:');

      if (status.rate_limit_windows.primary) {
        console.log(`\nPrimary (${status.rate_limit_windows.primary.label}):`);
        console.log(`  Usage: ${status.rate_limit_windows.primary.used_percent}%`);
        const projection = calculateProjectedEnd(status.rate_limit_windows.primary);
        if (projection) {
          const timeToEnd = projection.getTime() - new Date().getTime();
          const warning = getWarningLevel(timeToEnd);
          console.log(`  ${warning.emoji} ${warning.color}${warning.level}${colors.reset}: Projected to hit 100% in ${formatDuration(timeToEnd)}`);
        }
      }

      if (status.rate_limit_windows.secondary) {
        console.log(`\nSecondary (${status.rate_limit_windows.secondary.label}):`);
        console.log(`  Usage: ${status.rate_limit_windows.secondary.used_percent}%`);
        const projection = calculateProjectedEnd(status.rate_limit_windows.secondary);
        if (projection) {
          const timeToEnd = projection.getTime() - new Date().getTime();
          const warning = getWarningLevel(timeToEnd);
          console.log(`  ${warning.emoji} ${warning.color}${warning.level}${colors.reset}: Projected to hit 100% in ${formatDuration(timeToEnd)}`);
        }
      }
    } else {
      console.log('ℹ️  No real rate limit data available (mock data in use)');
    }

  } catch (error) {
    console.log('ℹ️  Could not fetch real rate limit data:', error.message);
    console.log('   (This is normal if using mock data or not authenticated)');
  }
}

// Run the demonstration
demonstrateProjection().catch(console.error);