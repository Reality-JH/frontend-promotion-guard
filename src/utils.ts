import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";

export async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
export async function ensureDir(path: string) { await mkdir(path, { recursive: true }); }
export function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "route"; }
export function redact(value: string) {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@/\s]+)@/gi, "$1[REDACTED]@")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(authorization|cookie|token|api[-_]?key|password|secret)(\s*[=:]\s*)([^\s,;]+)/gi, "$1$2[REDACTED]");
}
export function run(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise(redact(stdout.trim())) : reject(new Error(redact(`${command} exited ${code}: ${stderr || stdout}`.trim()))));
  });
}
export async function pruneRuns(evidenceDir: string, retention: number) {
  if (retention < 1 || !(await exists(evidenceDir))) return;
  const entries = (await readdir(evidenceDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  for (const name of entries.slice(retention)) await rm(join(evidenceDir, name), { recursive: true, force: true });
}
export function resolveInside(root: string, path: string) {
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(root + (process.platform === "win32" ? "\\" : "/"))) throw new Error(`Path escapes root: ${path}`);
  return target;
}
export function fileName(path: string) { return basename(path); }

export async function withReleaseLock<T>(root: string, commit: string, operation: () => Promise<T>): Promise<T> {
  const lock = join(root, ".fpg-release.lock");
  try { await mkdir(lock); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let owner = "unknown owner";
    try {
      const data = JSON.parse(await readFile(join(lock, "owner.json"), "utf8")) as { pid?: number; startedAt?: string; commit?: string };
      owner = `pid ${data.pid ?? "unknown"}, started ${data.startedAt ?? "unknown"}, commit ${data.commit ?? "unknown"}`;
    } catch { /* an incomplete lock is still a lock */ }
    throw new Error(`Another release operation is active (${owner})`);
  }
  try {
    await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), commit }, null, 2));
    return await operation();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
