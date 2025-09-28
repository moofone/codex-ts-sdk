#!/usr/bin/env node

/**
 * Rate Limit Analyzer
 *
 * Analyzes collected rate limit data and generates HTML reports with
 * interactive charts showing trends and projections.
 */

const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const dataDir = args.find((arg, i) => args[i - 1] === '--data-dir') || '/tmp/data';
const outputFile = args.find((arg, i) => args[i - 1] === '--output') || path.join(dataDir, 'rate-limit-report.html');
const theme = args.find((arg, i) => args[i - 1] === '--theme') || 'light';
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

// Dynamic import for ES modules
async function importModules() {
  try {
    const dataStorage = await import('../dist/esm/src/monitoring/DataStorage.js');
    const analyzer = await import('../dist/esm/src/monitoring/RateLimitAnalyzer.js');
    const reportGenerator = await import('../dist/esm/src/monitoring/ReportGenerator.js');
    return { dataStorage, analyzer, reportGenerator };
  } catch (error) {
    throw new Error(`Could not import modules: ${error.message}`);
  }
}

async function loadData() {
  const fs = require('fs/promises');

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

async function analyzeData(dataPoints) {
  const { analyzer } = await importModules();
  const rateLimitAnalyzer = new analyzer.RateLimitAnalyzer();

  log(`Analyzing ${dataPoints.length} data points...`, colors.blue);
  const analysis = rateLimitAnalyzer.analyzeData(dataPoints);

  if (config.verbose) {
    console.log('\nAnalysis Summary:');
    console.log(`- Time span: ${analysis.timeSpan.hours.toFixed(1)} hours`);
    console.log(`- Primary trend: ${analysis.primary.trend.direction} (${analysis.primary.trend.dailyChangePercent.toFixed(2)}% daily)`);
    console.log(`- Secondary trend: ${analysis.secondary.trend.direction} (${analysis.secondary.trend.dailyChangePercent.toFixed(2)}% daily)`);

    if (analysis.primary.projection?.exhaustionTime) {
      console.log(`- Primary exhaustion projected: ${new Date(analysis.primary.projection.exhaustionTime).toLocaleString()}`);
    }
    if (analysis.secondary.projection?.exhaustionTime) {
      console.log(`- Secondary exhaustion projected: ${new Date(analysis.secondary.projection.exhaustionTime).toLocaleString()}`);
    }
  }

  return analysis;
}

async function generateReport(dataPoints, analysis) {
  const { reportGenerator } = await importModules();
  const generator = new reportGenerator.RateLimitReportGenerator();

  log(`Generating HTML report...`, colors.blue);
  const html = generator.generateReport(dataPoints, analysis, {
    title: 'Rate Limit Analysis Report',
    theme: config.theme,
  });

  const fs = require('fs/promises');
  await fs.writeFile(config.outputFile, html, 'utf8');

  log(`Report saved to: ${config.outputFile}`, colors.green);
  return config.outputFile;
}

async function runAnalysis() {
  try {
    log('Starting rate limit analysis...', colors.bold);

    const dataPoints = await loadData();
    const analysis = await analyzeData(dataPoints);
    const reportPath = await generateReport(dataPoints, analysis);

    log('Analysis completed successfully!', colors.green);
    log(`Open ${reportPath} in your browser to view the report`, colors.dim);

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