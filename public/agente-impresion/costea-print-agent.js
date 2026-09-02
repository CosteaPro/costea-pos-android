/**
 * Agente de impresión directa de Costea POS (Windows)
 * -------------------------------------------------
 * Escucha en http://localhost:9110/print y envía el ticket a la impresora
 * POS-80 SIN vista previa y SIN el cuadro de impresión de Windows.
 *
 * Requisitos:
 *   1) Instalar Node.js (https://nodejs.org)
 *   2) Compartir la impresora térmica en Windows:
 *      Panel de control > Dispositivos e impresoras > clic derecho en la
 *      impresora > Propiedades de impresora > pestaña "Compartir" >
 *      "Compartir esta impresora" y anotar el Nombre del recurso compartido.
 *      Ese nombre es el que se escribe en Costea POS (Configuración >
 *      Áreas de impresión: Cocina, Parrilla, Punto de Venta).
 *   3) Ejecutar:  node costea-print-agent.js
 *      (o doble clic en iniciar-agente.bat)
 *   4) En Costea POS > Configuración > Áreas de impresión, guardar el puente:
 *      http://localhost:9110/print
 *
 * El agente convierte el ticket HTML a texto plano de 42 columnas y lo envía
 * en crudo a la impresora, con corte automático de papel (ESC/POS).
 */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const PORT = Number(process.env.COSTEA_PRINT_PORT || 9110);
/** Impresora usada cuando el POS no envía un nombre. */
const DEFAULT_PRINTER = process.env.COSTEA_PRINTER || "POS80";
const WIDTH = Number(process.env.COSTEA_WIDTH || 42);

const ESC = "\x1b";
const GS = "\x1d";
const CUT = "\n\n\n\n" + GS + "V\x00";
const INIT = ESC + "@";

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Convierte el HTML del ticket a texto plano respetando filas de tabla. */
function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<head[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<hr\s*\/?>/gi, "\n" + "-".repeat(WIDTH) + "\n");
  s = s.replace(/<\/(p|h1|h2|h3|div|tr|section)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<td[^>]*class="[^"]*\br\b[^"]*"[^>]*>/gi, "\t");
  s = s.replace(/<td[^>]*>/gi, " ");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);

  const lines = s
    .split("\n")
    .map((l) => l.replace(/[ \u00a0]+/g, " ").trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0));

  return lines
    .map((line) => {
      if (!line.includes("\t")) return wrap(line);
      const parts = line.split("\t").map((p) => p.trim());
      const right = parts.pop();
      const left = parts.join(" ");
      const pad = Math.max(1, WIDTH - left.length - right.length);
      return left.length + right.length + 1 > WIDTH
        ? wrap(left) + "\n" + right.padStart(WIDTH)
        : left + " ".repeat(pad) + right;
    })
    .join("\n");
}

function wrap(line) {
  if (line.length <= WIDTH) return line;
  const words = line.split(" ");
  const out = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > WIDTH) {
      out.push(cur.trim());
      cur = w;
    } else cur += " " + w;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.join("\n");
}

/** Envía el texto en crudo a la impresora compartida de Windows. */
function sendToPrinter(text, printer) {
  return new Promise((resolve) => {
    const share = (printer || DEFAULT_PRINTER).trim();
    const file = path.join(os.tmpdir(), `costea-${Date.now()}.prn`);
    fs.writeFileSync(file, INIT + text + CUT, "latin1");

    const target = share.startsWith("\\\\") ? share : `\\\\localhost\\${share}`;
    execFile("cmd", ["/c", "copy", "/b", `"${file}"`, `"${target}"`], { windowsHide: true }, (err) => {
      fs.unlink(file, () => {});
      if (!err) return resolve({ ok: true, via: "raw", printer: target });
      resolve({ ok: false, error: String(err.message || err) });
    });
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, agent: "costea-print-agent", port: PORT }));
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}");
      const text = htmlToText(data.html);
      const result = await sendToPrinter(text, data.printer);
      console.log(new Date().toLocaleTimeString(), data.job || "ticket", "->", result);
      res.writeHead(result.ok ? 200 : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Agente de impresión Costea POS activo en http://localhost:${PORT}/print`);
  console.log(`Impresora por defecto: ${DEFAULT_PRINTER}`);
});
