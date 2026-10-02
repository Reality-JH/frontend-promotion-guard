# Changelog

All notable changes to this project are documented in this file. The format follows Keep a Changelog and the project adheres to Semantic Versioning.

## [0.4.0] - 2026-10-02

### Added

- `fpg monitor` repeatedly verifies a live target on an interval and posts webhook alerts on down/recovered transitions, with a persisted state file, interval jitter, and graceful shutdown.
- Semantic visual gating: ARIA snapshot diff per route and viewport (`visual.ariaSnapshot`, `ariaSnapshotMode`), `visual.maskSelectors` for noisy regions, `visual.freezeTime` clock freezing, and per-route `waitUntil`/`fullPage` overrides.
- `fpg baseline pull`/`push` sync baselines through configured `visual.remoteSync` commands, and `fpg verify --github` writes a Job Summary, `result`/`diffRatio` outputs, and `::error` annotations.
- Action inputs `baseline-pull`, `baseline-push`, and `github`, plus Action outputs; rollout-controller integration shapes documented in `docs/integrations.md`.
- npm package metadata: `repository`, `bugs`, `homepage`, `keywords`, and `publishConfig` with public access and provenance.
- `CHANGELOG.md`, `docs/releasing.md`, `docs/monitor.md`, `docs/visual-gate.md`, bilingual launch post, README badges, and a terminal demo animation.

### Fixed

- Corrected the GitHub owner name in Action usage examples, workflow files, and maintainer references. The underscore form is not a valid GitHub username, so `uses:` references resolved to a 404 repository. All references now use `Reality-JH`.

## [0.3.0] - 2026-08-26

### Changed

- Documented the three gate levels: targeted check (`audit`), module gate (`verify`), and release gate (`promote`). FPG is not a mandatory step after every frontend edit.
- The GitHub Action requires `confirm-promotion: true` in addition to `command: promote`, so ordinary pull-request workflows cannot mutate container state by accident.

## [0.2.0] - 2026-08-24

### Added

- Runtime configuration validation for routes, viewports, assertions, thresholds, URLs, ports, and Docker conflicts before any browser or Docker operation starts.
- Repository-local release lock shared by `promote` and `rollback`, reporting the lock owner's PID, start time, and commit.
- Optional `docker.requireImmutableImage` enforcement for existing candidates and explicit rollback arguments.
- SHA-256 baseline manifest written by `baseline update`; baseline updates remain unavailable in the GitHub Action.
- Reports now record actual Docker image IDs for candidate, previous production, and final production, plus stage timings and runtime and browser versions.
- Docker integration scenarios in CI covering promotion, candidate rejection, production restoration, and rollback verification failure.

### Fixed

- Test suite runs on Windows with Node 20.

## [0.1.1] - 2026-08-24

### Fixed

- Browser discovery on macOS.
- Approved visual baselines are kept when running in CI.

## [0.1.0] - 2026-08-24

### Added

- Initial release: `fpg audit`, `capture`, `compare`, `verify`, `baseline update`, `promote`, `rollback`, and `report` commands.
- Built-CSS audit for forbidden source directives and required selectors.
- Computed-style assertions through playwright-core against a system Chrome or Edge.
- Multi-route, multi-viewport screenshot comparison with pixelmatch.
- Single-host Docker candidate promotion with automatic rollback to the previous image.
- Static HTML evidence report with baseline, current, and diff images.
- Composite GitHub Action and YAML configuration.
- Credential pattern redaction in command output.

[0.3.1]: https://github.com/Reality-JH/frontend-promotion-guard/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Reality-JH/frontend-promotion-guard/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Reality-JH/frontend-promotion-guard/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Reality-JH/frontend-promotion-guard/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Reality-JH/frontend-promotion-guard/releases/tag/v0.1.0
