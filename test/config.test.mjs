import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadConfig } from "../dist/config.js";

test("configuration resolves slash-normalized relative paths on the current platform", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-config-"));
  const path = join(root, "fpg.yml");
  await writeFile(path, `baseUrl: http://127.0.0.1:4173/\nroutes:\n  - { name: home, path: /, readySelector: main }\nviewports:\n  - { width: 768, height: 900 }\ncssAudit:\n  files: [dist/assets/*.css]\nvisual:\n  baselineDir: visual-baselines\n  evidenceDir: release-evidence\n`);
  const config = await loadConfig(path);
  assert.equal(config.baseUrl, "http://127.0.0.1:4173");
  assert.equal(config.visual.baselineDir, resolve(root, "visual-baselines"));
  assert.equal(config.visual.evidenceDir, resolve(root, "release-evidence"));
});

test("configuration accepts Windows separators in CSS glob patterns", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-windows-"));
  const path = join(root, "fpg.yml");
  await writeFile(path, `routes: [{ name: home, path: /, readySelector: main }]\nviewports: [{ width: 768, height: 900 }]\ncssAudit:\n  files: ['dist\\assets\\*.css']\n`);
  const config = await loadConfig(path);
  assert.equal(config.cssAudit.files[0], "dist\\assets\\*.css");
});

test("configuration rejects malformed routes, viewports, and style assertions before execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-invalid-"));
  const path = join(root, "fpg.yml");
  const load = async (body, expected) => {
    await writeFile(path, body);
    await assert.rejects(() => loadConfig(path), expected);
  };
  await load(`routes: [{ name: home, path: / }]
viewports: [{ width: 768, height: 900 }]
`, /routes\[0\]\.readySelector must be a non-empty string/);
  await load(`routes: [{ name: home, path: /, readySelector: main }]
viewports: [{ width: 0, height: 900 }]
`, /viewports\[0\]\.width must be a positive integer/);
  await load(`routes: [{ name: home, path: /, readySelector: main }]
viewports: [{ width: 768, height: 900 }]
computedStyles: [{ selector: main, property: display, equals: block, notEquals: none }]
`, /computedStyles\[0\] must define exactly one of equals or notEquals/);
});

test("configuration rejects invalid thresholds, retention, URLs, ports, and conflicting Docker values", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-invalid-range-"));
  const path = join(root, "fpg.yml");
  const base = `routes: [{ name: home, path: /, readySelector: main }]
viewports: [{ width: 768, height: 900 }]
`;
  const load = async (extra, expected) => {
    await writeFile(path, base + extra);
    await assert.rejects(() => loadConfig(path), expected);
  };
  await load(`baseUrl: not-a-url\n`, /baseUrl must be an http or https URL/);
  await load(`visual: { pixelThreshold: 1.1 }\n`, /visual\.pixelThreshold must be between 0 and 1/);
  await load(`visual: { retention: -1 }\n`, /visual\.retention must be a non-negative integer/);
  await load(`docker:
  candidateImage: demo:candidate
  productionImage: demo:latest
  candidatePort: 43000
  productionPort: 43000
  containerPort: 8080
`, /docker\.candidatePort and docker\.productionPort must be different/);
  await load(`docker:
  candidateImage: demo:candidate
  productionImage: demo:latest
  candidatePort: 43100
  productionPort: 43000
  containerPort: nope
`, /docker\.containerPort must be a positive integer/);
});
