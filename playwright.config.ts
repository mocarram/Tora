import { defineConfig } from '@playwright/test'

// Critical-flow E2E tests drive the packaged Electron app via Playwright's
// Electron support. These require a built app (npm run build) and a display
// server (macOS runner in CI; see .github/workflows/e2e.yml). See GAPS.md.
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  // Driving a real GUI app on a shared CI runner is inherently a bit flaky
  // (window focus, OS timers); retry twice there so a one-off blip does not red
  // a PR, while locally a failure stays a hard, immediate signal.
  retries: isCI ? 2 : 0,
  // List for live logs everywhere; on CI also emit an HTML report so the upload
  // artifact is browsable when a run fails.
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    trace: 'on-first-retry',
  },
})
