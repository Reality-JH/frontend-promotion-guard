import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse } from "yaml";
import type { DockerConfig, FpgConfig } from "./types.js";

type Raw = Record<string, unknown>;
const required = <T>(value: T | undefined, name: string): T => {
  if (value === undefined || value === null || value === "") throw new Error(`Missing configuration: ${name}`);
  return value;
};

export async function loadConfig(path = "fpg.yml"): Promise<FpgConfig> {
  const configPath = resolve(path);
  const rootDir = dirname(configPath);
  const raw = parse(await readFile(configPath, "utf8")) as Raw;
  const visual = (raw.visual ?? {}) as Raw;
  const css = (raw.cssAudit ?? {}) as Raw;
  const dockerRaw = raw.docker as Raw | undefined;
  const routes = required(raw.routes as FpgConfig["routes"], "routes");
  const viewports = required(raw.viewports as FpgConfig["viewports"], "viewports");
  if (!Array.isArray(routes) || routes.length === 0) throw new Error("routes must not be empty");
  if (!Array.isArray(viewports) || viewports.length === 0) throw new Error("viewports must not be empty");
  const docker: DockerConfig | undefined = dockerRaw ? {
    candidateImage: required(dockerRaw.candidateImage as string, "docker.candidateImage"),
    productionImage: required(dockerRaw.productionImage as string, "docker.productionImage"),
    candidatePort: Number(dockerRaw.candidatePort ?? 3100),
    productionPort: Number(dockerRaw.productionPort ?? 3000),
    containerPort: Number(dockerRaw.containerPort ?? 80),
    candidateContainer: String(dockerRaw.candidateContainer ?? "fpg-candidate"),
    productionContainer: String(dockerRaw.productionContainer ?? "fpg-production"),
    buildContext: dockerRaw.buildContext ? resolve(rootDir, String(dockerRaw.buildContext)) : undefined,
    dockerfile: dockerRaw.dockerfile ? resolve(rootDir, String(dockerRaw.dockerfile)) : undefined,
    candidateArgs: strings(dockerRaw.candidateArgs),
    productionArgs: strings(dockerRaw.productionArgs),
    healthPath: String(dockerRaw.healthPath ?? routes[0].path),
    rollback: dockerRaw.rollback !== false,
  } : undefined;
  const ratio = Number(visual.maxDiffPixelRatio ?? 0.12);
  if (!(ratio >= 0 && ratio <= 1)) throw new Error("visual.maxDiffPixelRatio must be between 0 and 1");
  return {
    configPath,
    rootDir,
    baseUrl: String(raw.baseUrl ?? "http://127.0.0.1:3100").replace(/\/$/, ""),
    browserPath: raw.browserPath ? resolve(rootDir, String(raw.browserPath)) : undefined,
    routes,
    viewports,
    cssAudit: {
      files: strings(css.files),
      forbiddenTokens: strings(css.forbiddenTokens),
      requiredSelectors: strings(css.requiredSelectors),
    },
    computedStyles: (raw.computedStyles ?? []) as FpgConfig["computedStyles"],
    visual: {
      maxDiffPixelRatio: ratio,
      pixelThreshold: Number(visual.pixelThreshold ?? 0.2),
      baselineDir: resolve(rootDir, String(visual.baselineDir ?? "visual-baselines")),
      evidenceDir: resolve(rootDir, String(visual.evidenceDir ?? "release-evidence")),
      retention: Number(visual.retention ?? 10),
    },
    docker,
  };
}

function strings(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("Expected a string array in configuration");
  return value;
}
