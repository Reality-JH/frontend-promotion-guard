import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { saveRecord } from "./report.js";
import type { FpgConfig, MonitorConfig, RunRecord } from "./types.js";
import { ensureDir, pruneRuns, run } from "./utils.js";
import { captureAndCompare } from "./visual.js";

export type MonitorEvent = "down" | "recovered";
export type MonitorState = {
  status: "up" | "down";
  consecutiveFailures: number;
  lastCheckedAt?: string;
  lastEvent?: MonitorEvent;
  lastEventAt?: string;
};
export type MonitorRound = { failures: string[]; reportPath: string };
export type MonitorCheck = (runDir: string) => Promise<MonitorRound>;
export type MonitorAlert = { event: MonitorEvent; target: string; failures: string[]; reportPath: string; at: string };

export async function runMonitor(config: FpgConfig, options: { once?: boolean; baseUrl?: string } = {}, check?: MonitorCheck): Promise<MonitorState> {
  const monitor = config.monitor;
  if (!monitor) throw new Error("Missing configuration: monitor");
  const target = (options.baseUrl ?? monitor.baseUrl ?? config.baseUrl).replace(/\/$/, "");
  const state = await loadState(monitor.stateFile);
  const commit = check ? "unknown" : await headCommit(config.rootDir);
  const runCheck: MonitorCheck = check ?? ((runDir) => runChecks(config, target, commit, runDir));
  console.log(`[monitor] ${target} every ${monitor.interval}; down after ${monitor.failureThreshold} consecutive failure(s)`);

  let stopped = false;
  let wake: (() => void) | undefined;
  const stop = () => { stopped = true; wake?.(); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    do {
      const runDir = join(config.visual.evidenceDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-monitor`);
      const round = await runCheck(runDir).catch((error) => ({ failures: [error instanceof Error ? error.message : String(error)], reportPath: join(runDir, "report.html") }));
      state.lastCheckedAt = new Date().toISOString();
      let event: MonitorEvent | undefined;
      if (round.failures.length) {
        state.consecutiveFailures += 1;
        console.log(`[monitor] ${target} failing ${state.consecutiveFailures}/${monitor.failureThreshold}: ${round.failures[0]}${round.failures.length > 1 ? ` (+${round.failures.length - 1} more)` : ""}`);
        if (state.status !== "down" && state.consecutiveFailures >= monitor.failureThreshold) {
          state.status = "down";
          event = "down";
        }
      } else {
        console.log(`[monitor] ${target} up`);
        if (state.status === "down") event = "recovered";
        state.status = "up";
        state.consecutiveFailures = 0;
      }
      if (event === "down" || (event === "recovered" && monitor.recoveryNotify)) {
        state.lastEvent = event;
        state.lastEventAt = new Date().toISOString();
        console.log(`[monitor] ${event}: ${target}`);
        await sendAlert(monitor, { event, target, failures: round.failures, reportPath: round.reportPath, at: state.lastEventAt });
      }
      await writeState(monitor.stateFile, state);
      await pruneRuns(config.visual.evidenceDir, config.visual.retention);
      if (options.once || stopped) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, monitor.intervalMs + Math.floor(Math.random() * monitor.intervalMs * 0.1));
        wake = () => { clearTimeout(timer); resolve(); };
      });
      wake = undefined;
    } while (!stopped);
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
  console.log(`[monitor] stopped; last status ${state.status}`);
  return state;
}

async function runChecks(config: FpgConfig, target: string, commit: string, runDir: string): Promise<MonitorRound> {
  const record: RunRecord = {
    startedAt: new Date().toISOString(),
    command: "monitor",
    baseUrl: target,
    commit,
    environment: { platform: `${process.platform} ${process.arch}`, node: process.version },
    configSummary: { routes: config.routes.map((route) => route.path), viewports: config.viewports.map((viewport) => `${viewport.width}x${viewport.height}`), maxDiffPixelRatio: config.visual.maxDiffPixelRatio, pixelThreshold: config.visual.pixelThreshold },
    checks: [],
    visuals: [],
  };
  let failures: string[] = [];
  try {
    const result = await captureAndCompare(config, runDir, { compare: true, update: false, baseUrl: target });
    record.checks.push(...result.checks);
    record.visuals.push(...result.visuals);
  } catch (error) {
    const evidence = error as { checks?: RunRecord["checks"]; visuals?: RunRecord["visuals"] };
    if (evidence.checks) record.checks.push(...evidence.checks);
    if (evidence.visuals) record.visuals.push(...evidence.visuals);
    failures = (error instanceof Error ? error.message : String(error)).split("\n");
    record.checks.push({ name: "Monitor", status: "failed", detail: `${failures.length} check(s) failed` });
    record.finalState = "failed";
  }
  await saveRecord(runDir, record);
  await writeFile(join(config.visual.evidenceDir, ".last-run"), basename(runDir));
  return { failures, reportPath: join(runDir, "report.html") };
}

async function sendAlert(monitor: MonitorConfig, alert: MonitorAlert) {
  if (!monitor.webhook) return;
  try {
    const response = await fetch(monitor.webhook.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...monitor.webhook.headers },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(monitor.webhook.timeoutMs),
    });
    if (!response.ok) console.error(`[monitor] webhook ${alert.event} returned HTTP ${response.status}`);
  } catch (error) {
    console.error(`[monitor] webhook ${alert.event} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadState(path: string): Promise<MonitorState> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<MonitorState>;
    return {
      status: raw.status === "down" ? "down" : "up",
      consecutiveFailures: Number.isInteger(raw.consecutiveFailures) && raw.consecutiveFailures! >= 0 ? raw.consecutiveFailures! : 0,
      lastCheckedAt: typeof raw.lastCheckedAt === "string" ? raw.lastCheckedAt : undefined,
      lastEvent: raw.lastEvent === "down" || raw.lastEvent === "recovered" ? raw.lastEvent : undefined,
      lastEventAt: typeof raw.lastEventAt === "string" ? raw.lastEventAt : undefined,
    };
  } catch {
    return { status: "up", consecutiveFailures: 0 };
  }
}

async function writeState(path: string, state: MonitorState) {
  await ensureDir(dirname(path));
  const temp = `${path}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temp, path);
}

async function headCommit(rootDir: string) {
  try { return await run("git", ["rev-parse", "HEAD"], rootDir); } catch { return process.env.GITHUB_SHA ?? "unknown"; }
}
