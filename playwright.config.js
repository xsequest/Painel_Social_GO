import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:8080', viewport: { width: 1366, height: 900 } },
  webServer: { command: 'python -m http.server 8080 --bind 127.0.0.1', url: 'http://127.0.0.1:8080', reuseExistingServer: true, stdout: 'ignore', stderr: 'ignore' }
});
