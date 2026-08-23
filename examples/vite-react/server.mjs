import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const root = new URL("./dist/", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    let file = pathname === "/" || pathname === "/details" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
    if (process.env.FPG_BREAK_CSS === "1" && extname(file) === ".css") { response.writeHead(200, { "content-type": "text/css" }); response.end("/* intentionally broken */"); return; }
    const body = await readFile(join(root, file));
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }); response.end(body);
  } catch { response.writeHead(404); response.end("Not found"); }
}).listen(8080, "0.0.0.0");
