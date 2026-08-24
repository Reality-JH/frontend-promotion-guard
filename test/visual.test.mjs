import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";
import { captureAndCompare } from "../dist/visual.js";

test("failed baseline update is atomic and does not overwrite an existing baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-atomic-"));
  const baselineDir = join(root, "baselines");
  await mkdir(baselineDir);
  const baseline = join(baselineDir, "home-320x200.png");
  const original = PNG.sync.write(new PNG({ width: 1, height: 1 }));
  await writeFile(baseline, original);
  const config = {
    baseUrl: "data:text/html,<main style='display:block'>ok</main>",
    routes: [{ name: "home", path: "", readySelector: "main" }],
    viewports: [{ width: 320, height: 200 }],
    computedStyles: [{ selector: "main", property: "display", equals: "grid" }],
    visual: { baselineDir, pixelThreshold: 0.2, maxDiffPixelRatio: 0.1 },
  };
  await assert.rejects(() => captureAndCompare(config, join(root, "run"), { compare: false, update: true }), /main display/);
  assert.deepEqual(await readFile(baseline), original);
});

test("successful baseline update writes a SHA-256 manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-manifest-"));
  const baselineDir = join(root, "baselines");
  const config = {
    baseUrl: "data:text/html,<main style='display:block'>approved</main>",
    routes: [{ name: "home", path: "", readySelector: "main" }],
    viewports: [{ width: 320, height: 200 }], computedStyles: [{ selector: "main", property: "display", equals: "block" }],
    visual: { baselineDir, pixelThreshold: 0.2, maxDiffPixelRatio: 0.1 },
  };
  await captureAndCompare(config, join(root, "run"), { compare: false, update: true });
  const baseline = await readFile(join(baselineDir, "home-320x200.png"));
  const manifest = JSON.parse(await readFile(join(baselineDir, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.files, [{ file: "home-320x200.png", sha256: createHash("sha256").update(baseline).digest("hex") }]);
});
