#!/usr/bin/env node

/**
 * Rate Limit Collector Daemon
 * Runs continuously and collects data at specified intervals
 */

const { CodexClient } = require('../dist/cjs/src/index.js');
const fs = require('fs/promises');
const path = require('path');

// Configuration from environment or defaults
const config = {
  interval: parseInt(process.env.COLLECTION_INTERVAL || '480'), // 8 hours in minutes
  dataDir: process.env.DATA_DIR || path.join(process.env.HOME, 'rate-limit-data'),
  mock: process.env.USE_MOCK === 'true',
  maxRetries: 3,
  retryDelay: 60000, // 1 minute
};

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const colorMap = {
    error: colors.red,
    warn: colors.yellow,
    info: colors.blue,
    success: colors.green,
  };
  const color = colorMap[level] || '';
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

async function ensureDataDirectory() {
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
    log(`Data directory ensured: ${config.dataDir}`);
  } catch (error) {
    throw new Error(`Failed to create data directory: ${error.message}`);
  }
}

async function collectLiveData() {
  const client = new CodexClient({
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (msg) => log(msg, 'error'),
    },
  });

  try {
    await client.connect();
    await client.createConversation();
    await client.sendUserTurn('1+1=', { model: 'gpt-5-low' });

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 3000));

    const status = await client.getStatus();
    await client.close();

    if (!status.rate_limit_windows) {
      throw new Error('No rate limit data in response');
    }

    return {
      rateLimits: status.rate_limit_windows,
      model: 'gpt-5-low',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    await client.close().catch(() => {});

    // Check if it's an authentication error
    if (error.message.includes('Failed to submit request') ||
        error.message.includes('authentication') ||
        error.message.includes('401') ||
        error.message.includes('403')) {
      throw new Error('AUTH_REQUIRED: ' + error.message);
    }

    throw error;
  }
}

async function collectMockData() {
  // Generate realistic mock data
  const baseUsage = 30 + Math.random() * 40; // 30-70%
  return {
    rateLimits: {
      primary: {
        label: 'Weekly',
        window_minutes: 10080,
        used_percent: Math.round(baseUsage),
        resets_in_seconds: Math.round(Math.random() * 604800),
        resets_at: new Date(Date.now() + Math.random() * 604800000),
      },
      secondary: {
        label: 'Daily',
        window_minutes: 1440,
        used_percent: Math.round(baseUsage * 1.2),
        resets_in_seconds: Math.round(Math.random() * 86400),
        resets_at: new Date(Date.now() + Math.random() * 86400000),
      }
    },
    model: 'gpt-5-low',
    timestamp: new Date().toISOString(),
  };
}

async function saveDataPoint(dataPoint) {
  const dataFile = path.join(config.dataDir, 'rate-limit-data.json');

  // Load existing data
  let data = { dataPoints: [], metadata: { created: new Date().toISOString() } };
  try {
    const existingData = await fs.readFile(dataFile, 'utf8');
    data = JSON.parse(existingData);
  } catch (error) {
    // File doesn't exist, use default
  }

  // Add new point (keep last 2000 points for ~2 months of 8h data)
  data.dataPoints.push(dataPoint);
  if (data.dataPoints.length > 2000) {
    data.dataPoints = data.dataPoints.slice(-2000);
  }

  // Update metadata
  data.metadata.lastUpdated = new Date().toISOString();
  data.metadata.totalPoints = data.dataPoints.length;

  // Save
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2));

  return data.dataPoints.length;
}

async function collectWithRetry() {
  let attempt = 0;
  let authFailureCount = 0;

  while (true) {
    attempt++;
    try {
      log(`Collecting data (attempt ${attempt})...`);

      const dataPoint = config.mock
        ? await collectMockData()
        : await collectLiveData();

      const primary = dataPoint.rateLimits.primary;
      const secondary = dataPoint.rateLimits.secondary;

      log(`Collected: Primary ${primary?.used_percent}%, Secondary ${secondary?.used_percent}%`, 'success');

      const pointCount = await saveDataPoint(dataPoint);
      log(`Saved data point ${pointCount}/2000`, 'info');

      // Reset counters on success
      authFailureCount = 0;
      return true;
    } catch (error) {
      // Check if it's an authentication error
      if (error.message.includes('AUTH_REQUIRED')) {
        authFailureCount++;
        log(`Authentication failed (${authFailureCount} times). Please run 'codex auth login' to authenticate.`, 'warn');
        log(`Will retry in 1 minute...`, 'warn');

        // Wait 1 minute before retrying authentication
        await new Promise(resolve => setTimeout(resolve, 60000));
      } else {
        // Other errors - retry with backoff up to 3 times
        log(`Collection failed: ${error.message}`, 'error');

        if (attempt <= config.maxRetries) {
          log(`Retrying in ${config.retryDelay / 1000} seconds...`, 'warn');
          await new Promise(resolve => setTimeout(resolve, config.retryDelay));
        } else {
          // After max retries for other errors, wait 5 minutes and reset counter
          log(`Max retries reached. Waiting 5 minutes before trying again...`, 'warn');
          await new Promise(resolve => setTimeout(resolve, 300000));
          attempt = 0;
        }
      }
    }
  }
}

async function runDaemon() {
  log('Rate Limit Collector Daemon Starting', 'info');
  log(`Mode: ${config.mock ? 'MOCK' : 'LIVE'}`, 'info');
  log(`Interval: ${config.interval} minutes`, 'info');
  log(`Data directory: ${config.dataDir}`, 'info');

  await ensureDataDirectory();

  // Run immediately on start
  await collectWithRetry();

  // Schedule regular collections
  const intervalMs = config.interval * 60 * 1000;

  setInterval(async () => {
    log('Starting scheduled collection...', 'info');
    await collectWithRetry();
  }, intervalMs);

  // Log next collection time
  const nextRun = new Date(Date.now() + intervalMs);
  log(`Next collection scheduled for: ${nextRun.toISOString()}`, 'dim');

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down gracefully...', 'warn');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('Received SIGINT, shutting down gracefully...', 'warn');
    process.exit(0);
  });
}

// Start the daemon
runDaemon().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});