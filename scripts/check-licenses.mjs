import { readFile } from "node:fs/promises";
import { join } from "node:path";

const allowed = new Set(["MIT", "ISC", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "0BSD", "CC0-1.0", "Unlicense"]);
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const packages = Object.entries(lock.packages).filter(([path, item]) => path.startsWith("node_modules/") && item.dev !== true);
const licenses = await Promise.all(packages.map(async ([path]) => {
  const manifest = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
  const license = typeof manifest.license === "string" ? manifest.license : manifest.license?.type;
  return { name: `${manifest.name}@${manifest.version}`, license };
}));
const unknown = licenses.filter((item) => typeof item.license !== "string" || !item.license.split(/\s+(?:AND|OR)\s+|[()]/).filter(Boolean).every((license) => allowed.has(license)));
if (unknown.length) {
  console.error(`Unapproved production licenses (${unknown.length}):`);
  for (const item of unknown) console.error(`- ${item.name}: ${item.license ?? "missing"}`);
  process.exit(1);
}
console.log(`Production license scan passed (${licenses.length} packages)`);
