# Green build, healthy container, broken page

![A browser window held at a checkpoint gate between two server racks](./assets/launch-hero.webp)

The release pipeline did everything it promised. The image built. The container came up. The health endpoint returned 200 in under a second, and the load balancer started sending traffic.

The page was still broken. Somewhere between the build output and the browser, the stylesheet had turned into a stub: an HTTP 200 response with no rules in it. Users got unstyled HTML where the interface used to be.

Nothing in that pipeline lied. Every check answered the question it was asked. The problem is that none of the checks were asked the right question: does the page a user receives still render the way it did when the team approved it?

| Broken after release | Correct rendering |
| --- | --- |
| ![Broken frontend layout](./assets/frontend-css-broken.png) | ![Correct frontend layout](./assets/frontend-css-restored.png) |

This is the incident shape [Frontend Promotion Guard](https://github.com/Reality-JH/frontend-promotion-guard) (FPG) is built for: technically healthy, visibly broken.

## Two blind spots

**Health checks measure liveness, not correctness.** A 200 on `/` means the server answered. It says nothing about which bytes the browser received for the stylesheet, whether the asset path still resolves after a CDN or reverse proxy change, or whether the CSS that arrived is the CSS the build produced. In the scenario above every probe stayed green while the page shipped with no rules at all.

**Screenshot diffing alone has a threshold problem.** Pixel comparison is a good tripwire and a weak judge. Below is a real run against a deliberately broken demo server: the stylesheet endpoint returns `/* intentionally broken */` with status 200, and the page loses all styling. The measured pixel diff is 5.537 percent. The configured ceiling in the demo config is 12 percent. A pixel-only gate would mark this release acceptable.

![Report card comparing baseline, unstyled current page, and red diff overlay at 5.537 percent](./assets/fpg-report-triptych.png)

The tripwire value of pixel diff stays. The judgment needs a second signal that understands what the page is supposed to be.

## A gate with three levels

FPG is a TypeScript CLI. It needs Node.js 20+ and a system Chrome or Edge; Docker is optional and only used by the release level. It models a frontend release as three gates, each with a different blast radius:

- `fpg audit` checks the artifact. It globs the emitted CSS files, fails on leftover source directives (`@apply`, `@theme`, `@utility`, `@custom-variant` in the example config), and fails when required selectors are missing. No browser, no services, no side effects.
- `fpg verify` checks the wire. It runs the audit, then drives a real Chrome or Edge through every configured route at every configured viewport: computed-style assertions (`selector`, `property`, exactly one of `equals` or `notEquals`), horizontal overflow measurement, console error collection, and a pixelmatch comparison against committed baselines. It observes a running target and changes nothing.
- `fpg promote` checks the release. With Docker configured, it snapshots the current production image ID under a timestamped rollback tag, starts the candidate container on an isolated port, runs the full verification against that port, and only then tags the candidate into production and re-verifies it. If production verification fails, it restores the snapshot and verifies the restore. A repository-local release lock refuses concurrent `promote` or `rollback` runs and reports the lock owner's PID, start time, and commit.

Two more commands complete the set. `fpg baseline update` is the only writer of visual baselines: it is explicit by design, a failed run never replaces a baseline, and every update writes `visual-baselines/manifest.json` with a SHA-256 digest per approved image. `fpg report` regenerates the static HTML report for the most recent run. `capture` and `compare` split `verify` into its collection and regression halves for debugging.

Just as important is what the tool does not do. It does not replace feature tests, security tests, accessibility review, or human acceptance. A baseline exists because a human looked at the page and approved it. The gate makes sure the approval still holds after the release machinery has run.

## What a run produces

The whole arc in one terminal: `verify` passes on the healthy site, the same command fails against a server answering HTTP 200 with a stub stylesheet.

![A verify run passes on the healthy demo site, then fails against the broken server with a computed-style error](./assets/fpg-verify-demo.svg)

Every command writes a run directory under `release-evidence` containing `run.json` and a self-contained `report.html`: the git commit, base URL, browser version, platform, Node version, every check with its status and detail, every screenshot triptych with its diff ratio, and for promotions the image IDs, stage timings, and final production state. Cookie, Authorization, token, and similar credential patterns are redacted from the report.

A real `verify` run against the bundled Vite/React example (2 routes at 4 viewports, system Chrome reporting `chromium 154.0.8037.58`):

- 48 passed, 0 failed: 40 check rows plus 8 visual comparisons.
- Every pixel diff at 0.000 percent. Total wall time 12.4 seconds.

![A passing FPG report: 48 checks passed, zero failed, verification only](./assets/fpg-report-passed.png)

The passing triptych shows why zero diff is achievable: baseline and current are the same rendering, and the diff panel is blank.

![Baseline and current identical, empty diff panel, 0.000 percent](./assets/fpg-report-triptych-passed.png)

Now the same tool against the broken server (`fpg.broken-test.yml`, one route at 768x900):

- The CSS audit passed. The files on disk were fine; the break was in delivery, which is exactly the split the two levels are meant to separate.
- `home 768x900: .status-grid display` failed. Expected `grid`, computed `block`.
- Horizontal overflow passed at 0px. The console had no errors. The pixel diff passed at 5.537 percent, under the 12 percent ceiling.
- The command exited 1 after 3.9 seconds.

![The failed checks table: audit rows green, .status-grid display failed with actual value block](./assets/fpg-report-checks.png)

Read that list again. Four of the five browser-level signals said the page was fine. The computed-style assertion is the row that refused to sign off.

## Promotion with a verified undo

`promote` exists for the release where the container is the thing being shipped. On a real run with the demo Docker config:

- Candidate stage passed in 12.0 seconds: the candidate container on its own port went through the same audits, computed styles, overflow, console, and pixel checks.
- The production stage failed in 12.4 seconds: the promoted container served the broken stylesheet, and all 8 route-viewport computed-style assertions reported `block` instead of `grid`.
- The rollback stage passed in 20.6 seconds: FPG recreated production from the timestamped snapshot taken before promotion, then ran the verification a third time to prove the restore actually worked.

Total wall time was 48.2 seconds, the run record shows `finalState: restored` and `rolledBack: true`, and the report lists the candidate image ID, the previous and final production image IDs, and the rollback tag that was used.

![Release stages table: candidate passed, production failed, rollback passed](./assets/fpg-report-stages.png)

![The restored report: final state restored, rolled back yes, rollback reference and image IDs recorded](./assets/fpg-report-restored.png)

Two details matter for production use. `docker.requireImmutableImage: true` forces digest or image ID references for pre-existing candidates and explicit rollbacks, and the record stores resolved image IDs even when ordinary tags are used, so the report names what actually ran rather than what the tag currently means. `fpg rollback IMAGE` is the manual escape hatch and follows the same verification rule.

## In CI

The smallest GitHub Actions integration is the non-mutating `verify` command plus an evidence upload on failure:

```yaml
- uses: Reality-JH/frontend-promotion-guard@v0.3.0
  with:
    config: fpg.yml
    command: verify
- if: always()
  uses: actions/upload-artifact@v4
  with:
    name: frontend-promotion-evidence
    path: release-evidence
```

The Action refuses `baseline update` entirely, and `command: promote` only runs when `confirm-promotion: true` is set, so an accidental input change cannot mutate container state. Baseline updates stay a local, reviewed step: update, eyeball the old image and the diff, commit the images and the manifest through a pull request. Pin the runner OS, browser major version, and fonts when pixel stability matters.

To reproduce the runs above locally:

```bash
npm ci && npm run build && npm run example:build && npm run example:serve
node dist/cli.js verify --config fpg.example.yml
FPG_BREAK_CSS=1 node examples/vite-react/server.mjs   # second terminal
node dist/cli.js verify --config fpg.broken-test.yml
```

## What is next

Current exploration, in order of how confident I am it belongs: a `monitor` command for repeated checks against a live target; semantic visual diffing that compares accessibility snapshots, masks noisy regions, and freezes clocks to cut pixel flakiness; and remote baseline storage with richer GitHub reporting for teams that cannot commit megabytes of PNGs. Each of these narrows the gate's margin of error rather than widening its scope.

## The point

FPG is not a promise that a page is correct. It is a refusal to call a release safe on the strength of build output, HTTP status, and container health alone. If your on-call story includes a deploy that was technically healthy and visibly broken, this is the gap the tool closes.

Maintainer: Reality-JH. Security reports: `849034843@qq.com`.
