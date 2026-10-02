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

test("masked regions do not trigger pixel diff failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-mask-"));
  const baselineDir = join(root, "baselines");
  const config = {
    baseUrl: "data:text/html,<main><div id=ad style='width:120px;height:120px'></div><p>stable</p></main><script>ad.style.background='rgb('+Math.floor(Math.random()*255)+',0,0)';ad.textContent=Math.random().toString(36).slice(2)</script>",
    routes: [{ name: "home", path: "", readySelector: "main" }],
    viewports: [{ width: 320, height: 200 }],
    computedStyles: [],
    visual: { baselineDir, pixelThreshold: 0.2, maxDiffPixelRatio: 0, maskSelectors: ["#ad"] },
  };
  await captureAndCompare(config, join(root, "run1"), { compare: false, update: true });
  const { visuals } = await captureAndCompare(config, join(root, "run2"), { compare: true, update: false });
  assert.equal(visuals[0].status, "passed");
  assert.equal(visuals[0].diffPixelRatio, 0);
});

test("aria snapshot changes fail the gate and land in evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-aria-"));
  const baselineDir = join(root, "baselines");
  const config = {
    baseUrl: "data:text/html,<main><p id=t>seed</p></main><script>t.textContent='release-'+Math.random().toString(36).slice(2)</script>",
    routes: [{ name: "home", path: "", readySelector: "main" }],
    viewports: [{ width: 320, height: 200 }],
    computedStyles: [],
    visual: { baselineDir, pixelThreshold: 0.2, maxDiffPixelRatio: 1, maskSelectors: ["#t"], ariaSnapshot: true },
  };
  await captureAndCompare(config, join(root, "run1"), { compare: false, update: true });
  const manifest = JSON.parse(await readFile(join(baselineDir, "manifest.json"), "utf8"));
  assert.ok(manifest.files.some((file) => file.file === "home-320x200.aria.yml"));
  const error = await captureAndCompare(config, join(root, "run2"), { compare: true, update: false }).then(() => null, (caught) => caught);
  assert.match(error.message, /aria snapshot/);
  assert.equal(error.visuals[0].ariaStatus, "failed");
  const diff = await readFile(join(root, "run2", "home-320x200.aria.diff"), "utf8");
  assert.match(diff, /^\+ /m);
  assert.match(diff, /^- /m);
});

test("freezeTime makes time-dependent pages deterministic", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-freeze-"));
  const baselineDir = join(root, "baselines");
  const config = {
    baseUrl: "data:text/html,<main><p id=t style='font-size:24px;margin:0'></p></main><script>t.textContent=new Date().toISOString()+' '+Date.now()</script>",
    routes: [{ name: "home", path: "", readySelector: "main" }],
    viewports: [{ width: 320, height: 200 }],
    computedStyles: [],
    visual: { baselineDir, pixelThreshold: 0.2, maxDiffPixelRatio: 0, maskSelectors: [], freezeTime: "2031-01-02T03:04:05.000Z", ariaSnapshot: true },
  };
  await captureAndCompare(config, join(root, "run1"), { compare: false, update: true });
  const ariaBaseline = await readFile(join(baselineDir, "home-320x200.aria.yml"), "utf8");
  assert.match(ariaBaseline, /2031-01-02/);
  const { visuals } = await captureAndCompare(config, join(root, "run2"), { compare: true, update: false });
  assert.equal(visuals[0].status, "passed");
  assert.equal(visuals[0].diffPixelRatio, 0);
});
