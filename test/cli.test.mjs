import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const cli = resolve("dist/cli.js");
test("CLI audit writes a human-readable report and fails closed on broken CSS", async () => {
  const root = await mkdtemp(join(tmpdir(), "fpg-cli-"));
  await mkdir(join(root, "dist", "assets"), { recursive: true });
  await writeFile(join(root, "fpg.yml"), `routes: [{ name: home, path: /, readySelector: main }]\nviewports: [{ width: 768, height: 900 }]\ncssAudit:\n  files: [dist/assets/*.css]\n  forbiddenTokens: ['@apply']\n  requiredSelectors: ['.flex']\nvisual:\n  evidenceDir: evidence\n`);
  const css = join(root, "dist", "assets", "app.css");
  await writeFile(css, ".flex{display:flex}");
  const pass = spawnSync(process.execPath, [cli, "audit", "--config", join(root, "fpg.yml")], { encoding: "utf8" });
  assert.equal(pass.status, 0, pass.stderr);
  const pointer = (await readFile(join(root, "evidence", ".last-run"), "utf8")).trim();
  assert.match(await readFile(join(root, "evidence", pointer, "report.html"), "utf8"), /PASSED/);
  await writeFile(css, ".flex{@apply block}");
  const fail = spawnSync(process.execPath, [cli, "audit", "--config", join(root, "fpg.yml")], { encoding: "utf8" });
  assert.notEqual(fail.status, 0);
  assert.match(fail.stderr, /Forbidden token @apply/);
});
