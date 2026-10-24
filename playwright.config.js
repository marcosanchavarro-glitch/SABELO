const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: { headless: true, screenshot: 'only-on-failure', video: 'off', trace: 'retain-on-failure' }
});
