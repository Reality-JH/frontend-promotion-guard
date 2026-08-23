import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const allowed = new Set(["MIT", "ISC", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "0BSD", "CC0-1.0", "Unlicense"]);
const bin = join(dirname(fileURLToPath(import.meta.url)), "../node_modules/license-checker-rseidelsohn/bin/license-checker-rseidelsohn.js");
const { stdout } = await exec(process.execPath, [bin, "--production", "--json"], { windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
const licenses = JSON.parse(stdout);
const unknown = Object.entries(licenses).filter(([, item]) => !allowed.has(item.licenses));
if (unknown.length) {
  console.error(`Unapproved production licenses (${unknown.length}):`);
  for (const [name, item] of unknown) console.error(`- ${name}: ${item.licenses}`);
  process.exit(1);
}
console.log(`Production license scan passed (${Object.keys(licenses).length} packages)`);
