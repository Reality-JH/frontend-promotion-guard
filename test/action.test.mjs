import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Action passes caller input through environment variables and allowlists commands", async () => {
  const action = await readFile("action.yml", "utf8");
  assert.match(action, /FPG_ACTION_COMMAND: \$\{\{ inputs\.command \}\}/);
  assert.match(action, /FPG_ACTION_CONFIG: \$\{\{ inputs\.config \}\}/);
  assert.doesNotMatch(action, /run:.*\$\{\{ inputs\./);
  assert.match(action, /audit\|capture\|compare\|verify\|promote\|report/);
});
