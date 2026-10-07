import { defineConfig, devices } from '@playwright/test'
import type { PlaywrightTestConfig } from '@playwright/test'
import { join } from 'node:path'
import { DAILY_SEED, E2E_DIR, GAME_TOKEN_SECRET, VARIANTS, X_STORE_COPY, baseUrl } from './support/env.ts'
import type { Variant } from './support/env.ts'

const noLimits = {
  RATE_LIMIT_GLOBAL: '100000',
  RATE_LIMIT_CREATE_GAME: '100000',
  RATE_LIMIT_ACTION: '100000',
  RATE_LIMIT_CLIPS: '100000',
}

type Server = Exclude<NonNullable<PlaywrightTestConfig['webServer']>, unknown[]>

const servers = (Object.keys(VARIANTS) as Variant[]).flatMap((name): Server[] => {
  const v = VARIANTS[name]
  return [
    {
      command: 'npx tsx src/index.ts',
      cwd: join(E2E_DIR, '..', 'backend'),
      url: `http://localhost:${v.backendPort}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...noLimits,
        NODE_ENV: 'test',
        PORT: String(v.backendPort),
        GAME_TOKEN_SECRET,
        DAILY_SEED,
        STORAGE_DRIVER: 'fs',
        STORAGE_DIR: v.store === 'X' ? X_STORE_COPY : join(E2E_DIR, 'fixtures', v.store),
        ALLOWED_ORIGIN: baseUrl(name),
        ...v.env,
      },
    },
    {
      command: 'npx vite --config ../e2e/vite.e2e.config.ts',
      cwd: join(E2E_DIR, '..', 'frontend'),
      url: baseUrl(name),
      reuseExistingServer: false,
      timeout: 60_000,
      env: { E2E_BACKEND_PORT: String(v.backendPort), E2E_FRONTEND_PORT: String(v.frontendPort) },
    },
  ]
})

// E2E-44: matriz de navegadores reducida a los casos de humo, fuga e intento repetido.
const CROSS_BROWSER = /E2E-(01|02|26|45|50|54)_/
// E2E-74 (fundido) y E2E-76 no aplican a Firefox; WebKit lo ejecuta ademas de Chromium.
const WEBKIT_ONLY_EXTRA = /E2E-(01|02|26|45|50|54|74)_/

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: { trace: 'retain-on-failure', locale: 'es-ES', timezoneId: 'Europe/Madrid' },
  webServer: servers,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: CROSS_BROWSER },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: WEBKIT_ONLY_EXTRA },
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'] }, grep: /@mobile/ },
  ],
})
