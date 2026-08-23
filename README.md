# Frontend Promotion Guard

English is the default project language. [简体中文](./README.zh-CN.md) · [Launch article](./docs/launch-post.md) · [中文文章](./docs/launch-post.zh-CN.md)

Frontend Promotion Guard (FPG) is a reusable release gate for failures that ordinary health checks miss: the build succeeds, HTTP returns 200, and the container is healthy, while production CSS or layout is broken.

FPG audits emitted CSS, evaluates real browser-computed styles, compares screenshots across routes and viewports, accepts an isolated candidate container, promotes only after acceptance, and restores the previous image when production re-verification fails. Every run produces a static HTML evidence report.

FPG does not replace functional testing, security testing, or human acceptance. A human must confirm a correct page before explicitly updating visual baselines.

## Quick start

Node.js 20+ and a system Chrome or Edge are required. Docker is optional unless `promote` or `rollback` is used.

```bash
npm install
npm run build
cp fpg.example.yml fpg.yml
node dist/cli.js audit --config fpg.yml
node dist/cli.js baseline update --config fpg.yml
node dist/cli.js verify --config fpg.yml
```

PowerShell:

```powershell
.\scripts\fpg.ps1 verify --config .\fpg.yml
```

Set `browserPath` or `FPG_BROWSER_PATH` to override system browser discovery. Relative paths resolve from the YAML file. Routes, selectors, viewports, thresholds, evidence and baseline directories, retention, image names, ports, container names, and Docker arguments are configurable; see [`fpg.example.yml`](./fpg.example.yml).

## Commands

`audit`, `capture`, `compare`, `verify`, `baseline update`, `promote`, `rollback IMAGE`, and `report` are available. Only `baseline update` writes baselines. A failed test never replaces them.

The HTML report includes baseline, current, and diff images, image identifiers, Git commit, test results, and rollback state. External commands are spawned with argument arrays rather than shell strings. Common Cookie, Authorization, token, API key, password, and secret patterns are redacted from command output; configuration files must still contain no secrets.

## GitHub Actions

```yaml
- uses: Reality_JH/frontend-promotion-guard@v0.1.0
  with:
    config: fpg.yml
    command: verify
- if: always()
  uses: actions/upload-artifact@v4
  with:
    name: frontend-promotion-evidence
    path: release-evidence
```

Enable this reference after the public `Reality_JH/frontend-promotion-guard` repository and `v0.1.0` tag exist; no remote repository has been created yet. Build and start the target before this step. See [`.github/workflows/example.yml`](./.github/workflows/example.yml) for a runnable Vite/React example and [`.github/workflows/matrix.yml`](./.github/workflows/matrix.yml) for the cross-platform matrix.

## Maintainer and contact

Maintainer: `Reality_JH`. Use repository Issues for ordinary questions. Report security issues to `849034843@qq.com`; do not include credentials, cookies, tokens, or business data in public issues.

## Continuous license scanning

```bash
npm run license:check
```

Every push and pull request scans production dependency licenses. The allowlist and audit record are documented in [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).

## Docker platform matrix

`.github/workflows/matrix.yml` runs Node, browser, test, and license checks on Ubuntu, Windows, and macOS, and performs a real Docker build on Ubuntu. Promotion should still be exercised on the target Docker Desktop/Linux runner because runtime, port, and browser-path behavior varies by platform.

## Development

```bash
npm run typecheck
npm run build
npm test
npm run example:build
```

The locked dependency license audit is in [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md). This project is MIT licensed.
