import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

test("GitHub Action allowlists commands and requires explicit promotion confirmation", async () => {
  const action = await readFile("action.yml", "utf8");
  const manifest = parse(action);
  assert.equal(manifest.inputs.command.default, "verify");
  assert.equal(manifest.inputs["confirm-promotion"].default, "false");
  assert.match(action, /FPG_ACTION_COMMAND: \$\{\{ inputs\.command \}\}/);
  assert.match(action, /FPG_ACTION_CONFIG: \$\{\{ inputs\.config \}\}/);
  assert.match(action, /FPG_CONFIRM_PROMOTION: \$\{\{ inputs\['confirm-promotion'\] \}\}/);
  assert.doesNotMatch(action, /run:.*\$\{\{ inputs\./);
  assert.match(action, /audit\|capture\|compare\|verify\|report/);
  assert.match(action, /Promotion requires confirm-promotion: true/);
});
