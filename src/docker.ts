import { join } from "node:path";
import type { FpgConfig, RunRecord } from "./types.js";
import { captureAndCompare } from "./visual.js";
import { run } from "./utils.js";

export async function promote(config: FpgConfig, runDir: string, record: RunRecord) {
  const docker = config.docker;
  if (!docker) throw new Error("docker configuration is required for promote");
  record.candidateImage = docker.candidateImage;
  record.productionImage = docker.productionImage;
  record.stages = [];
  if (docker.requireImmutableImage && !docker.buildContext && !isImmutableReference(docker.candidateImage)) throw new Error("docker.candidateImage must use a digest or image ID when docker.requireImmutableImage is true");
  const previousImage = await run("docker", ["inspect", "--format", "{{.Image}}", docker.productionContainer]);
  record.previousProductionImageId = previousImage;
  const rollbackImage = `${docker.productionImage}-rollback-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
  record.rollbackImage = rollbackImage;
  await run("docker", ["tag", previousImage, rollbackImage]);
  if (docker.buildContext) {
    const args = ["build", "--tag", docker.candidateImage];
    if (docker.dockerfile) args.push("--file", docker.dockerfile);
    args.push(docker.buildContext);
    await run("docker", args, config.rootDir);
  }
  record.candidateImageId = await imageId(docker.candidateImage);
  await removeContainer(docker.candidateContainer);
  const candidateStage = beginStage(record, "candidate");
  try {
    await run("docker", ["run", "--detach", "--name", docker.candidateContainer, ...docker.candidateArgs, "--publish", `${docker.candidatePort}:${docker.containerPort}`, docker.candidateImage]);
    await waitFor(`http://127.0.0.1:${docker.candidatePort}${docker.healthPath}`);
    const candidate = await captureAndCompare(config, join(runDir, "candidate"), { compare: true, update: false, baseUrl: `http://127.0.0.1:${docker.candidatePort}` });
    record.checks.push(...candidate.checks);
    record.visuals.push(...candidate.visuals.map((item) => prefixPaths(item, "candidate")));
    finishStage(candidateStage, "passed");
    const productionStage = beginStage(record, "production");
    await run("docker", ["tag", docker.candidateImage, docker.productionImage]);
    await removeContainer(docker.productionContainer);
    await runProduction(config, docker.productionImage, docker.productionArgs);
    try {
      await waitFor(`http://127.0.0.1:${docker.productionPort}${docker.healthPath}`);
      const production = await captureAndCompare(config, join(runDir, "production"), { compare: true, update: false, baseUrl: `http://127.0.0.1:${docker.productionPort}` });
      record.checks.push(...production.checks);
      record.visuals.push(...production.visuals.map((item) => prefixPaths(item, "production")));
      record.rolledBack = false;
      record.finalState = "promoted";
      record.finalProductionImageId = await containerImageId(docker.productionContainer);
      finishStage(productionStage, "passed");
    } catch (error) {
      finishStage(productionStage, "failed");
      appendEvidence(record, error, "production verification");
      if (!docker.rollback) throw error;
      try {
        const rollbackStage = beginStage(record, "rollback");
        record.rolledBack = false;
        await rollback(config, rollbackImage);
        const restored = await captureAndCompare(config, join(runDir, "rollback"), { compare: true, update: false, baseUrl: `http://127.0.0.1:${docker.productionPort}` });
        record.checks.push(...restored.checks);
        record.visuals.push(...restored.visuals.map((item) => prefixPaths(item, "rollback")));
        record.finalState = "restored";
        record.rolledBack = true;
        record.finalProductionImageId = await containerImageId(docker.productionContainer);
        finishStage(rollbackStage, "passed");
        throw new Error(`Production verification failed; restored ${rollbackImage}`);
      } catch (rollbackError) {
        if (record.finalState === "restored") throw rollbackError;
        const rollbackStage = [...(record.stages ?? [])].reverse().find((stage) => stage.name === "rollback");
        if (rollbackStage) finishStage(rollbackStage, "failed");
        record.finalState = "failed";
        try { record.finalProductionImageId = await containerImageId(docker.productionContainer); } catch { /* no authoritative final container */ }
        appendEvidence(record, rollbackError, "rollback verification");
        throw new Error(`Production verification failed and rollback did not verify: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
  } catch (error) {
    const activeStage = [...(record.stages ?? [])].reverse().find((stage) => stage.status === "running");
    if (activeStage) finishStage(activeStage, "failed");
    record.finalState ??= "failed";
    try { record.finalProductionImageId ??= await containerImageId(docker.productionContainer); } catch { /* no authoritative final container */ }
    throw error;
  } finally {
    await removeContainer(docker.candidateContainer);
  }
}
async function imageId(image: string) { return run("docker", ["image", "inspect", "--format", "{{.Id}}", image]); }
async function containerImageId(container: string) { return run("docker", ["inspect", "--format", "{{.Image}}", container]); }
function isImmutableReference(image: string) { return image.startsWith("sha256:") || /@sha256:[a-f0-9]{64}$/i.test(image); }
function beginStage(record: RunRecord, name: "candidate" | "production" | "rollback") {
  const stage: NonNullable<RunRecord["stages"]>[number] = { name, status: "running", startedAt: new Date().toISOString() };
  record.stages!.push(stage);
  return stage;
}
function finishStage(stage: NonNullable<RunRecord["stages"]>[number], status: "passed" | "failed") {
  stage.status = status;
  stage.finishedAt = new Date().toISOString();
}

export async function rollback(config: FpgConfig, image?: string) {
  const docker = config.docker;
  if (!docker) throw new Error("docker configuration is required for rollback");
  if (!image) throw new Error("rollback requires an explicit immutable image argument");
  if (docker.requireImmutableImage && !isImmutableReference(image)) throw new Error("rollback image must use a digest or image ID when docker.requireImmutableImage is true");
  await run("docker", ["tag", image, docker.productionImage]);
  await removeContainer(docker.productionContainer);
  await runProduction(config, docker.productionImage, []);
  await waitFor(`http://127.0.0.1:${docker.productionPort}${docker.healthPath}`);
}
async function runProduction(config: FpgConfig, image: string, extraArgs: string[]) {
  const docker = config.docker!;
  await run("docker", ["run", "--detach", "--name", docker.productionContainer, ...extraArgs, "--publish", `${docker.productionPort}:${docker.containerPort}`, image]);
}
async function removeContainer(name: string) {
  try { await run("docker", ["rm", "--force", name]); } catch { /* absent is expected */ }
}
async function waitFor(url: string) {
  let last = "";
  for (let attempt = 0; attempt < 30; attempt++) {
    try { const response = await fetch(url); if (response.ok) return; last = `HTTP ${response.status}`; } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Container did not become ready at ${url}: ${last}`);
}
function prefixPaths<T extends { baseline: string; current: string; diff: string }>(item: T, folder: string): T {
  const prefix = (path: string) => path.startsWith("..") ? path : `${folder}/${path}`;
  return { ...item, baseline: prefix(item.baseline), current: prefix(item.current), diff: prefix(item.diff) };
}
function appendEvidence(record: RunRecord, error: unknown, name: string) {
  const evidence = error as { checks?: RunRecord["checks"]; visuals?: RunRecord["visuals"] };
  if (evidence.checks) record.checks.push(...evidence.checks);
  if (evidence.visuals) record.visuals.push(...evidence.visuals.map((item) => prefixPaths(item, "production")));
  record.checks.push({ name, status: "failed", detail: error instanceof Error ? error.message : String(error) });
}
