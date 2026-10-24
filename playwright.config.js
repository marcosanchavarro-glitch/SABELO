const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  // Usa Chrome instalado en Windows: evita depender de una descarga efímera del
  // navegador empaquetado de Playwright en entornos de escritorio aislados.
  use: { channel: 'chrome', headless: true, screenshot: 'only-on-failure', video: 'off', trace: 'retain-on-failure' }
});
