import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditCss, selectorPresent } from "../dist/audit.js";

test("selectorPresent finds semantic selectors in minified and expanded CSS", () => {
  assert.equal(selectorPresent(".flex{display:flex}.grid { display:grid }", ".flex"), true);
  assert.equal(selectorPresent(".profile-flex{display:flex}", ".flex"), false);
});

test("CSS audit passes valid output and rejects forbidden source directives", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "fpg-audit-"));
  await mkdir(join(rootDir, "dist", "assets"), { recursive: true });
  const path = join(rootDir, "dist", "assets", "app.css");
  const config = { rootDir, cssAudit: { files: ["dist/assets/*.css"], forbiddenTokens: ["@apply"], requiredSelectors: [".flex"] } };
  await writeFile(path, ".flex{display:flex}");
  assert.equal((await auditCss(config)).every((item) => item.status === "passed"), true);
  await writeFile(path, ".flex{@apply block}");
  await assert.rejects(() => auditCss(config), /Forbidden token @apply/);
});
