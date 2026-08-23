import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
export async function auditCss(config) {
    const files = (await Promise.all(config.cssAudit.files.map((pattern) => expandGlob(config.rootDir, pattern)))).flat();
    if (files.length === 0)
        throw new Error(`CSS audit found no files for: ${config.cssAudit.files.join(", ")}`);
    const css = (await Promise.all([...new Set(files)].map((file) => readFile(file, "utf8")))).join("\n");
    const checks = [{ name: "CSS files", status: "passed", detail: `${files.length} file(s), ${Buffer.byteLength(css)} bytes` }];
    for (const token of config.cssAudit.forbiddenTokens)
        checks.push(result(`Forbidden token ${token}`, !css.includes(token), css.includes(token) ? "found" : "not found"));
    for (const selector of config.cssAudit.requiredSelectors)
        checks.push(result(`Required selector ${selector}`, selectorPresent(css, selector), selectorPresent(css, selector) ? "found" : "missing"));
    try {
        assertChecks(checks);
    }
    catch (error) {
        throw Object.assign(error, { checks });
    }
    return checks;
}
export function selectorPresent(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[},\\s])${escaped}(?=[\\s,{:.#>+~[])`, "m").test(css);
}
function result(name, pass, detail) { return { name, status: pass ? "passed" : "failed", detail }; }
export function assertChecks(checks) {
    const failures = checks.filter((check) => check.status === "failed");
    if (failures.length)
        throw new Error(failures.map((item) => `${item.name}: ${item.detail}`).join("\n"));
}
async function expandGlob(root, pattern) {
    const normalized = pattern.replace(/\\/g, "/");
    const wildcard = normalized.search(/[*?]/);
    const basePart = wildcard < 0 ? normalized.slice(0, normalized.lastIndexOf("/")) : normalized.slice(0, normalized.slice(0, wildcard).lastIndexOf("/"));
    const base = resolve(root, basePart || ".");
    const regex = new RegExp("^" + normalized.split("").map((char, index) => {
        if (char === "*" && normalized[index + 1] === "*")
            return "(?:.*)";
        if (char === "*")
            return "[^/]*";
        if (char === "?")
            return "[^/]";
        return char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }).join("").replace(/\(\?:\.\*\)\[\^\/\]\*/g, ".*") + "$");
    const matches = [];
    async function walk(dir) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const full = resolve(dir, entry.name);
            if (entry.isDirectory())
                await walk(full);
            else if (regex.test(relative(root, full).split(sep).join("/")))
                matches.push(full);
        }
    }
    try {
        await walk(base);
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
    return matches;
}
