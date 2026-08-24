import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(".");
const configPath = resolve(".fpg-docker-integration.yml");
const normal = "fpg-integration:normal";
const broken = "fpg-integration:broken";
const production = "fpg-integration:latest";
const candidateContainer = "fpg-integration-candidate";
const productionContainer = "fpg-integration-production";

await command("docker", ["build", "--tag", normal, "--file", "examples/vite-react/Dockerfile", "."]);
await command("docker", ["build", "--build-arg", "FPG_BREAK_CSS_BUILD=1", "--tag", broken, "--file", "examples/vite-react/Dockerfile", "."]);
const normalId = await output("docker", ["image", "inspect", "--format", "{{.Id}}", normal]);
const brokenId = await output("docker", ["image", "inspect", "--format", "{{.Id}}", broken]);

try {
  await scenario("promotion succeeds", normal, {}, 0, (record, finalId) => {
    assert.equal(record.finalState, "promoted");
    assert.equal(record.candidateImageId, normalId);
    assert.equal(record.finalProductionImageId, normalId);
    assert.equal(finalId, normalId);
  });
  await scenario("candidate failure leaves production untouched", normal, { candidateArgs: ["--env", "FPG_BREAK_CSS=1"] }, 1, (record, finalId) => {
    assert.equal(record.finalState, "failed");
    assert.equal(finalId, normalId);
  });
  await scenario("production failure restores the previous image", normal, { productionArgs: ["--env", "FPG_BREAK_CSS=1"] }, 1, (record, finalId) => {
    assert.equal(record.finalState, "restored");
    assert.equal(record.rolledBack, true);
    assert.equal(record.previousProductionImageId, normalId);
    assert.equal(record.finalProductionImageId, normalId);
    assert.equal(finalId, normalId);
  });
  await scenario("rollback verification failure fails closed", broken, { productionArgs: ["--env", "FPG_BREAK_CSS=1"] }, 1, (record, finalId) => {
    assert.equal(record.finalState, "failed");
    assert.equal(record.rolledBack, false);
    assert.equal(record.previousProductionImageId, brokenId);
    assert.equal(finalId, brokenId);
    assert.ok(record.checks.some((check) => check.name === "rollback verification" && check.status === "failed"));
  });
  console.log("Docker integration scenarios passed: promotion, candidate rejection, restoration, rollback failure");
} finally {
  await cleanup();
  await rm(configPath, { force: true });
}

async function scenario(name, seedImage, options, expectedStatus, verify) {
  await cleanup();
  await command("docker", ["run", "--detach", "--name", productionContainer, "--publish", "43000:8080", seedImage]);
  await writeFile(configPath, yaml(options));
  const result = await command(process.execPath, ["dist/cli.js", "promote", "--config", configPath], expectedStatus);
  const pointer = (await readFile(resolve("release-evidence/docker-integration/.last-run"), "utf8")).trim();
  const record = JSON.parse(await readFile(resolve("release-evidence/docker-integration", pointer, "run.json"), "utf8"));
  const finalId = await output("docker", ["inspect", "--format", "{{.Image}}", productionContainer]);
  verify(record, finalId);
  console.log(`${name}: ${expectedStatus === 0 ? "passed" : "failed as expected"}`);
  return result;
}

function yaml({ candidateArgs = [], productionArgs = [] }) {
  return `baseUrl: http://127.0.0.1:43000
routes: [{ name: home, path: /, readySelector: main }]
viewports: [{ width: 768, height: 900 }]
cssAudit:
  files: [examples/vite-react/dist/assets/*.css]
  forbiddenTokens: ["@apply"]
  requiredSelectors: [".flex", ".grid", ".hidden"]
computedStyles:
  - { selector: main, property: display, notEquals: none }
  - { selector: ".status-grid", property: display, equals: grid }
visual:
  maxDiffPixelRatio: 0.12
  pixelThreshold: 0.2
  baselineDir: ./visual-baselines
  evidenceDir: ./release-evidence/docker-integration
  retention: 20
docker:
  candidateImage: ${normal}
  productionImage: ${production}
  candidatePort: 43100
  productionPort: 43000
  containerPort: 8080
  candidateContainer: ${candidateContainer}
  productionContainer: ${productionContainer}
  candidateArgs: ${JSON.stringify(candidateArgs)}
  productionArgs: ${JSON.stringify(productionArgs)}
  healthPath: /
  rollback: true
`;
}

async function cleanup() {
  await command("docker", ["rm", "--force", candidateContainer], [0, 1]);
  await command("docker", ["rm", "--force", productionContainer], [0, 1]);
}
async function output(executable, args) { return (await command(executable, args)).stdout.trim(); }
function command(executable, args, expected = 0) {
  const accepted = Array.isArray(expected) ? expected : [expected];
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: root, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => { stdout += data; process.stdout.write(data); });
    child.stderr.on("data", (data) => { stderr += data; process.stderr.write(data); });
    child.on("error", reject);
    child.on("close", (status) => accepted.includes(status ?? -1) ? resolvePromise({ status, stdout, stderr }) : reject(new Error(`${executable} ${args[0]} exited ${status}: ${stderr || stdout}`)));
  });
}
