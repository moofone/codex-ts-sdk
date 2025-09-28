#!/usr/bin/env node

/**
 * Rate Limit Data Collector
 *
 * Collects rate limit data points by making simple queries to GPT-5-low
 * and storing the results in a circular buffer for trend analysis.
 */

const { CodexClient } = require('../dist/cjs/src/index.js');
const fs = require('fs/promises');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const dataDir = args.find((arg, i) => args[i - 1] === '--data-dir') || process.cwd();
const dataFileName = args.find((arg, i) => args[i - 1] === '--data-file') || 'rate-limit-data.json';

const config = {
  mock: args.includes('--mock'),
  interval: parseInt(args.find((arg, i) => args[i - 1] === '--interval') || '240'),
  once: args.includes('--once'),
  dataFile: path.resolve(dataDir, dataFileName),
  dataDir: path.resolve(dataDir),
  scenario: args.find((arg, i) => args[i - 1] === '--scenario') || 'stable',
  verbose: args.includes('--verbose'),
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

async function ensureDataDirectory() {
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create data directory ${config.dataDir}: ${error.message}`);
  }
}

// Dynamic import for ES modules
async function importModules() {
  try {
    const dataStorage = await import('../dist/esm/src/monitoring/DataStorage.js');
    const mockGenerator = await import('../dist/esm/src/monitoring/MockDataGenerator.js');
    return { dataStorage, mockGenerator };
  } catch (error) {
    throw new Error(`Could not import modules: ${error.message}`);
  }
}

async function collectRateLimitData() {
  const startTime = Date.now();

  if (config.mock) {
    const { mockGenerator } = await importModules();
    const generator = new mockGenerator.MockDataGenerator({
      totalPoints: 1,
      startTimestamp: Date.now(),
      scenario: config.scenario,
    });

    const mockPoints = generator.generateDataPoints();
    const mockPoint = mockPoints[0];

    log(`Generated mock data point: ${mockPoint.rateLimits.primary?.used_percent}% primary, ${mockPoint.rateLimits.secondary?.used_percent}% secondary`, colors.green);

    return {
      rateLimits: mockPoint.rateLimits,
      model: mockPoint.model,
      queryLatency: Date.now() - startTime,
    };
  }

  // Live data collection
  const client = new CodexClient({
    logger: {
      debug: config.verbose ? console.log : () => {},
      info: config.verbose ? console.log : () => {},
      warn: console.warn,
      error: console.error,
    },
  });

  try {
    await client.connect();
    await client.createConversation();
    await client.sendUserTurn('1+1=', { model: 'gpt-5-low' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const status = await client.getStatus();
    await client.close();

    if (!status.rate_limit_windows) {
      throw new Error('No rate limit data available in response');
    }

    log(`Collected rate limit data: ${status.rate_limit_windows.primary?.used_percent}% primary, ${status.rate_limit_windows.secondary?.used_percent}% secondary`, colors.green);

    return {
      rateLimits: status.rate_limit_windows,
      model: 'gpt-5-low',
      queryLatency: Date.now() - startTime,
    };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

async function storeDataPoint(dataPoint) {
  await ensureDataDirectory();

  const { dataStorage } = await importModules();
  const storage = new dataStorage.CircularRateLimitStorage({
    filePath: config.dataFile,
    backupPath: path.join(config.dataDir, 'rate-limit-data.backup.json'),
  });

  await storage.loadData();
  await storage.addDataPoint(dataPoint);

  const stats = storage.getStorageStats();
  log(`Stored data point (${stats.dataPoints}/${stats.maxDataPoints} points, ${stats.utilizationPercent.toFixed(1)}% full)`, colors.blue);

  return stats;
}

async function runCollection() {
  try {
    log(`Starting rate limit data collection (${config.mock ? 'mock' : 'live'} mode)`, colors.bold);

    const dataPoint = await collectRateLimitData();
    const stats = await storeDataPoint(dataPoint);

    if (config.once) {
      log('Single collection completed successfully', colors.green);
      return;
    }

    const nextRunMs = config.interval * 60 * 1000;
    const nextRunTime = new Date(Date.now() + nextRunMs);
    log(`Next collection scheduled for: ${nextRunTime.toLocaleString()}`, colors.dim);
    setTimeout(runCollection, nextRunMs);
  } catch (error) {
    log(`Error during collection: ${error.message}`, colors.red);
    if (config.once) {
      process.exit(1);
    }
    setTimeout(runCollection, 60000); // Retry after 1 minute
  }
}

// Run the collection
runCollection().catch(error => {
  log(`Fatal error: ${error.message}`, colors.red);
  process.exit(1);
});