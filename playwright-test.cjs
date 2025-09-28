const { chromium } = require('playwright');
const fs = require('fs');

async function examineHTML() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Load the HTML file
  await page.goto('file:///private/tmp/test-graph/scenario1-safe.html');

  // Wait for chart to load
  await page.waitForTimeout(2000);

  // Take a screenshot to see what it looks like
  await page.screenshot({ path: '/tmp/current-graph.png', fullPage: true });

  // Check if there's a chart canvas
  const chartExists = await page.locator('#usageChart').count() > 0;
  console.log('Chart canvas exists:', chartExists);

  // Get the chart title
  const title = await page.locator('h2').first().textContent();
  console.log('Chart title:', title);

  // Check if there are any visible data elements
  const canvasRect = await page.locator('#usageChart').boundingBox();
  console.log('Canvas dimensions:', canvasRect);

  // Extract any text mentioning regression or projection
  const bodyText = await page.textContent('body');
  const regressionMatch = bodyText.match(/Regression.*?y = [^,]+/);
  const projectionMatch = bodyText.match(/Projected.*?(\d+\.?\d*)%/);

  console.log('Regression equation found:', regressionMatch?.[0] || 'Not found');
  console.log('Projection found:', projectionMatch?.[0] || 'Not found');

  // Check for time range indicators
  const timeSpanMatch = bodyText.match(/Time Span.*?(\d+\.?\d*) hours/);
  console.log('Time span:', timeSpanMatch?.[1] || 'Not found', 'hours');

  // Check for data coverage
  const dataPointsMatch = bodyText.match(/Data Points.*?(\d+)/);
  console.log('Data points:', dataPointsMatch?.[1] || 'Not found');

  await browser.close();

  console.log('Screenshot saved to /tmp/current-graph.png');
}

examineHTML().catch(console.error);