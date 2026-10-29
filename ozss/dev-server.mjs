// Minimalny serwer do podglądu lokalnego bez konta Netlify / netlify-cli.
// Serwuje statyczne pliki z tego katalogu i przekierowuje
// /.netlify/functions/<nazwa> do prawdziwych handlerów z netlify/functions/.
//
// Użycie:  node dev-server.mjs  (domyślnie port 8888)

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8888);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const nodeRequestToWebRequest = async (req, url) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
  });
};

const serveStatic = async (req, res, pathname) => {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  if (!path.extname(filePath)) filePath += ".html";

  const fullPath = path.join(__dirname, filePath);
  try {
    const data = await fs.readFile(fullPath);
    const ext = path.extname(fullPath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Nie znaleziono: " + pathname);
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/.netlify/functions/")) {
    const name = url.pathname.replace("/.netlify/functions/", "");
    try {
      const mod = await import(`./netlify/functions/${name}.mjs`);
      const webRequest = await nodeRequestToWebRequest(req, url);
      const response = await mod.default(webRequest);

      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      res.writeHead(response.status, headers);
      const buffer = Buffer.from(await response.arrayBuffer());
      res.end(buffer);
    } catch (error) {
      console.error(`Błąd funkcji ${name}:`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Błąd serwera deweloperskiego." }));
    }
    return;
  }

  await serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Kalendarz OZSS (podgląd lokalny): http://localhost:${PORT}`);
  console.log("Dane zapisywane lokalnie w ozss/.data (magazyn zastępczy dla Netlify Blobs).");
});
