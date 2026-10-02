import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeGithubOutputs } from "../dist/github.js";

const record = (visuals, checks = []) => ({
  startedAt: "2026-09-30T00:00:00.000Z",
  command: "verify",
  baseUrl: "http://127.0.0.1:4173",
  commit: "abc123",
  checks,
  visuals,
});

const visual = (route, ratio, status) => ({ route, viewport: "768x900", baseline: "b.png", current: "c.png", diff: "d.png", diffPixelRatio: ratio, status });

async function capture(run) {
  const logged = [];
  const original = console.log;
  console.log = (message) => logged.push(String(message));
  try {
    await run();
  } finally {
    console.log = original;
  }
  return logged;
}

test("GitHub writeback appends a results table, outputs, and ::error annotations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fpg-gh-"));
  const summary = join(dir, "summary.md");
  const output = join(dir, "output.txt");
  process.env.GITHUB_STEP_SUMMARY = summary;
  process.env.GITHUB_OUTPUT = output;
  try {
    const run = record(
      [visual("home", 0.02, "passed"), visual("details", 0.4, "failed")],
      [{ name: "home 768x900: browser console", status: "failed", detail: "boom" }],
    );
    const logged = await capture(() => writeGithubOutputs(join(dir, "run"), run));
    const markdown = await readFile(summary, "utf8");
    assert.match(markdown, /## Frontend Promotion Guard: verify/);
    assert.match(markdown, /\| Route \| Viewport \| Diff \| Status \|/);
    assert.match(markdown, /\| home \| 768x900 \| 2\.000% \| passed \|/);
    assert.match(markdown, /\| details \| 768x900 \| 40\.000% \| failed \|/);
    assert.match(markdown, /Result: \*\*failed\*\*.*40\.000%/);
    assert.match(markdown, /report\.html/);
    const outputs = await readFile(output, "utf8");
    assert.match(outputs, /^result=failed$/m);
    assert.match(outputs, /^diffRatio=0\.4$/m);
    assert.ok(logged.some((line) => line.startsWith("::error ::details 768x900: diff 40.000%")));
    assert.ok(logged.some((line) => line.startsWith("::error ::home 768x900: browser console: boom")));
  } finally {
    delete process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_OUTPUT;
  }
});

test("GitHub writeback reports passed results and skips cleanly without env files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fpg-gh-"));
  const summary = join(dir, "summary.md");
  const output = join(dir, "output.txt");
  process.env.GITHUB_STEP_SUMMARY = summary;
  process.env.GITHUB_OUTPUT = output;
  try {
    await writeGithubOutputs(join(dir, "run"), record([visual("home", 0, "passed")]));
    const outputs = await readFile(output, "utf8");
    assert.match(outputs, /^result=passed$/m);
    assert.match(outputs, /^diffRatio=0$/m);
  } finally {
    delete process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_OUTPUT;
  }
  const logged = await capture(() => writeGithubOutputs(join(dir, "run"), record([])));
  assert.ok(logged.some((line) => /skipping GitHub writeback/.test(line)));
});
