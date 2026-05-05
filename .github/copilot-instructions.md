# Copilot Coding Instructions

## Project overview

This is a **Node.js ESM project** that ships both as a GitHub Action (`action.yml`) and as an npm CLI package (`@rajbos/github-copilot-pr-analysis`).

It analyzes pull requests across GitHub organizations or user accounts and reports Copilot, Claude, and Codex usage patterns with weekly breakdown and optional Mermaid chart generation.

## Tech stack

- **Runtime**: Node.js ≥ 20, ES Modules (`"type": "module"`)
- **Key dependencies**: `axios` (HTTP), `node-cache` (caching), `commander` (CLI), `csv-writer`, `glob`
- **Testing**: Jest with `--experimental-vm-modules` — run tests with `node --experimental-vm-modules node_modules/jest-cli/bin/jest.js`
- **Linting**: ESLint — run with `npm run lint`

## File layout

| Path | Purpose |
|------|---------|
| `src/index.js` | GitHub Action / `npm run analyze` entry point |
| `src/cli.js` | npm CLI entry (`copilot-pr-analysis` binary) |
| `src/pr-analyzer.js` | Core `GitHubPRAnalyzer` class |
| `src/mermaid-generator.js` | Mermaid chart generation |
| `src/constants.js` | Shared constants (e.g. `REPORT_FOLDER`) |
| `tests/` | Jest test suites |
| `action.yml` | GitHub Action definition |
| `skipped_orgs.txt` | Default org-skip config |

## Coding conventions

- Use `export` / `import` (ESM) — never `require`.
- All user-visible log/status output goes to `console.log` (or `console.error` for errors). In the CLI (`src/cli.js`) these are redirected to `stderr` so stdout remains clean JSON.
- The `GitHubPRAnalyzer` constructor signature: `(token, owner, repo = null, isOrg = false)`.  
  Pass `isOrg: true` to use the `/orgs/{org}/repos` GitHub API endpoint.
- Cache keys follow the pattern `<resource>_<owner>_<page>`.
- Retry logic with exponential backoff is centralised in `_makeApiRequestWithRetry`.
- Private repository names are masked in CI environments (see `maskPrivateRepoName`).

## Running locally

```bash
GH_PAT=ghp_xxx npm run analyze          # full analysis, writes to report/
GH_PAT=ghp_xxx npm run charts           # generate Mermaid charts

# CLI (after npm install -g or via npx)
copilot-pr-analysis my-org --token ghp_xxx
```

## Testing

```bash
node --experimental-vm-modules node_modules/jest-cli/bin/jest.js
```

One pre-existing failure exists in `tests/api-retry-integration.test.js` (bracket formatting mismatch) — do not worry about it unless you are fixing that specific test.
