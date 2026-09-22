import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT ?? 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be an integer between 1 and 65535.");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".jsonl": "application/x-ndjson; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

const server = createServer(async (request, response) => {
  const host = (request.headers.host ?? "").split(":")[0].toLowerCase();
  const origin = request.headers.origin;
  if (!["127.0.0.1", "localhost"].includes(host)) {
    response.writeHead(403).end("Local connections only");
    return;
  }
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const originPort = originUrl.port || (originUrl.protocol === "http:" ? "80" : "443");
      if (originUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(originUrl.hostname) || originPort !== String(port)) {
        response.writeHead(403).end("Cross-origin requests are not allowed");
        return;
      }
    } catch {
      response.writeHead(403).end("Invalid origin");
      return;
    }
  }
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" }).end("Method not allowed");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", `http://${request.headers.host}`).pathname);
  } catch {
    response.writeHead(400).end("Invalid request path");
    return;
  }
  const relative = pathname === "/" ? "web/index.html" : pathname.replace(/^\/+/, "");
  const segments = relative.split("/");
  const extension = extname(relative);
  if (!["web", "src", "examples"].includes(segments[0]) || segments.some((segment) => segment.startsWith(".")) || segments.includes("..") || !Object.hasOwn(types, extension)) {
    response.writeHead(404).end("Not found");
    return;
  }
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`DecisionOps is ready at http://127.0.0.1:${port}`);
  console.log("Your files stay in this browser session. No upload or model call is made.");
});
