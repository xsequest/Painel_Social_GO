import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:8080/painel-goias/', viewport: { width: 1366, height: 900 } },
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:8080/painel-goias/', reuseExistingServer: !process.env.CI, stdout: 'ignore', stderr: 'ignore' }
});
