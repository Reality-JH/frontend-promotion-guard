# Release checklist

This checklist records the release evidence required for v0.3.0.

## Local release preparation

- [x] English README and launch article.
- [x] Simplified Chinese README and translated launch article.
- [x] Maintainer and security contact recorded.
- [x] MIT license and dependency audit recorded.
- [x] License scan runs in CI.
- [x] Ubuntu, Windows, and macOS Node/browser matrix documented.
- [x] Ubuntu Docker build documented.
- [x] Unit, CLI, typecheck, build, browser, failure, promotion, and rollback checks completed locally.
- [x] Git author identity and public repository configured.
- [x] Runtime configuration validation covers routes, viewports, assertions, thresholds, URLs, ports, and Docker conflicts.
- [x] Docker integration covers promotion, candidate rejection, production restoration, and rollback verification failure.
- [x] Reports record runtime, browser, stage timing, immutable image IDs, and final production state.
- [x] Release operations use a local lock and the example workflow uses GitHub concurrency.
- [x] Baseline updates generate SHA-256 manifests and remain unavailable from the GitHub Action.
- [x] Documentation separates targeted checks, module gates, and release gates.
- [x] GitHub Action promotion requires a separate explicit confirmation input.

## GitHub release steps

1. Run the full local verification suite.
2. Push `main` and confirm the cross-platform and Docker integration jobs pass.
3. Create tag `v0.3.0` from the verified commit.
4. Confirm `Reality-JH/frontend-promotion-guard@v0.3.0` resolves.
5. Open the uploaded failed-run evidence report and confirm the final image ID and rollback state.
6. Publish the bilingual release notes from `docs/v0.3.0-release.md` and `docs/v0.3.0-release.zh-CN.md`.
