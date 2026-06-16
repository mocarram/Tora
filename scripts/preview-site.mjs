// Render the static site for visual QA (no deploy). Outputs full-page PNGs in
// light + dark at desktop and mobile widths. Run: node scripts/preview-site.mjs
import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const url = pathToFileURL(join(process.cwd(), 'site', 'index.html')).href
const browser = await chromium.launch()

async function shot(name, { width, height, scheme }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: scheme,
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `/tmp/site-${name}.png`, fullPage: true })
  await ctx.close()
  console.log('wrote /tmp/site-' + name + '.png')
}

await shot('desktop-light', { width: 1280, height: 900, scheme: 'light' })
await shot('desktop-dark', { width: 1280, height: 900, scheme: 'dark' })
await shot('mobile-light', { width: 390, height: 800, scheme: 'light' })
await browser.close()
