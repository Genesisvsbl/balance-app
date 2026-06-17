import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestPost as login } from "../functions/api/auth-login.js";
import { onRequestDelete as deleteRun } from "../functions/api/balance-run.js";
import {
  onRequestDelete as deleteRuns,
  onRequestGet as getRuns,
  onRequestPost as createRun,
} from "../functions/api/balance-runs.js";

const root = fileURLToPath(new URL("../out", import.meta.url));
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function methodNotAllowed() {
  return new Response(JSON.stringify({ error: "Method not allowed." }), {
    status: 405,
    headers: {
      "content-type": "application/json",
    },
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function toWebRequest(req) {
  const url = `https://${req.headers.host || "localhost"}${req.url || "/"}`;
  const method = req.method || "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);

  return new Request(url, {
    method,
    headers: req.headers,
    body,
  });
}

async function sendWebResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

  if (response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
    return;
  }

  res.end();
}

async function handleApi(req, res) {
  const request = await toWebRequest(req);
  const url = new URL(request.url);
  const context = { request, env: process.env };

  if (url.pathname === "/api/auth-login") {
    return sendWebResponse(res, request.method === "POST" ? await login(context) : methodNotAllowed());
  }

  if (url.pathname === "/api/balance-runs") {
    if (request.method === "GET") return sendWebResponse(res, await getRuns(context));
    if (request.method === "POST") return sendWebResponse(res, await createRun(context));
    if (request.method === "DELETE") return sendWebResponse(res, await deleteRuns(context));
    return sendWebResponse(res, methodNotAllowed());
  }

  if (url.pathname === "/api/balance-run") {
    return sendWebResponse(
      res,
      request.method === "DELETE" ? await deleteRun(context) : methodNotAllowed()
    );
  }

  return false;
}

async function resolveStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const safePath = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const requestedPath = join(root, safePath === "/" ? "index.html" : safePath);

  try {
    const fileStat = await stat(requestedPath);
    if (fileStat.isFile()) return requestedPath;
    if (fileStat.isDirectory()) {
      const indexPath = join(requestedPath, "index.html");
      const indexStat = await stat(indexPath);
      if (indexStat.isFile()) return indexPath;
    }
  } catch {
    return join(root, "index.html");
  }

  return join(root, "index.html");
}

async function handleStatic(req, res) {
  const filePath = await resolveStaticPath(req.url || "/");
  const contentType = contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream";

  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": filePath.includes("_next") ? "public, max-age=31536000, immutable" : "no-cache",
  });

  createReadStream(filePath).pipe(res);
}

createServer(async (req, res) => {
  try {
    if ((req.url || "").startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }

    await handleStatic(req, res);
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: error.message || "Unexpected error." }));
  }
}).listen(port, () => {
  console.log(`BALANCE server listening on ${port}`);
});
