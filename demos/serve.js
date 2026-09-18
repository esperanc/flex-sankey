/**
 * A minimal static server for the demo pages.
 *
 * The demos import the library's source modules directly, which browsers only
 * permit over HTTP, not from the filesystem. Written against `node:http` alone
 * so that running the demos pulls in no dependencies.
 *
 * Serves the whole package directory, so the root landing page, the demos and
 * the library source are all reachable exactly as they will be on GitHub
 * Pages.
 *
 * Usage: `npm run demos` then open the printed address.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Claudio Esperança and contributors
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const port = Number(process.env.PORT ?? 8080);

/** @type {Record<string, string>} */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";

    const target = normalize(join(root, path));
    // Refuse anything that escapes the package directory.
    if (!target.startsWith(root + sep) && target !== root) {
      res.writeHead(403).end("forbidden");
      return;
    }

    const info = await stat(target);
    const file = info.isDirectory() ? join(target, "index.html") : target;
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}).listen(port, () => {
  console.log(`flex-sankey demos: http://localhost:${port}/`);
});
