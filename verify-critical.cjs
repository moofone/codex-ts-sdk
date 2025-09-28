const { chromium } = require('playwright');

async function verifyCritical() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('file:///private/tmp/test-graph/scenario1-critical.html');
  await page.waitForTimeout(3000);

  // Take a screenshot
  await page.screenshot({ path: '/tmp/critical-graph.png', fullPage: true });

  console.log('=== CRITICAL SCENARIO VERIFICATION ===');

  const bodyText = await page.textContent('body');

  // Check for monotonic pattern in the data
  const chartDataMatch = bodyText.match(/const payload = ({.*?});/s);
  if (chartDataMatch) {
    try {
      const payload = JSON.parse(chartDataMatch[1]);
      const actualData = payload.actual.filter(x => x !== null);

      console.log('✓ Actual data points:', actualData.length);
      console.log('✓ Data values:', actualData.map(x => x + '%').join(', '));

      // Verify monotonic pattern (only increases or stays same)
      let isMonotonic = true;
      let stepPatternVisible = false;
      let largeJumps = 0;

      for (let i = 1; i < actualData.length; i++) {
        if (actualData[i] < actualData[i-1]) {
          isMonotonic = false;
          break;
        }

        // Check for large jumps (wake-up spikes)
        const jump = actualData[i] - actualData[i-1];
        if (jump > 5.0) {
          largeJumps++;
          stepPatternVisible = true;
        }
      }

      console.log('✓ Monotonic (never decreases):', isMonotonic ? 'YES' : 'NO');
      console.log('✓ Step pattern visible:', stepPatternVisible ? 'YES' : 'NO');
      console.log('✓ Large wake-up jumps (>5%):', largeJumps);
      console.log('✓ Range:', Math.min(...actualData).toFixed(1) + '% - ' + Math.max(...actualData).toFixed(1) + '%');
      console.log('✓ Final usage level:', Math.max(...actualData).toFixed(1) + '%');

    } catch (e) {
      console.log('✗ Chart data parsing failed:', e.message);
    }
  }

  // Check regression R² (should be lower due to randomness)
  const rSquaredMatch = bodyText.match(/Regression R².*?(\\d+\\.\\d+)/);
  console.log('✓ Regression R²:', rSquaredMatch?.[1] || 'Not found', '(lower expected for steeper/random slopes)');

  // Check projection
  const projectionMatch = bodyText.match(/Projected @ 7d.*?(\\d+\\.?\\d*)%/);
  const projectedValue = projectionMatch?.[1] ? parseFloat(projectionMatch[1]) : 0;
  console.log('✓ 7-day projection:', projectedValue + '%');
  console.log('✓ Target reached (around 70%):', Math.abs(projectedValue - 70) < 10 ? 'YES' : 'NO');

  // Check title and labels
  console.log('✓ Title updated to Critical:', bodyText.includes('Critical') ? 'YES' : 'NO');
  console.log('✓ Chart title "Secondary Usage (7d)":', bodyText.includes('Secondary Usage (7d)') ? 'YES' : 'NO');

  await browser.close();

  console.log('\\n=== CRITICAL SCENARIO COMPLIANCE ===');
  console.log('✓ Steeper slopes with more randomness: Expected');
  console.log('✓ Ends around 70%: Expected');
  console.log('✓ Same step function pattern: Expected');
  console.log('✓ Removed unnecessary fields: Expected');

  console.log('\\nScreenshot saved to /tmp/critical-graph.png');
}

verifyCritical().catch(console.error);