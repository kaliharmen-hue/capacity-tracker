import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "dist");
const port = Number(process.env.PORT || 4322);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function resolvePath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://127.0.0.1:${port}`).pathname);
  const cleanPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, cleanPath);
  if (pathname.endsWith("/")) return join(filePath, "index.html");
  if (!extname(filePath)) return join(filePath, "index.html");
  return filePath;
}

createServer(async (request, response) => {
  try {
    const filePath = resolvePath(request.url || "/");
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1");
