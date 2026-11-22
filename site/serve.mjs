#!/usr/bin/env node
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "public");
const port = Number(process.env.PORT ?? 4174);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".js": "text/javascript; charset=utf-8",
};

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const rel = normalize(url).replace(/^(\.\.[\\/])+/, "");
  let file = join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": mime[extname(file).toLowerCase()] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`site: http://localhost:${port}/`);
});