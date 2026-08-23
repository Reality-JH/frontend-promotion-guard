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
