import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 4173;
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

http
  .createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const resolved = path.resolve(root, requested);
      if (!resolved.startsWith(root)) throw new Error("Invalid path");
      const body = await fs.readFile(resolved);
      response.writeHead(200, { "Content-Type": types[path.extname(resolved)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () => console.log(`Dawn Brief: http://127.0.0.1:${port}`));
