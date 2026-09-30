import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse } from "yaml";
const required = (value, name) => {
    if (value === undefined || value === null || value === "")
        throw new Error(`Missing configuration: ${name}`);
    return value;
};
export async function loadConfig(path = "fpg.yml") {
    const configPath = resolve(path);
    const rootDir = dirname(configPath);
    const raw = object(parse(await readFile(configPath, "utf8")), "configuration");
    const visual = object(raw.visual ?? {}, "visual");
    const css = object(raw.cssAudit ?? {}, "cssAudit");
    const dockerRaw = raw.docker === undefined ? undefined : object(raw.docker, "docker");
    const routes = required(raw.routes, "routes");
    const viewports = required(raw.viewports, "viewports");
    if (!Array.isArray(routes) || routes.length === 0)
        throw new Error("routes must not be empty");
    if (!Array.isArray(viewports) || viewports.length === 0)
        throw new Error("viewports must not be empty");
    routes.forEach((route, index) => {
        const item = object(route, `routes[${index}]`);
        nonEmptyString(item.name, `routes[${index}].name`);
        const routePath = nonEmptyString(item.path, `routes[${index}].path`);
        if (!routePath.startsWith("/"))
            throw new Error(`routes[${index}].path must start with /`);
        nonEmptyString(item.readySelector, `routes[${index}].readySelector`);
    });
    if (new Set(routes.map((route) => route.name)).size !== routes.length)
        throw new Error("routes names must be unique");
    viewports.forEach((viewport, index) => {
        const item = object(viewport, `viewports[${index}]`);
        positiveInteger(item.width, `viewports[${index}].width`);
        positiveInteger(item.height, `viewports[${index}].height`);
    });
    const computedStyles = raw.computedStyles ?? [];
    if (!Array.isArray(computedStyles))
        throw new Error("computedStyles must be an array");
    computedStyles.forEach((assertion, index) => {
        const item = object(assertion, `computedStyles[${index}]`);
        nonEmptyString(item.selector, `computedStyles[${index}].selector`);
        nonEmptyString(item.property, `computedStyles[${index}].property`);
        const comparisons = Number(item.equals !== undefined) + Number(item.notEquals !== undefined);
        if (comparisons !== 1)
            throw new Error(`computedStyles[${index}] must define exactly one of equals or notEquals`);
        if (item.equals !== undefined)
            nonEmptyString(item.equals, `computedStyles[${index}].equals`);
        if (item.notEquals !== undefined)
            nonEmptyString(item.notEquals, `computedStyles[${index}].notEquals`);
    });
    const docker = dockerRaw ? {
        candidateImage: nonEmptyString(dockerRaw.candidateImage, "docker.candidateImage"),
        productionImage: nonEmptyString(dockerRaw.productionImage, "docker.productionImage"),
        candidatePort: port(dockerRaw.candidatePort ?? 3100, "docker.candidatePort"),
        productionPort: port(dockerRaw.productionPort ?? 3000, "docker.productionPort"),
        containerPort: port(dockerRaw.containerPort ?? 80, "docker.containerPort"),
        candidateContainer: nonEmptyString(dockerRaw.candidateContainer ?? "fpg-candidate", "docker.candidateContainer"),
        productionContainer: nonEmptyString(dockerRaw.productionContainer ?? "fpg-production", "docker.productionContainer"),
        buildContext: dockerRaw.buildContext === undefined ? undefined : resolve(rootDir, nonEmptyString(dockerRaw.buildContext, "docker.buildContext")),
        dockerfile: dockerRaw.dockerfile === undefined ? undefined : resolve(rootDir, nonEmptyString(dockerRaw.dockerfile, "docker.dockerfile")),
        candidateArgs: strings(dockerRaw.candidateArgs),
        productionArgs: strings(dockerRaw.productionArgs),
        healthPath: nonEmptyString(dockerRaw.healthPath ?? routes[0].path, "docker.healthPath"),
        rollback: booleanValue(dockerRaw.rollback ?? true, "docker.rollback"),
        requireImmutableImage: booleanValue(dockerRaw.requireImmutableImage ?? false, "docker.requireImmutableImage"),
    } : undefined;
    if (docker && docker.candidatePort === docker.productionPort)
        throw new Error("docker.candidatePort and docker.productionPort must be different");
    if (docker && docker.candidateContainer === docker.productionContainer)
        throw new Error("docker.candidateContainer and docker.productionContainer must be different");
    if (docker && docker.candidateImage === docker.productionImage)
        throw new Error("docker.candidateImage and docker.productionImage must be different");
    if (docker && !docker.healthPath.startsWith("/"))
        throw new Error("docker.healthPath must start with /");
    const monitor = raw.monitor === undefined ? undefined : parseMonitor(object(raw.monitor, "monitor"), rootDir);
    const ratio = ratioValue(visual.maxDiffPixelRatio ?? 0.12, "visual.maxDiffPixelRatio");
    const pixelThreshold = ratioValue(visual.pixelThreshold ?? 0.2, "visual.pixelThreshold");
    const retention = nonNegativeInteger(visual.retention ?? 10, "visual.retention");
    const baseUrl = nonEmptyString(raw.baseUrl ?? "http://127.0.0.1:3100", "baseUrl").replace(/\/$/, "");
    let parsedUrl;
    try {
        parsedUrl = new URL(baseUrl);
    }
    catch {
        throw new Error("baseUrl must be an http or https URL");
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol))
        throw new Error("baseUrl must be an http or https URL");
    return {
        configPath,
        rootDir,
        baseUrl,
        browserPath: raw.browserPath === undefined ? undefined : resolve(rootDir, nonEmptyString(raw.browserPath, "browserPath")),
        routes,
        viewports,
        cssAudit: {
            files: strings(css.files),
            forbiddenTokens: strings(css.forbiddenTokens),
            requiredSelectors: strings(css.requiredSelectors),
        },
        computedStyles: computedStyles,
        visual: {
            maxDiffPixelRatio: ratio,
            pixelThreshold,
            baselineDir: resolve(rootDir, nonEmptyString(visual.baselineDir ?? "visual-baselines", "visual.baselineDir")),
            evidenceDir: resolve(rootDir, nonEmptyString(visual.evidenceDir ?? "release-evidence", "visual.evidenceDir")),
            retention,
        },
        docker,
        monitor,
    };
}
function parseMonitor(raw, rootDir) {
    const interval = nonEmptyString(raw.interval ?? "5m", "monitor.interval");
    const webhookRaw = raw.webhook === undefined ? undefined : object(raw.webhook, "monitor.webhook");
    const headers = {};
    if (webhookRaw?.headers !== undefined)
        for (const [key, value] of Object.entries(object(webhookRaw.headers, "monitor.webhook.headers"))) {
            if (typeof value !== "string")
                throw new Error("monitor.webhook.headers must map strings to strings");
            headers[key] = value;
        }
    return {
        interval,
        intervalMs: durationMs(interval, "monitor.interval"),
        failureThreshold: positiveInteger(raw.failureThreshold ?? 2, "monitor.failureThreshold"),
        recoveryNotify: booleanValue(raw.recoveryNotify ?? true, "monitor.recoveryNotify"),
        webhook: webhookRaw ? {
            url: httpUrl(webhookRaw.url, "monitor.webhook.url"),
            headers,
            timeoutMs: positiveInteger(webhookRaw.timeoutMs ?? 10_000, "monitor.webhook.timeoutMs"),
        } : undefined,
        stateFile: resolve(rootDir, nonEmptyString(raw.stateFile ?? "monitor-state.json", "monitor.stateFile")),
        baseUrl: raw.baseUrl === undefined ? undefined : httpUrl(raw.baseUrl, "monitor.baseUrl"),
    };
}
function durationMs(value, name) {
    const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(value.trim());
    if (!match)
        throw new Error(`${name} must be a duration such as 30s, 5m, or 1h`);
    const ms = Number(match[1]) * { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[match[2]];
    if (!Number.isFinite(ms) || ms <= 0)
        throw new Error(`${name} must be a positive duration`);
    return ms;
}
function httpUrl(value, name) {
    const url = nonEmptyString(value, name).replace(/\/$/, "");
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new Error(`${name} must be an http or https URL`);
    }
    if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error(`${name} must be an http or https URL`);
    return url;
}
function object(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${name} must be an object`);
    return value;
}
function nonEmptyString(value, name) {
    if (typeof value !== "string" || value.trim() === "")
        throw new Error(`${name} must be a non-empty string`);
    return value;
}
function positiveInteger(value, name) {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
        throw new Error(`${name} must be a positive integer`);
    return value;
}
function nonNegativeInteger(value, name) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
        throw new Error(`${name} must be a non-negative integer`);
    return value;
}
function port(value, name) {
    const number = positiveInteger(value, name);
    if (number > 65535)
        throw new Error(`${name} must be at most 65535`);
    return number;
}
function ratioValue(value, name) {
    if (typeof value !== "number" || !(value >= 0 && value <= 1))
        throw new Error(`${name} must be between 0 and 1`);
    return value;
}
function booleanValue(value, name) {
    if (typeof value !== "boolean")
        throw new Error(`${name} must be a boolean`);
    return value;
}
function strings(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
        throw new Error("Expected a string array in configuration");
    return value;
}
