import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadConfig } from "../dist/config.js";
import { runMonitor } from "../dist/monitor.js";
import { captureAndCompare } from "../dist/visual.js";

async function sink(t) {
  const hits = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => { hits.push({ body: JSON.parse(body), headers: req.headers }); res.writeHead(204); res.end(); });
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  return { hits, url: `http://127.0.0.1:${server.address().port}/fpg` };
}

async function writeConfig(root, monitorYaml) {
  const path = join(root, "fpg.yml");
  await writeFile(path, `baseUrl: http://127.0.0.1:9/\nroutes: [{ name: home, path: /, readySelector: main }]\nviewports: [{ width: 320, height: 200 }]\nvisual: { evidenceDir: ./evidence }\nmonitor:\n${monitorYaml}\n`);
  return loadConfig(path);
}

const failing = (detail = "home 320x200: visual diff 42.00% exceeds 12.00%") => async (runDir) => ({ failures: [detail], reportPath: join(runDir, "report.html") });
const passing = async (runDir) => ({ failures: [], reportPath: join(runDir, "report.html") });

test("monitor alerts only on state flips", async (t) => {
  const hook = await sink(t);
  const root = await mkdtemp(join(tmpdir(), "fpg-monitor-"));
  const config = await writeConfig(root, `  interval: 30ms\n  failureThreshold: 2\n  stateFile: ./state.json\n  webhook: { url: "${hook.url}", headers: { X-Fpg-Token: s3cret }, timeoutMs: 2000 }`);

  await runMonitor(config, { once: true }, failing());
  assert.equal(hook.hits.length, 0);

  await runMonitor(config, { once: true }, failing());
  assert.equal(hook.hits.length, 1);
  assert.equal(hook.hits[0].body.event, "down");
  assert.equal(hook.hits[0].body.target, "http://127.0.0.1:9");
  assert.deepEqual(hook.hits[0].body.failures, ["home 320x200: visual diff 42.00% exceeds 12.00%"]);
  assert.match(hook.hits[0].body.reportPath, /report\.html$/);
  assert.ok(!Number.isNaN(Date.parse(hook.hits[0].body.at)));
  assert.equal(hook.hits[0].headers["x-fpg-token"], "s3cret");

  await runMonitor(config, { once: true }, failing("still broken"));
  assert.equal(hook.hits.length, 1);

  await runMonitor(config, { once: true }, passing);
  assert.equal(hook.hits.length, 2);
  assert.equal(hook.hits[1].body.event, "recovered");
  assert.deepEqual(hook.hits[1].body.failures, []);

  await runMonitor(config, { once: true }, passing);
  assert.equal(hook.hits.length, 2);

  const state = JSON.parse(await readFile(config.monitor.stateFile, "utf8"));
  assert.equal(state.status, "up");
  assert.equal(state.consecutiveFailures, 0);
  assert.equal(state.lastEvent, "recovered");
});

test("monitor suppresses the recovered event when recoveryNotify is false", async (t) => {
  const hook = await sink(t);
  const root = await mkdtemp(join(tmpdir(), "fpg-monitor-norecover-"));
  const config = await writeConfig(root, `  failureThreshold: 1\n  recoveryNotify: false\n  stateFile: ./state.json\n  webhook: { url: "${hook.url}" }`);
  await runMonitor(config, { once: true }, failing());
  assert.equal(hook.hits.length, 1);
  assert.equal(hook.hits[0].body.event, "down");
  await runMonitor(config, { once: true }, passing);
  assert.equal(hook.hits.length, 1);
});

test("monitor loop repeats on the interval and exits on SIGINT", async (t) => {
  const hook = await sink(t);
  const root = await mkdtemp(join(tmpdir(), "fpg-monitor-loop-"));
  const config = await writeConfig(root, `  interval: 30ms\n  failureThreshold: 2\n  stateFile: ./state.json\n  webhook: { url: "${hook.url}" }`);
  let rounds = 0;
  await runMonitor(config, {}, async (runDir) => {
    rounds += 1;
    if (rounds === 3) process.emit("SIGINT");
    return { failures: ["boom"], reportPath: join(runDir, "report.html") };
  });
  assert.equal(rounds, 3);
  assert.equal(hook.hits.length, 1);
  assert.equal(hook.hits[0].body.event, "down");
});

test("monitor keeps its state when the webhook is unreachable", async () => {
  const dead = createServer();
  await new Promise((resolveListen) => dead.listen(0, "127.0.0.1", resolveListen));
  const url = `http://127.0.0.1:${dead.address().port}/fpg`;
  await new Promise((resolveClose) => dead.close(resolveClose));
  const root = await mkdtemp(join(tmpdir(), "fpg-monitor-deadhook-"));
  const config = await writeConfig(root, `  failureThreshold: 1\n  stateFile: ./state.json\n  webhook: { url: "${url}", timeoutMs: 500 }`);
  const state = await runMonitor(config, { once: true }, failing());
  assert.equal(state.status, "down");
  assert.equal(state.lastEvent, "down");
});

test("monitor runs the real compare pipeline and persists evidence", async (t) => {
  let broken = false;
  const page = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><html><body><main>ready</main><div class="box" style="display:${broken ? "none" : "block"}">x</div></body></html>`);
  });
  await new Promise((resolveListen) => page.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise((resolveClose) => page.close(resolveClose)));
  const hook = await sink(t);
  const root = await mkdtemp(join(tmpdir(), "fpg-monitor-e2e-"));
  const configPath = join(root, "fpg.yml");
  await writeFile(configPath, `baseUrl: http://127.0.0.1:${page.address().port}\nroutes: [{ name: home, path: /, readySelector: main }]\nviewports: [{ width: 320, height: 200 }]\ncomputedStyles: [{ selector: ".box", property: display, equals: block }]\nvisual: { baselineDir: ./baselines, evidenceDir: ./evidence }\nmonitor:\n  failureThreshold: 1\n  stateFile: ./state.json\n  webhook: { url: "${hook.url}", timeoutMs: 3000 }\n`);
  const config = await loadConfig(configPath);
  await captureAndCompare(config, join(root, "seed"), { compare: false, update: true });

  const first = await runMonitor(config, { once: true });
  assert.equal(first.status, "up");
  assert.equal(hook.hits.length, 0);
  const lastRun = (await readFile(join(root, "evidence", ".last-run"), "utf8")).trim();
  const record = JSON.parse(await readFile(join(root, "evidence", lastRun, "run.json"), "utf8"));
  assert.equal(record.command, "monitor");
  assert.ok(record.checks.every((check) => check.status === "passed"));

  broken = true;
  const second = await runMonitor(config, { once: true });
  assert.equal(second.status, "down");
  assert.equal(hook.hits.length, 1);
  assert.equal(hook.hits[0].body.event, "down");
  assert.ok(hook.hits[0].body.failures.some((failure) => failure.includes(".box display")));

  broken = false;
  const third = await runMonitor(config, { once: true });
  assert.equal(third.status, "up");
  assert.equal(hook.hits.length, 2);
  assert.equal(hook.hits[1].body.event, "recovered");
});

test("monitor configuration applies documented defaults", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-monitor-defaults-"));
  const config = await writeConfig(root, "  {}");
  assert.equal(config.monitor.interval, "5m");
  assert.equal(config.monitor.intervalMs, 300_000);
  assert.equal(config.monitor.failureThreshold, 2);
  assert.equal(config.monitor.recoveryNotify, true);
  assert.equal(config.monitor.stateFile, resolve(root, "monitor-state.json"));
  assert.equal(config.monitor.webhook, undefined);
  assert.equal(config.monitor.baseUrl, undefined);
});

test("monitor configuration rejects invalid values before the loop starts", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-monitor-invalid-"));
  const path = join(root, "fpg.yml");
  const base = `routes: [{ name: home, path: /, readySelector: main }]\nviewports: [{ width: 320, height: 200 }]\nmonitor:\n`;
  const load = async (extra, expected) => {
    await writeFile(path, base + extra);
    await assert.rejects(() => loadConfig(path), expected);
  };
  await load(`  interval: whenever\n`, /monitor\.interval must be a duration/);
  await load(`  interval: 0s\n`, /monitor\.interval must be a positive duration/);
  await load(`  failureThreshold: 0\n`, /monitor\.failureThreshold must be a positive integer/);
  await load(`  webhook: { url: "ftp://example.com" }\n`, /monitor\.webhook\.url must be an http or https URL/);
  await load(`  webhook: { url: "http://127.0.0.1:1/", headers: { X-Num: 3 } }\n`, /monitor\.webhook\.headers must map strings to strings/);
  await load(`  baseUrl: not-a-url\n`, /monitor\.baseUrl must be an http or https URL/);
});
