#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { auditCss } from "./audit.js";
import { loadConfig } from "./config.js";
import { promote, rollback } from "./docker.js";
import { runMonitor } from "./monitor.js";
import { loadRecord, saveRecord } from "./report.js";
import { browserIdentity, captureAndCompare } from "./visual.js";
import { ensureDir, exists, pruneRuns, run, withReleaseLock } from "./utils.js";
const args = process.argv.slice(2);
const configArg = option("--config") ?? "fpg.yml";
const command = positional(args);
if (args.includes("--help") || command.length === 0) {
    console.log(`Frontend Promotion Guard

Usage:
  fpg audit [--config fpg.yml]
  fpg capture [--config fpg.yml] [--base-url URL]
  fpg compare [--config fpg.yml] [--base-url URL]
  fpg verify [--config fpg.yml] [--base-url URL]
  fpg baseline update [--config fpg.yml] [--base-url URL]
  fpg promote [--config fpg.yml]
  fpg rollback IMAGE [--config fpg.yml]
  fpg report [--config fpg.yml]
  fpg monitor [--config fpg.yml] [--base-url URL] [--once]`);
    process.exit(0);
}
const config = await loadConfig(configArg);
if (option("--base-url"))
    config.baseUrl = option("--base-url").replace(/\/$/, "");
await ensureDir(config.visual.evidenceDir);
const action = command.join(" ");
try {
    if (action === "report") {
        const runDir = await lastRunDir();
        await saveRecord(runDir, await loadRecord(runDir));
        console.log(join(runDir, "report.html"));
    }
    else if (command[0] === "rollback") {
        await withReleaseLock(config.rootDir, await commit(), () => rollback(config, command[1]));
        console.log(`Rolled back to ${command[1]}`);
    }
    else if (action === "monitor") {
        await runMonitor(config, { once: args.includes("--once"), baseUrl: option("--base-url") });
    }
    else {
        const runDir = await newRunDir(action);
        const record = { startedAt: new Date().toISOString(), command: action, baseUrl: config.baseUrl, commit: await commit(), environment: { platform: `${process.platform} ${process.arch}`, node: process.version }, configSummary: { routes: config.routes.map((route) => route.path), viewports: config.viewports.map((viewport) => `${viewport.width}x${viewport.height}`), maxDiffPixelRatio: config.visual.maxDiffPixelRatio, pixelThreshold: config.visual.pixelThreshold }, checks: [], visuals: [] };
        try {
            if (action === "audit")
                record.checks.push(...await auditCss(config));
            else if (action === "capture") {
                record.environment.browser = await browserIdentity(config);
                merge(record, await captureAndCompare(config, runDir, { compare: false, update: false }));
            }
            else if (action === "compare") {
                record.environment.browser = await browserIdentity(config);
                merge(record, await captureAndCompare(config, runDir, { compare: true, update: false }));
            }
            else if (action === "verify") {
                record.checks.push(...await auditCss(config));
                record.environment.browser = await browserIdentity(config);
                merge(record, await captureAndCompare(config, runDir, { compare: true, update: false }));
            }
            else if (action === "baseline update") {
                record.environment.browser = await browserIdentity(config);
                merge(record, await captureAndCompare(config, runDir, { compare: false, update: true }));
            }
            else if (action === "promote") {
                record.checks.push(...await auditCss(config));
                record.environment.browser = await browserIdentity(config);
                await withReleaseLock(config.rootDir, record.commit, () => promote(config, runDir, record));
            }
            else
                throw new Error(`Unknown command: ${action}`);
        }
        catch (error) {
            mergeError(record, error);
            await saveRecord(runDir, record);
            throw error;
        }
        await saveRecord(runDir, record);
        console.log(`${action} passed\nReport: ${join(runDir, "report.html")}`);
        await pruneRuns(config.visual.evidenceDir, config.visual.retention);
    }
}
catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
function option(name) {
    const index = args.indexOf(name);
    if (index >= 0)
        return args[index + 1];
    return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}
function positional(values) {
    const output = [];
    for (let index = 0; index < values.length; index++) {
        if (values[index] === "--config" || values[index] === "--base-url") {
            index++;
            continue;
        }
        if (!values[index].startsWith("--"))
            output.push(values[index]);
    }
    return output;
}
async function commit() {
    try {
        return await run("git", ["rev-parse", "HEAD"], config.rootDir);
    }
    catch {
        return process.env.GITHUB_SHA ?? "unknown";
    }
}
async function newRunDir(name) {
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${name.replace(/\s+/g, "-")}`;
    const dir = join(config.visual.evidenceDir, id);
    await ensureDir(dir);
    await writeFile(join(config.visual.evidenceDir, ".last-run"), id);
    return dir;
}
async function lastRunDir() {
    const pointer = join(config.visual.evidenceDir, ".last-run");
    if (!(await exists(pointer)))
        throw new Error("No previous FPG run found");
    return resolve(config.visual.evidenceDir, (await readFile(pointer, "utf8")).trim());
}
function merge(record, result) {
    record.checks.push(...result.checks);
    record.visuals.push(...result.visuals);
}
function mergeError(record, error) {
    const evidence = error;
    if (evidence.checks && !evidence.checks.every((item) => record.checks.includes(item)))
        record.checks.push(...evidence.checks);
    if (evidence.visuals)
        record.visuals.push(...evidence.visuals);
    record.checks.push({ name: "Command", status: "failed", detail: error instanceof Error ? error.message : String(error) });
}
