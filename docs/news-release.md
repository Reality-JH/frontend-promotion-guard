# Frontend Promotion Guard v0.2.0 released

## An open-source release gate for frontend failures that health checks miss

**For immediate release**

Frontend Promotion Guard (FPG) v0.2.0 is now available as an open-source Node.js CLI and reusable GitHub Action.

Many deployment pipelines stop at a successful build, an HTTP 200 response, and a healthy container. Those checks do not prove that a browser received usable CSS or that a page still matches the version the team approved. FPG adds that missing check to the release path.

FPG can:

- inspect built CSS for source directives and missing selectors;
- assert real computed styles in Chrome or Edge;
- compare screenshots across configured routes and viewport sizes;
- validate a candidate Docker container before promotion;
- recheck production and restore the previous image if verification fails; and
- generate a static HTML report with screenshots, diffs, commit information, test results, and rollback state.

The tool is configured with YAML and supports Windows, Linux, and GitHub Actions environments. Docker is optional for teams that only need CSS, browser, and screenshot checks. Baselines are updated only by an explicit command, so a failed run cannot silently overwrite the approved images.

Version 0.2.0 concentrates on release evidence. Its public CI now exercises successful promotion, candidate rejection, production failure with restoration, and rollback verification failure. Reports record actual Docker image IDs, the final production state, stage timing, and browser/runtime details. The release also adds early configuration validation, a repository-local release lock, optional immutable-image enforcement, baseline SHA-256 manifests, and safer GitHub Action input handling.

FPG is intentionally narrow. It does not replace functional testing, security testing, accessibility review, or human acceptance. It is a release guard for one recurring failure mode: a technically healthy deployment that is visibly broken in the browser.

Repository: https://github.com/Reality-JH/frontend-promotion-guard

Maintainer: Reality-JH

Security contact: 849034843@qq.com

## Suggested social copy

Build green. HTTP 200. Container healthy. Frontend broken.

Frontend Promotion Guard adds CSS artifact checks, real browser computed-style assertions, multi-viewport screenshot comparison, candidate Docker verification, and automatic rollback evidence to the release path.

Open source, YAML-configured, and usable from Node.js, PowerShell, Linux, and GitHub Actions.

https://github.com/Reality-JH/frontend-promotion-guard
