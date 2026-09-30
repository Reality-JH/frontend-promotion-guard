# Continuous monitoring with `fpg monitor`

`verify` gates a deployment. `monitor` watches what the gate cannot see: the
production site drifting *between* deployments. CDN cache refreshes, third-party
script updates, CMS edits, and upstream template changes can break a page long
after the last deploy passed.

`fpg monitor` re-runs the existing compare pipeline on an interval: computed
style assertions, horizontal overflow checks, browser console errors, and
pixelmatch screenshot diffs against `visual.baselineDir`. It does not run
`cssAudit`, because production serves built assets and the source CSS files are
not available there. Update baselines with `fpg baseline update` when the
intended look changes.

## Usage

```bash
fpg monitor --config fpg.yml           # run the loop in the foreground
fpg monitor --once --config fpg.yml    # run exactly one round, then exit
```

`--once` exists for cron, systemd timers, and Task Scheduler, where an external
scheduler owns the cadence. `--base-url` still works and takes precedence over
`monitor.baseUrl`.

## Configuration

```yaml
monitor:
  interval: 5m          # delay between rounds; accepts ms, s, m, h. Default "5m".
  failureThreshold: 2   # consecutive failed rounds before a down alert. Default 2.
  recoveryNotify: true  # post "recovered" when checks pass again. Default true.
  stateFile: ./monitor-state.json  # persisted across restarts. Default monitor-state.json next to the config file.
  baseUrl: https://prod.example.com  # optional; monitor-only override of the top-level baseUrl.
  webhook:
    url: https://hooks.example.com/fpg-monitor
    headers:
      Authorization: Bearer replace-me
    timeoutMs: 10000    # per-request timeout. Default 10000.
```

`webhook` is optional. Without it, state transitions are only logged to stdout
and `stateFile`. The interval is jittered by up to +10% so several monitors do
not synchronize into a common beat.

## Alert semantics

The monitor keeps a `status` of `up` or `down` plus a consecutive-failure count
in `stateFile`. Alerts fire only on transitions:

- `down`: emitted once when the consecutive-failure count reaches
  `failureThreshold`. Further failing rounds stay silent.
- `recovered`: emitted once on the first passing round after `down`, if
  `recoveryNotify` is enabled.

A single flaky round resets nothing; a failed webhook call is logged and does
not block the next round. Each round writes evidence (`run.json`,
`report.html`, screenshots) under `visual.evidenceDir`, pruned by
`visual.retention`, and the state file is rewritten after every round, so a
restart resumes without re-alerting.

## Webhook payload

`POST` with `Content-Type: application/json`:

```json
{
  "event": "down",
  "target": "https://prod.example.com",
  "failures": ["home 768x900: visual diff 42.00% exceeds 12.00%"],
  "reportPath": "release-evidence/2026-09-30T08-15-00-000Z-monitor/report.html",
  "at": "2026-09-30T08:15:30.000Z"
}
```

`event` is `down` or `recovered`; `failures` is the list of check failures from
that round (empty for `recovered`); `reportPath` points at the HTML evidence
for the round.

## Schedulers

cron, one round every 5 minutes:

```cron
*/5 * * * * cd /srv/fpg && node /opt/frontend-promotion-guard/dist/cli.js monitor --once --config /srv/fpg/fpg.yml >> /var/log/fpg-monitor.log 2>&1
```

systemd, long-running service managing its own interval:

```ini
[Unit]
Description=Frontend Promotion Guard monitor
After=network-online.target

[Service]
ExecStart=/usr/bin/node /opt/frontend-promotion-guard/dist/cli.js monitor --config /etc/fpg/fpg.yml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

SIGINT and SIGTERM stop the loop after the current round finishes, so the
default `KillSignal` already shuts the service down gracefully.

Windows Task Scheduler, one round per trigger:

```bat
schtasks /create /tn "fpg-monitor" /sc minute /mo 5 /tr "node C:\opt\frontend-promotion-guard\dist\cli.js monitor --once --config C:\srv\fpg\fpg.yml"
```

## Relaying to chat webhooks

The payload above is FPG's own schema. Chat products expect their own shape, so
put a small relay in front of them. A minimal Node receiver that fans out to
Slack, Feishu, or DingTalk incoming webhooks:

```js
import { createServer } from "node:http";

const target = process.env.RELAY_WEBHOOK; // Slack, Feishu, or DingTalk endpoint
const kind = process.env.RELAY_KIND;      // "slack" | "feishu" | "dingtalk"

const text = (a) => `[fpg] ${a.event} ${a.target} ${a.failures[0] ?? "checks passed"}`;
const body = (a) => JSON.stringify(
  kind === "slack" ? { text: text(a) }
  : kind === "feishu" ? { msg_type: "text", content: { text: text(a) } }
  : { msgtype: "text", text: { content: text(a) } });

createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    res.writeHead(204).end();
    await fetch(target, { method: "POST", headers: { "content-type": "application/json" }, body: body(JSON.parse(Buffer.concat(chunks).toString())) });
  });
}).listen(9090);
```

Point `monitor.webhook.url` at the relay and let it repackage the event.

## Relationship to `fpg verify`

Both share routes, viewports, computed-style assertions, and the baseline
directory, but they answer different questions:

- `verify` runs at deploy time, once per release, and includes `cssAudit`
  against build artifacts. It decides whether a candidate may ship.
- `monitor` runs continuously against the live `baseUrl` (or
  `monitor.baseUrl`), never touches Docker or CSS sources, and reports drift
  after the fact via webhook.

Use both: `verify` keeps bad builds out, `monitor` tells you when a good deploy
went bad anyway.
