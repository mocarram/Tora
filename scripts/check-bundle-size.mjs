/**
 * App-size / performance budget check.
 *
 * Measures the built artifacts under out/ against bundle-budget.json and fails
 * if any check exceeds its budget. These bytes are what ship inside the packaged
 * asar, so they are the meaningful "app size" signal without needing a macOS
 * runner or code signing. Run after `npm run build`.
 *
 * Dependency-free (Node built-ins only) so it stays cheap and trustworthy.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const budget = JSON.parse(readFileSync(join(root, 'bundle-budget.json'), 'utf8'))

/** Sum the sizes of files under dir, optionally filtered by extension. */
function dirSize(dir, exts) {
  let total = 0
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return null // directory missing (build not run)
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = dirSize(full, exts)
      if (sub !== null) total += sub
    } else if (!exts || exts.includes(extname(entry.name))) {
      total += statSync(full).size
    }
  }
  return total
}

const kb = (bytes) => (bytes / 1024).toFixed(1)
const rows = []
let failed = false
let missing = false

for (const check of budget.checks) {
  const bytes = dirSize(join(root, check.path), check.ext)
  if (bytes === null) {
    rows.push({ label: check.label, used: 'missing', budget: `${check.maxKB} KB`, status: 'MISSING' })
    missing = true
    continue
  }
  const overBudget = bytes > check.maxKB * 1024
  if (overBudget) failed = true
  const pct = Math.round((bytes / (check.maxKB * 1024)) * 100)
  rows.push({
    label: check.label,
    used: `${kb(bytes)} KB`,
    budget: `${check.maxKB} KB`,
    status: overBudget ? `OVER (${pct}%)` : `ok (${pct}%)`,
  })
}

// Plain-text table to the log.
const pad = (s, n) => String(s).padEnd(n)
console.log(pad('Artifact', 40), pad('Size', 14), pad('Budget', 12), 'Status')
console.log('-'.repeat(78))
for (const r of rows) {
  console.log(pad(r.label, 40), pad(r.used, 14), pad(r.budget, 12), r.status)
}

// Markdown summary for the GitHub Actions job summary, when available.
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    '### Bundle size budget',
    '',
    '| Artifact | Size | Budget | Status |',
    '| --- | ---: | ---: | --- |',
    ...rows.map((r) => `| ${r.label} | ${r.used} | ${r.budget} | ${r.status} |`),
    '',
  ].join('\n')
  try {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n')
  } catch {
    // Summary is best-effort; never fail the check on a summary write error.
  }
}

if (missing) {
  console.error('\nOne or more artifacts are missing. Did you run `npm run build` first?')
  process.exit(2)
}
if (failed) {
  console.error('\nBundle size budget exceeded. Trim the bundle or raise the budget deliberately.')
  process.exit(1)
}
console.log('\nAll artifacts within budget.')
