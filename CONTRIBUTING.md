# Contributing

## Branch model

| Branch     | Role                                                                              |
| ---------- | --------------------------------------------------------------------------------- |
| `main`     | Production. Only release-ready, reviewed code lands here. Tagged builds ship from it. |
| `staging`  | Integration. Day-to-day work is merged here first and soaked behind the full CI suite. |
| `claude/*` | Short-lived feature/work branches. Open a PR into `staging` when ready.            |

Flow: feature branch -> PR into `staging` -> (soak, green CI) -> PR `staging` -> `main`
for a release. Keep history clean: small, focused commits with conventional-style
messages (`fix:`, `feat:`, `ci:`, `docs:`, `design:`). No em dashes anywhere,
including commit messages and UI copy (the lint rule enforces it in source).

**Linear history only - no merge commits.** Integrate by fast-forward: rebase a
feature branch onto the latest `staging` before landing it (`git rebase staging`),
then fast-forward (`git merge --ff-only`). Never create merge commits on `staging`
or `main`. When several branches land together, rebase them in series so each
fast-forwards onto the previous.

## Quality gates (CI)

Three workflows run on pull requests and on pushes to `main` / `staging`:

### `CI` (`.github/workflows/ci.yml`)

Typecheck (node + web projects), ESLint, Prettier check, unit/integration tests,
and a full build of main + preload + renderer. Runs on every branch push.

### `Security` (`.github/workflows/security.yml`)

- **npm audit** - hard gate; fails on a high or critical advisory in a dependency.
- **dependency-review** - PR-only; blocks a PR that introduces a vulnerable or
  disallowed-license dependency.
- **Electronegativity** - advisory Electron-specific static analysis (insecure
  `webPreferences`, CSP, missing permission handlers, etc.). Reported as a job
  summary + uploaded artifact rather than a gate, because it false-positives on an
  already-hardened app. Review new findings whenever the report changes.

### `Bundle size` (`.github/workflows/bundle-size.yml`)

Builds the app and runs `npm run size`, which measures the emitted `out/`
artifacts (the bytes that ship inside the asar) against `bundle-budget.json`.
Fails on a budget overrun. This is the app-size / performance signal without
needing a macOS runner or code signing.

Budgets sit a little above current sizes to catch regressions. When a feature
genuinely needs more room, raise the relevant `maxKB` in `bundle-budget.json` in
the same reviewed PR rather than letting the check creep.

> A full packaged `.dmg` size report would need a macOS runner and signing; that
> belongs in a release workflow off `main` tags, not on every push.

## Dependency hygiene

We do not adopt a freshly published version of any package. The repo `.npmrc`
sets `min-release-age=3`, so npm only considers a release once it is at least
three days old. This is the npm-native supply-chain cooldown: it blunts the
attacks where a compromised version is published and then caught and yanked
within hours, because that version is never eligible for install in that window.

- It is enforced by **npm >= 11.10.0** (the `engines` floor in `package.json`).
  Older npm reads the setting harmlessly but does not act on it, so keep your
  npm current when bumping dependencies.
- It gates resolving _new_ versions (`npm install <pkg>`, `npm update`). It does
  **not** affect `npm ci`, which installs the exact versions already pinned in
  `package-lock.json`, so CI and reproducible installs are untouched.
- Security advisories still take priority: when `npm audit` flags a high or
  critical issue, fix it even if the patched version is newer than three days.

## Running the gates locally

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
npm run size        # after a build
npm audit --audit-level=high
```

A Husky pre-commit hook already runs lint-staged (ESLint + Prettier) and a
typecheck on staged changes, so most issues are caught before they reach CI.
