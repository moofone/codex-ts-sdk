#!/usr/bin/env node

/**
 * Generate Realistic Increasing Rate Limit Data
 */

const fs = require('fs/promises');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const dataDir = args.find((arg, i) => args[i - 1] === '--data-dir') || '/tmp/test-graph';
const scenario = args.find((arg, i) => args[i - 1] === '--scenario') || 'increasing';
const dataFile = path.resolve(dataDir, 'rate-limit-data.json');

// Generate realistic secondary rate limit data
function generateRealisticData() {
  const dataPoints = [];
  const now = Date.now();

  // Different starting points and behaviors based on scenario
  let currentSecondaryUsage;
  let maxIncrease;

  if (scenario === 'stable') {
    currentSecondaryUsage = 30; // Start at 30% for stable
    maxIncrease = 0.3; // Very small increases, mostly flat
  } else {
    currentSecondaryUsage = 0; // Start at 0% for increasing
    maxIncrease = 2.5; // Realistic increases for 4-hour intervals
  }

  // Generate 43 data points with 4-hour intervals (exactly one week = 168 hours)
  for (let i = 0; i < 43; i++) {
    const timestamp = now - ((43 - i - 1) * 4 * 60 * 60 * 1000); // 4 hours apart, going backwards
    const hourOfDay = new Date(timestamp).getHours();

    if (scenario === 'stable') {
      // Stable scenario: very small random increases
      const baseIncrease = Math.random() * maxIncrease;
      const increase = Math.max(0, baseIncrease);
      currentSecondaryUsage = Math.min(35, currentSecondaryUsage + increase);
    } else {
      // Realistic 8-hour activity bursts followed by 8-hour quiet periods
      // Active periods: 8 AM - 4 PM and 8 PM - 12 AM (user working/active)
      // Quiet periods: 12 AM - 8 AM and 4 PM - 8 PM (sleeping/resting)

      const isActiveTime = (hourOfDay >= 8 && hourOfDay < 16) || (hourOfDay >= 20 || hourOfDay < 0);

      let increase = 0;

      if (isActiveTime) {
        // During active periods: significant increases (2-6% per 4-hour period)
        increase = 2 + (Math.random() * 4); // 2-6% increase

        // Weekend vs weekday factor
        const dayOfWeek = new Date(timestamp).getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          increase *= 0.6; // Less activity on weekends
        }

        // Peak hours get more activity
        if (hourOfDay >= 10 && hourOfDay < 14) {
          increase *= 1.4; // Peak activity 10 AM - 2 PM
        }
      } else {
        // During quiet periods: no increase (user sleeping/resting)
        increase = 0;
      }

      currentSecondaryUsage = Math.min(85, currentSecondaryUsage + increase);
    }

    // Primary rate limit (not used, but kept for compatibility)
    const primaryUsage = 20 + (Math.random() - 0.5) * 10; // Random around 20%

    const dataPoint = {
      timestamp: timestamp,
      rateLimits: {
        primary: {
          used_percent: Math.round(primaryUsage * 10) / 10,
          window_minutes: 60,
          resets_in_seconds: Math.floor(Math.random() * 3600)
        },
        secondary: {
          used_percent: Math.round(currentSecondaryUsage * 10) / 10,
          window_minutes: 10080, // 7 days
          resets_in_seconds: Math.floor(Math.random() * 604800) // Random within 7 days
        }
      },
      model: "gpt-5-low",
      queryLatency: Math.floor(Math.random() * 5) + 1 // 1-5ms
    };

    dataPoints.push(dataPoint);
  }

  return dataPoints;
}

async function saveData(dataPoints) {
  try {
    // Ensure directory exists
    await fs.mkdir(dataDir, { recursive: true });

    const storageData = {
      version: '1.0',
      config: {
        maxDataPoints: 43,
        filePath: dataFile,
        backupPath: path.join(dataDir, 'rate-limit-data.backup.json')
      },
      lastUpdated: new Date().toISOString(),
      dataPoints: dataPoints.length,
      data: dataPoints
    };

    await fs.writeFile(dataFile, JSON.stringify(storageData, null, 2), 'utf8');

    console.log(`✅ Generated ${dataPoints.length} realistic data points`);
    console.log(`📁 Saved to: ${dataFile}`);
    console.log(`⏰ Time span: exactly 7 days (168 hours)`);

    // Show trend info
    const firstSecondary = dataPoints[0].rateLimits.secondary.used_percent;
    const lastSecondary = dataPoints[dataPoints.length - 1].rateLimits.secondary.used_percent;
    const change = lastSecondary - firstSecondary;

    console.log(`📈 Secondary rate limit trend: ${firstSecondary.toFixed(1)}% → ${lastSecondary.toFixed(1)}% (${change.toFixed(1)}% increase)`);

  } catch (error) {
    console.error(`❌ Error saving data: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  console.log('🔄 Generating realistic increasing rate limit data...');
  const dataPoints = generateRealisticData();
  await saveData(dataPoints);
}

main().catch(error => {
  console.error(`💥 Fatal error: ${error.message}`);
  process.exit(1);
});