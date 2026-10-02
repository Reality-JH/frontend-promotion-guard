import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const cli = resolve("dist/cli.js");
const posix = (path) => path.replaceAll("\\", "/");
const base = `routes: [{ name: home, path: /, readySelector: main }]
viewports: [{ width: 768, height: 900 }]
visual:
  baselineDir: baselines
`;

async function fixture(extra) {
  const root = await mkdtemp(join(tmpdir(), "fpg-sync-"));
  const remote = join(root, "remote");
  const baselines = join(root, "baselines");
  await mkdir(remote, { recursive: true });
  await mkdir(baselines, { recursive: true });
  const config = join(root, "fpg.yml");
  await writeFile(config, base + extra(remote, baselines));
  return { root, remote, baselines, config };
}

test("baseline pull/push run configured sync commands with argument arrays", async () => {
  const { remote, baselines, config } = await fixture(
    (remote, baselines) => `  remoteSync:
    pull: { command: cp, args: ['${posix(remote)}/home.png', '${posix(baselines)}/home.png'] }
    push: { command: cp, args: ['${posix(baselines)}/home.png', '${posix(remote)}/home.png'] }
`,
  );
  await writeFile(join(remote, "home.png"), "baseline-v1");
  const pull = spawnSync(process.execPath, [cli, "baseline", "pull", "--config", config], { encoding: "utf8" });
  assert.equal(pull.status, 0, pull.stderr);
  assert.match(pull.stdout, /Baseline pull complete/);
  assert.equal(await readFile(join(baselines, "home.png"), "utf8"), "baseline-v1");
  await writeFile(join(baselines, "home.png"), "baseline-v2");
  const push = spawnSync(process.execPath, [cli, "baseline", "push", "--config", config], { encoding: "utf8" });
  assert.equal(push.status, 0, push.stderr);
  assert.equal(await readFile(join(remote, "home.png"), "utf8"), "baseline-v2");
});

test("baseline pull fails non-zero with a stderr summary when the sync command fails", async () => {
  const { remote, baselines, config } = await fixture(
    (remote, baselines) => `  remoteSync:
    pull: { command: cp, args: ['${posix(remote)}/missing.png', '${posix(baselines)}/missing.png'] }
`,
  );
  const result = spawnSync(process.execPath, [cli, "baseline", "pull", "--config", config], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /baseline pull failed:/);
});

test("baseline pull reports an unconfigured remoteSync entry", async () => {
  const { config } = await fixture(() => "");
  const result = spawnSync(process.execPath, [cli, "baseline", "pull", "--config", config], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /visual\.remoteSync\.pull is not configured/);
});
