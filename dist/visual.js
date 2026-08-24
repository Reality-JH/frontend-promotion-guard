import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join, relative } from "node:path";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { exists, slug } from "./utils.js";
const browserCandidates = [
    process.env.FPG_BROWSER_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/microsoft-edge",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);
export async function findBrowser(config) {
    for (const path of [config.browserPath, ...browserCandidates].filter(Boolean))
        if (await exists(path))
            return path;
    throw new Error("No Chrome or Edge executable found; set browserPath or FPG_BROWSER_PATH");
}
export async function browserIdentity(config) {
    const path = await findBrowser(config);
    const browser = await chromium.launch({ executablePath: path, headless: true });
    try {
        return `${browser.browserType().name()} ${browser.version()} (${path})`;
    }
    finally {
        await browser.close();
    }
}
export async function captureAndCompare(config, runDir, options) {
    await mkdir(runDir, { recursive: true });
    await mkdir(config.visual.baselineDir, { recursive: true });
    const browser = await chromium.launch({ executablePath: await findBrowser(config), headless: true });
    const checks = [];
    const visuals = [];
    const failures = [];
    const pendingBaselines = [];
    try {
        for (const route of config.routes)
            for (const viewport of config.viewports) {
                const label = `${route.name} ${viewport.width}x${viewport.height}`;
                const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
                const consoleErrors = [];
                page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
                page.on("pageerror", (error) => consoleErrors.push(error.message));
                try {
                    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
                    await page.goto(`${(options.baseUrl ?? config.baseUrl).replace(/\/$/, "")}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
                    await page.locator(route.readySelector).waitFor({ state: "visible", timeout: 15_000 });
                    await page.evaluate(async () => { await document.fonts?.ready; });
                    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
                    for (const assertion of config.computedStyles) {
                        const value = await page.locator(assertion.selector).first().evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), assertion.property);
                        const pass = assertion.equals !== undefined ? value === assertion.equals : assertion.notEquals !== undefined ? value !== assertion.notEquals : Boolean(value);
                        const result = { name: `${label}: ${assertion.selector} ${assertion.property}`, status: pass ? "passed" : "failed", detail: value || "<empty>" };
                        checks.push(result);
                        if (!pass)
                            failures.push(`${result.name}: ${result.detail}`);
                    }
                    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                    const overflowPass = overflow <= 1;
                    checks.push({ name: `${label}: horizontal overflow`, status: overflowPass ? "passed" : "failed", detail: `${overflow}px` });
                    if (!overflowPass)
                        failures.push(`${label}: horizontal overflow ${overflow}px`);
                    const consolePass = consoleErrors.length === 0;
                    checks.push({ name: `${label}: browser console`, status: consolePass ? "passed" : "failed", detail: consolePass ? "no errors" : consoleErrors.join(" | ") });
                    if (!consolePass)
                        failures.push(`${label}: browser console errors`);
                    const stem = `${slug(route.name)}-${viewport.width}x${viewport.height}`;
                    const current = join(runDir, `${stem}-current.png`);
                    const baseline = join(config.visual.baselineDir, `${stem}.png`);
                    const baselineEvidence = join(runDir, `${stem}-baseline.png`);
                    const diff = join(runDir, `${stem}-diff.png`);
                    await page.screenshot({ path: current, fullPage: false });
                    if (options.update) {
                        await copyFile(current, baselineEvidence);
                        pendingBaselines.push({ current, baseline });
                        await writeBlankDiff(current, diff);
                        visuals.push(visual(route.name, viewport, baselineEvidence, current, diff, 0, "passed", runDir));
                    }
                    else if (options.compare) {
                        if (!(await exists(baseline))) {
                            await writeBlankDiff(current, baselineEvidence);
                            await writeBlankDiff(current, diff);
                            failures.push(`${label}: missing baseline ${baseline}; run fpg baseline update explicitly`);
                            visuals.push(visual(route.name, viewport, baselineEvidence, current, diff, 1, "failed", runDir));
                        }
                        else {
                            await copyFile(baseline, baselineEvidence);
                            const compared = await comparePng(baseline, current, diff, config.visual.pixelThreshold);
                            const status = compared.ratio <= config.visual.maxDiffPixelRatio ? "passed" : "failed";
                            if (status === "failed")
                                failures.push(`${label}: visual diff ${(compared.ratio * 100).toFixed(2)}% exceeds ${(config.visual.maxDiffPixelRatio * 100).toFixed(2)}%`);
                            visuals.push(visual(route.name, viewport, baselineEvidence, current, diff, compared.ratio, status, runDir));
                        }
                    }
                    else {
                        if (await exists(baseline))
                            await copyFile(baseline, baselineEvidence);
                        await writeBlankDiff(current, diff);
                        visuals.push(visual(route.name, viewport, baselineEvidence, current, diff, 0, "passed", runDir));
                    }
                }
                catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    checks.push({ name: label, status: "failed", detail });
                    failures.push(`${label}: ${detail}`);
                }
                finally {
                    await page.close();
                }
            }
    }
    finally {
        await browser.close();
    }
    if (failures.length)
        throw Object.assign(new Error(failures.join("\n")), { checks, visuals });
    for (const item of pendingBaselines)
        await copyFile(item.current, item.baseline);
    if (options.update) {
        const files = await Promise.all(pendingBaselines.map(async (item) => ({ file: basename(item.baseline), sha256: createHash("sha256").update(await readFile(item.baseline)).digest("hex") })));
        await writeFile(join(config.visual.baselineDir, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2));
    }
    return { checks, visuals };
}
async function comparePng(baselinePath, currentPath, diffPath, threshold) {
    const baseline = PNG.sync.read(await readFile(baselinePath));
    const current = PNG.sync.read(await readFile(currentPath));
    if (baseline.width !== current.width || baseline.height !== current.height)
        throw new Error(`Screenshot size mismatch: ${baseline.width}x${baseline.height} vs ${current.width}x${current.height}`);
    const diff = new PNG({ width: current.width, height: current.height });
    const changed = pixelmatch(baseline.data, current.data, diff.data, current.width, current.height, { threshold, includeAA: false });
    await writeFile(diffPath, PNG.sync.write(diff));
    return { ratio: changed / (current.width * current.height) };
}
async function writeBlankDiff(currentPath, diffPath) {
    const current = PNG.sync.read(await readFile(currentPath));
    await writeFile(diffPath, PNG.sync.write(new PNG({ width: current.width, height: current.height })));
}
function visual(routeName, viewport, baseline, current, diff, ratio, status, runDir) {
    const rel = (path) => relative(runDir, path).replace(/\\/g, "/");
    return { route: routeName, viewport: `${viewport.width}x${viewport.height}`, baseline: rel(baseline), current: rel(current), diff: rel(diff), diffPixelRatio: ratio, status };
}
