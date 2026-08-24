import assert from "node:assert/strict";
import test from "node:test";
import { renderReport, saveRecord } from "../dist/report.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("HTML report shows runtime, immutable image identity, and authoritative final state", () => {
  const html = renderReport({
    startedAt: "2026-08-24T00:00:00.000Z", finishedAt: "2026-08-24T00:01:00.000Z", command: "promote",
    baseUrl: "http://127.0.0.1:43000", commit: "abc123", candidateImage: "demo:candidate", candidateImageId: "sha256:candidate",
    productionImage: "demo:latest", previousProductionImageId: "sha256:old", finalProductionImageId: "sha256:candidate",
    rollbackImage: "demo:rollback", rolledBack: false, finalState: "promoted",
    environment: { platform: "linux x64", node: "v22.0.0", browser: "chromium 140" }, checks: [], visuals: [],
    configSummary: { routes: ["/"], viewports: ["768x900"], maxDiffPixelRatio: 0.12, pixelThreshold: 0.2 },
    stages: [{ name: "candidate", status: "passed", startedAt: "2026-08-24T00:00:01.000Z", finishedAt: "2026-08-24T00:00:20.000Z" }],
  });
  for (const value of ["promoted", "sha256:candidate", "sha256:old", "linux x64", "v22.0.0", "chromium 140", "768x900", "candidate"]) assert.match(html, new RegExp(value));
});

test("saved JSON and HTML evidence redact credentials and tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-report-redact-"));
  const record = { startedAt: "now", command: "verify", baseUrl: "https://user:private-password@example.test/?token=private-value", commit: "abc", checks: [{ name: "browser", status: "failed", detail: "Authorization: Bearer private-token" }], visuals: [] };
  await saveRecord(root, record);
  const json = await readFile(join(root, "run.json"), "utf8");
  const html = await readFile(join(root, "report.html"), "utf8");
  for (const output of [json, html]) {
    assert.doesNotMatch(output, /private-value|private-token|private-password/);
    assert.match(output, /REDACTED/);
  }
});
