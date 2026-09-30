# Releasing

This document covers publishing the `frontend-promotion-guard` npm package and tagging the repository for GitHub Action consumers.

## Prerequisites

- An npm account with publish rights on the `frontend-promotion-guard` package, with two-factor authentication enabled for authorization and writes.
- `npm whoami` returns that account before publishing.
- Releases are cut from `main` with a clean working tree.

## Publish steps

1. Choose the version: patch for fixes, minor for backward-compatible features, major for breaking changes.
2. Bump `version` in `package.json` and `package-lock.json` (`npm version <semver> --no-git-tag-version` updates both), add a `CHANGELOG.md` entry, and commit.
3. Rebuild `dist/` and run the verification suite:

   ```bash
   npm ci
   npm run typecheck
   npm run build
   npm test
   ```

   Commit the rebuilt `dist/` output, since the composite Action runs it directly.

4. Inspect the tarball before publishing:

   ```bash
   npm publish --dry-run
   ```

   The package must contain only `dist/`, `action.yml`, `fpg.example.yml`, `LICENSE`, `README.md`, `README.zh-CN.md`, `CHANGELOG.md`, and `package.json`.

5. Publish:

   ```bash
   npm publish
   ```

   `publishConfig` already sets `access: public` and `provenance: true`, so npm applies both automatically. When publishing outside a supported CI environment, pass `npm publish --provenance` explicitly.

6. Tag and push:

   ```bash
   git tag v<version>
   git push origin main --tags
   ```

7. Publish the GitHub release notes from `docs/v<version>-release.md`.

## npm provenance

Provenance attestation links the published tarball to the source commit and the CI job that produced it. npm signs the attestation through Sigstore and shows a provenance badge on the package page. Consumers can verify signatures locally with `npm audit signatures`.

Generating provenance requires a supported CI provider with OIDC token access. On GitHub Actions the publishing job needs `permissions: id-token: write`. Because this repository commits `dist/` for the composite Action, the attestation covers the publish event itself. Keep `dist/` rebuilds reviewed through pull requests.

## Action version pinning

The GitHub Action executes `dist/` from this repository, so the version reference controls the code that runs in a consumer's workflow. Recommend pinning a full commit SHA:

```yaml
- uses: Reality-JH/frontend-promotion-guard@<full-commit-sha>
```

A commit SHA is immutable. A tag such as `@v0.3.1` can be moved, and a floating major tag such as `@v0` changes behavior on every release without any change in the consumer's workflow file. If convenience tags are published later, move them deliberately after the immutable tag and release notes exist, and keep the SHA recommendation in the README.

## Release checklist

- [ ] `CHANGELOG.md` has an entry for the new version.
- [ ] `package.json` and `package-lock.json` versions match the intended tag.
- [ ] `dist/` rebuilt from current sources and committed.
- [ ] `npm run typecheck`, `npm run build`, and `npm test` are green.
- [ ] `npm publish --dry-run` succeeds and lists only the expected files.
- [ ] `npm publish` completed with provenance and the package page shows the badge.
- [ ] Immutable tag `v<version>` pushed and `Reality-JH/frontend-promotion-guard@v<version>` resolves.
- [ ] GitHub release notes published.
