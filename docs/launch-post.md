# Your backend build is green. Your frontend can still be broken.

Backend developers are used to trusting a few signals: the image built, the health check passed, and the endpoint returned 200.

Those signals are useful. They are not enough for a browser.

A page can return its HTML successfully while its CSS is missing, uncompiled, or pointing at the wrong asset path. The container stays healthy. The load balancer stays happy. A user opens the page and sees a layout that has quietly fallen apart.

Here is the failure in plain sight:

| Broken after release | Correct rendering |
| --- | --- |
| ![Broken frontend layout](./assets/frontend-css-broken.png) | ![Correct frontend layout](./assets/frontend-css-restored.png) |

The point is not that every visual change is a failure. The point is that a page that lost its CSS should not reach production while build and health checks remain green.

That failure is especially frustrating when frontend work is not your main job. You do not need another design system. You need a small, repeatable answer to one question:

> Does the page users will receive still look and behave like the page we approved?

## Frontend Promotion Guard

[Frontend Promotion Guard](../README.md) is a release gate for that question.

It checks the built CSS before the browser sees it. It opens the running page in a real Chrome or Edge executable and checks computed styles. It captures configured routes at configured widths and compares them with protected baselines. When Docker is part of the release, it runs the candidate on an isolated port, promotes only after acceptance, and restores the previous image if production re-verification fails.

The important detail is the order. A healthy container is not promoted just because it is healthy.

## What the gate catches

The example project includes two routes and four viewports. Its checks cover:

- CSS output that still contains source directives such as `@apply`.
- Required selectors that disappeared from the build.
- A critical element whose computed `display` changed.
- Horizontal overflow at the target widths.
- Browser console errors.
- Screenshot differences above the configured pixel ratio.
- A candidate container that passes while the current production container stays untouched.
- A production recheck that fails and triggers a rollback to the saved image.

The gate does not replace feature tests, security tests, accessibility review, or a human looking at a new page. It handles a narrower problem and makes that problem harder to miss.

## Try it locally

```bash
npm install
npm run build
npm run example:build
npm run example:serve
```

In another terminal:

```bash
node dist/cli.js baseline update --config fpg.example.yml
node dist/cli.js verify --config fpg.example.yml
```

The first command is deliberately explicit. A failed test cannot replace a baseline. The second command writes a static report under `release-evidence` with the baseline, current image, diff image, commit, checks, and rollback state.

To see the failure path, run the provided broken CSS server and verify against `fpg.broken-test.yml`. The page still answers HTTP requests, but the computed-style check fails.

## Why this is useful for backend-led teams

You can keep the release contract close to the code you already own:

1. Build the frontend.
2. Start the candidate service.
3. Run one command with a YAML file.
4. Upload the evidence directory when the check fails.

The tool does not ask you to adopt a hosted dashboard or move deployment to a new platform. It uses Node, a system browser, and optional Docker. Routes, selectors, viewports, ports, image names, thresholds, and evidence paths live in configuration.

That keeps the useful part of frontend release work visible to people who spend most of their time in APIs, workers, queues, and containers.

## GitHub Actions

The repository includes a runnable Vite/React workflow and a cross-platform matrix. The smallest integration is:

```yaml
- uses: Reality_JH/frontend-promotion-guard@v0.2.0
  with:
    config: fpg.yml
    command: verify
```

Upload `release-evidence` on failure. The report is a file a teammate can open, not a green check with no explanation.

## A small tool with a clear limit

Frontend Promotion Guard is not a promise that a page is correct. It is a refusal to call a release safe based only on build output, HTTP status, and container health.

If your team has been paged because a release was technically healthy but visibly broken, this is the gap it is meant to close.

Maintainer: Reality_JH. Security reports: `849034843@qq.com`.
