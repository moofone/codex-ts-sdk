#!/usr/bin/env node

/**
 * Rate Limit Snapshot Tool
 * Takes a single snapshot of rate limit data and saves it
 * Designed to be run via cron/systemd/launchd
 *
 * If authentication fails, it will retry every minute forever until successful
 */

const { CodexClient } = require('../dist/cjs/src/index.js');
const fs = require('fs/promises');
const path = require('path');

// Configuration from environment or command line
const args = process.argv.slice(2);
const dataDir = process.env.DATA_DIR || args.find((arg, i) => args[i - 1] === '--data-dir') || path.join(process.env.HOME, 'rate-limit-data');
const mock = process.env.USE_MOCK === 'true' || args.includes('--mock');
const verbose = process.env.VERBOSE === 'true' || args.includes('--verbose');

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
    await fs.mkdir(dataDir, { recursive: true });
    if (verbose) log(`Data directory ensured: ${dataDir}`);
  } catch (error) {
    throw new Error(`Failed to create data directory: ${error.message}`);
  }
}

async function collectLiveData() {
  const client = new CodexClient({
    logger: {
      debug: verbose ? console.log : () => {},
      info: verbose ? console.log : () => {},
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
  const dataFile = path.join(dataDir, 'rate-limit-data.json');

  // Load existing data
  let data = { dataPoints: [], metadata: { created: new Date().toISOString() } };
  try {
    const existingData = await fs.readFile(dataFile, 'utf8');
    data = JSON.parse(existingData);
  } catch (error) {
    // File doesn't exist, use default
  }

  // Add new point (keep last 5000 points for ~5 months of 8h data)
  data.dataPoints.push(dataPoint);
  if (data.dataPoints.length > 5000) {
    data.dataPoints = data.dataPoints.slice(-5000);
  }

  // Update metadata
  data.metadata.lastUpdated = new Date().toISOString();
  data.metadata.totalPoints = data.dataPoints.length;

  // Save
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2));

  return data.dataPoints.length;
}

async function takeSnapshot() {
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      if (verbose || attempt === 1) {
        log(`Taking rate limit snapshot (attempt ${attempt})...`);
      }

      const dataPoint = mock
        ? await collectMockData()
        : await collectLiveData();

      const primary = dataPoint.rateLimits.primary;
      const secondary = dataPoint.rateLimits.secondary;

      const pointCount = await saveDataPoint(dataPoint);

      // Success - log and exit
      log(`✓ Snapshot saved: Primary ${primary?.used_percent}%, Secondary ${secondary?.used_percent}% (${pointCount}/5000 points)`, 'success');
      return 0;

    } catch (error) {
      // Check if it's an authentication error
      if (error.message.includes('AUTH_REQUIRED')) {
        if (attempt === 1) {
          log(`Authentication required. Please run 'codex auth login' to authenticate.`, 'warn');
        }
        if (verbose || attempt % 10 === 0) {
          log(`Waiting for authentication... (attempt ${attempt})`, 'warn');
        }

        // Wait 1 minute before retrying
        await new Promise(resolve => setTimeout(resolve, 60000));
      } else {
        // Other errors - log and exit with error code
        log(`Error: ${error.message}`, 'error');
        return 1;
      }
    }
  }
}

// Handle help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Rate Limit Snapshot Tool

Usage: node rate-limit-snapshot.cjs [options]

Options:
  --data-dir <path>  Directory to store data (default: ~/rate-limit-data)
  --mock             Use mock data instead of live API calls
  --verbose          Show detailed output
  --help             Show this help message

Environment variables:
  DATA_DIR           Directory to store data
  USE_MOCK           Set to 'true' to use mock data
  VERBOSE            Set to 'true' for detailed output
  CODEX_INTERNAL_ORIGINATOR_OVERRIDE  Set to 'codex_cli_rs' for authentication

Example:
  # Take a live snapshot
  CODEX_INTERNAL_ORIGINATOR_OVERRIDE=codex_cli_rs node rate-limit-snapshot.cjs

  # Test with mock data
  node rate-limit-snapshot.cjs --mock

  # Schedule with cron (every 8 hours)
  0 */8 * * * cd /path/to/project && CODEX_INTERNAL_ORIGINATOR_OVERRIDE=codex_cli_rs node examples/rate-limit-snapshot.cjs
  `);
  process.exit(0);
}

// Start data directory creation and snapshot
ensureDataDirectory()
  .then(() => takeSnapshot())
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });