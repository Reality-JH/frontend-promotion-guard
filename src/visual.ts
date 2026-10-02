import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join, relative } from "node:path";
import pixelmatch from "pixelmatch";
import { chromium, type Locator, type Page } from "playwright-core";
import { PNG } from "pngjs";
import type { CheckResult, FpgConfig, VisualResult } from "./types.js";
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
].filter(Boolean) as string[];

export async function findBrowser(config: FpgConfig) {
  for (const path of [config.browserPath, ...browserCandidates].filter(Boolean) as string[]) if (await exists(path)) return path;
  throw new Error("No Chrome or Edge executable found; set browserPath or FPG_BROWSER_PATH");
}

export async function browserIdentity(config: FpgConfig) {
  const path = await findBrowser(config);
  const browser = await chromium.launch({ executablePath: path, headless: true });
  try { return `${browser.browserType().name()} ${browser.version()} (${path})`; } finally { await browser.close(); }
}

export async function captureAndCompare(config: FpgConfig, runDir: string, options: { compare: boolean; update: boolean; baseUrl?: string }) {
  await mkdir(runDir, { recursive: true });
  await mkdir(config.visual.baselineDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: await findBrowser(config), headless: true });
  const gate = { maskSelectors: config.visual.maskSelectors ?? [], freezeTime: config.visual.freezeTime, ariaSnapshot: config.visual.ariaSnapshot ?? false, ariaSnapshotMode: config.visual.ariaSnapshotMode ?? "fail", fullPage: config.visual.fullPage ?? false };
  const checks: CheckResult[] = [];
  const visuals: VisualResult[] = [];
  const failures: string[] = [];
  const pendingBaselines: Array<{ current: string; baseline: string }> = [];
  try {
    for (const route of config.routes) for (const viewport of config.viewports) {
      const label = `${route.name} ${viewport.width}x${viewport.height}`;
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      const consoleErrors: string[] = [];
      page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      try {
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
        if (gate.freezeTime) await freezeClock(page, gate.freezeTime);
        await page.goto(`${(options.baseUrl ?? config.baseUrl).replace(/\/$/, "")}${route.path}`, { waitUntil: route.waitUntil ?? "domcontentloaded", timeout: 30_000 });
        await page.locator(route.readySelector).waitFor({ state: "visible", timeout: 15_000 });
        await page.evaluate(async () => { await document.fonts?.ready; });
        await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
        for (const assertion of config.computedStyles) {
          const value = await page.locator(assertion.selector).first().evaluate((element, property) => getComputedStyle(element).getPropertyValue(property as string), assertion.property);
          const pass = assertion.equals !== undefined ? value === assertion.equals : assertion.notEquals !== undefined ? value !== assertion.notEquals : Boolean(value);
          const result: CheckResult = { name: `${label}: ${assertion.selector} ${assertion.property}`, status: pass ? "passed" : "failed", detail: value || "<empty>" };
          checks.push(result);
          if (!pass) failures.push(`${result.name}: ${result.detail}`);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const overflowPass = overflow <= 1;
        checks.push({ name: `${label}: horizontal overflow`, status: overflowPass ? "passed" : "failed", detail: `${overflow}px` });
        if (!overflowPass) failures.push(`${label}: horizontal overflow ${overflow}px`);
        const consolePass = consoleErrors.length === 0;
        checks.push({ name: `${label}: browser console`, status: consolePass ? "passed" : "failed", detail: consolePass ? "no errors" : consoleErrors.join(" | ") });
        if (!consolePass) failures.push(`${label}: browser console errors`);

        const stem = `${slug(route.name)}-${viewport.width}x${viewport.height}`;
        const current = join(runDir, `${stem}-current.png`);
        const baseline = join(config.visual.baselineDir, `${stem}.png`);
        const baselineEvidence = join(runDir, `${stem}-baseline.png`);
        const diff = join(runDir, `${stem}-diff.png`);
        const masks: Locator[] = [];
        for (const selector of gate.maskSelectors) {
          const locator = page.locator(selector);
          if ((await locator.count()) > 0 && (await locator.first().isVisible())) masks.push(locator);
        }
        await page.screenshot({ path: current, fullPage: route.fullPage ?? gate.fullPage, ...(masks.length ? { mask: masks } : {}) });
        if (options.update) {
          await copyFile(current, baselineEvidence);
          pendingBaselines.push({ current, baseline });
          await writeBlankDiff(current, diff);
          visuals.push(visual(route.name, viewport, baselineEvidence, current, diff, 0, "passed", runDir));
        } else if (options.compare) {
          if (!(await exists(baseline))) {
            await writeBlankDiff(current, baselineEvidence);
            await writeBlankDiff(current, diff);
            failures.push(`${label}: missing baseline ${baseline}; run fpg baseline update explicitly`);
            visuals.push(visual(route.name, viewport, baselineEvidence, current, diff, 1, "failed", runDir));
          } else {
            await copyFile(baseline, baselineEvidence);
            const compared = await comparePng(baseline, current, diff, config.visual.pixelThreshold);
            const status = compared.ratio <= config.visual.maxDiffPixelRatio ? "passed" : "failed";
            if (status === "failed") failures.push(`${label}: visual diff ${(compared.ratio * 100).toFixed(2)}% exceeds ${(config.visual.maxDiffPixelRatio * 100).toFixed(2)}%`);
            visuals.push(visual(route.name, viewport, baselineEvidence, current, diff, compared.ratio, status, runDir));
          }
        } else {
          if (await exists(baseline)) await copyFile(baseline, baselineEvidence);
          await writeBlankDiff(current, diff);
          visuals.push(visual(route.name, viewport, baselineEvidence, current, diff, 0, "passed", runDir));
        }
        if (gate.ariaSnapshot) {
          const entry = visuals[visuals.length - 1];
          const ariaCurrent = join(runDir, `${stem}.aria-current.yml`);
          const ariaBaseline = join(config.visual.baselineDir, `${stem}.aria.yml`);
          const snapshot = await page.locator("body").ariaSnapshot();
          await writeFile(ariaCurrent, snapshot);
          if (options.update) {
            pendingBaselines.push({ current: ariaCurrent, baseline: ariaBaseline });
            entry.ariaStatus = "passed";
          } else if (!options.compare) {
            entry.ariaStatus = "passed";
          } else if (!(await exists(ariaBaseline))) {
            entry.ariaStatus = "failed";
            checks.push({ name: `${label}: aria snapshot`, status: "failed", detail: "missing baseline" });
            failures.push(`${label}: missing aria baseline ${ariaBaseline}; run fpg baseline update explicitly`);
          } else {
            const expected = await readFile(ariaBaseline, "utf8");
            if (expected === snapshot) {
              entry.ariaStatus = "passed";
              checks.push({ name: `${label}: aria snapshot`, status: "passed", detail: "matches baseline" });
            } else {
              const diffText = diffLines(expected, snapshot);
              const ariaDiff = join(runDir, `${stem}.aria.diff`);
              await writeFile(ariaDiff, diffText);
              entry.ariaStatus = gate.ariaSnapshotMode === "warn" ? "warn" : "failed";
              entry.ariaDiff = relative(runDir, ariaDiff).replace(/\\/g, "/");
              entry.ariaDiffText = diffText.length > 12_000 ? `${diffText.slice(0, 12_000)}\n(truncated)` : diffText;
              const changes = diffText.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length;
              checks.push({ name: `${label}: aria snapshot`, status: entry.ariaStatus === "failed" ? "failed" : "passed", detail: `changed vs baseline (${changes} diff lines${entry.ariaStatus === "warn" ? ", warn mode" : ""})` });
              if (entry.ariaStatus === "failed") failures.push(`${label}: aria snapshot changed (${changes} diff lines)`);
            }
          }
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        checks.push({ name: label, status: "failed", detail });
        failures.push(`${label}: ${detail}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length) throw Object.assign(new Error(failures.join("\n")), { checks, visuals });
  for (const item of pendingBaselines) await copyFile(item.current, item.baseline);
  if (options.update) {
    const files = await Promise.all(pendingBaselines.map(async (item) => ({ file: basename(item.baseline), sha256: createHash("sha256").update(await readFile(item.baseline)).digest("hex") })));
    await writeFile(join(config.visual.baselineDir, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2));
  }
  return { checks, visuals };
}

async function comparePng(baselinePath: string, currentPath: string, diffPath: string, threshold: number) {
  const baseline = PNG.sync.read(await readFile(baselinePath));
  const current = PNG.sync.read(await readFile(currentPath));
  if (baseline.width !== current.width || baseline.height !== current.height) throw new Error(`Screenshot size mismatch: ${baseline.width}x${baseline.height} vs ${current.width}x${current.height}`);
  const diff = new PNG({ width: current.width, height: current.height });
  const changed = pixelmatch(baseline.data, current.data, diff.data, current.width, current.height, { threshold, includeAA: false });
  await writeFile(diffPath, PNG.sync.write(diff));
  return { ratio: changed / (current.width * current.height) };
}
async function writeBlankDiff(currentPath: string, diffPath: string) {
  const current = PNG.sync.read(await readFile(currentPath));
  await writeFile(diffPath, PNG.sync.write(new PNG({ width: current.width, height: current.height })));
}
function visual(routeName: string, viewport: { width: number; height: number }, baseline: string, current: string, diff: string, ratio: number, status: "passed" | "failed", runDir: string): VisualResult {
  const rel = (path: string) => relative(runDir, path).replace(/\\/g, "/");
  return { route: routeName, viewport: `${viewport.width}x${viewport.height}`, baseline: rel(baseline), current: rel(current), diff: rel(diff), diffPixelRatio: ratio, status };
}
async function freezeClock(page: Page, iso: string) {
  const time = new Date(iso);
  try {
    await page.clock.install({ time });
    await page.clock.setFixedTime(time);
  } catch {
    await page.addInitScript((fixed: number) => {
      const Native = Date;
      class Frozen extends Native {
        static override now() { return fixed; }
        constructor(...args: unknown[]) {
          if (args.length) super(...(args as [number]));
          else super(fixed);
        }
      }
      Object.defineProperty(globalThis, "Date", { value: Frozen, writable: true, configurable: true });
    }, time.getTime());
  }
}
function diffLines(before: string, after: string) {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 2_000_000) {
    const aSet = new Set(a);
    const bSet = new Set(b);
    return [...b.filter((line) => !aSet.has(line)).map((line) => `+ ${line}`), ...a.filter((line) => !bSet.has(line)).map((line) => `- ${line}`), ""].join("\n");
  }
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push(`  ${a[i]}`); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(`- ${a[i++]}`);
    else out.push(`+ ${b[j++]}`);
  }
  while (i < a.length) out.push(`- ${a[i++]}`);
  while (j < b.length) out.push(`+ ${b[j++]}`);
  return `${out.join("\n")}\n`;
}
