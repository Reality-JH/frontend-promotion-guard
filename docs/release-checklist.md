# Release checklist

This checklist is for the first public release. It records what can be completed locally and what still requires a real GitHub repository.

## Local release preparation

- [x] English README and launch article.
- [x] Simplified Chinese README and translated launch article.
- [x] Maintainer and security contact recorded.
- [x] MIT license and dependency audit recorded.
- [x] License scan runs in CI.
- [x] Ubuntu, Windows, and macOS Node/browser matrix documented.
- [x] Ubuntu Docker build documented.
- [x] Unit, CLI, typecheck, build, browser, failure, promotion, and rollback checks completed locally.
- [ ] Configure Git author identity and create the first local commit.

## GitHub release steps

1. Create the repository as `Reality_JH/frontend-promotion-guard`.
2. Push the local `main` branch.
3. Create tag `v0.1.0` only after the public repository exists.
4. Confirm the Action reference `Reality_JH/frontend-promotion-guard@v0.1.0` resolves.
5. Enable the example and matrix workflows.
6. Upload a failed-run evidence artifact once and open the generated HTML report.
7. Publish the release notes from `docs/launch-post.md`.
