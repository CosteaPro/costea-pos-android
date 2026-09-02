/**
 * Impresión directa a la impresora POS-80, sin diálogo del navegador.
 *
 * 1) Puente de impresión local (recomendado): si el equipo tiene instalado un
 *    agente de impresión que escucha en la red local (por ejemplo
 *    http://localhost:9110/print), el ticket se envía por HTTP y sale de
 *    inmediato por la impresora indicada. No aparece vista previa ni el cuadro
 *    de impresión de Windows.
 * 2) Respaldo: iframe oculto + window.print(). Con Chrome/Edge abiertos con
 *    --kiosk-printing tampoco muestra el cuadro de Windows.
 */

import { puenteCaja } from "@/lib/caja-local";

const BRIDGE_KEY = "costea.print_bridge_url";

/** Direcciones donde suele escuchar el agente local de impresión. */
export const BRIDGE_CANDIDATES = [
  "http://localhost:9110/print",
  "http://127.0.0.1:9110/print",
];

export function getPrintBridgeUrl(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(BRIDGE_KEY) ?? "";
}

export function setPrintBridgeUrl(url: string) {
  if (typeof localStorage === "undefined") return;
  const clean = url.trim();
  if (clean) localStorage.setItem(BRIDGE_KEY, clean);
  else localStorage.removeItem(BRIDGE_KEY);
}

/** Busca el agente local en las direcciones habituales y lo guarda si responde. */
export async function detectPrintBridge(): Promise<string | null> {
  for (const url of BRIDGE_CANDIDATES) {
    try {
      const res = await fetch(url, { method: "GET", mode: "cors" });
      if (res.ok) {
        setPrintBridgeUrl(url);
        return url;
      }
    } catch {
      /* seguimos probando */
    }
  }
  return null;
}

/** Envía el documento al agente local. Devuelve true si el agente lo aceptó. */
async function sendToBridge(html: string, jobName: string, printer?: string) {
  const url = getPrintBridgeUrl();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, job: jobName, printer: printer || undefined, width: "80mm", copies: 1 }),
      mode: "cors",
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}


function printWithIframe(html: string, jobName: string) {
  if (typeof document === "undefined") return false;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = jobName;
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";
  document.body.appendChild(frame);

  const cleanup = () => {
    setTimeout(() => frame.remove(), 1500);
  };

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const run = () => {
    try {
      const win = frame.contentWindow;
      if (!win) return;
      win.focus();
      win.print();
    } catch {
      /* la impresión la maneja el propio documento */
    } finally {
      cleanup();
    }
  };

  if (doc.readyState === "complete") setTimeout(run, 60);
  else frame.onload = () => setTimeout(run, 60);

  return true;
}

/**
 * Imprime sin intervención del usuario: primero intenta el puente local
 * (impresión 100% directa a la impresora indicada), y si no hay puente
 * guardado lo busca automáticamente en localhost antes de recurrir al
 * iframe oculto.
 */
export function silentPrint(html: string, jobName = "Costea POS", printer?: string) {
  if (typeof document === "undefined") return false;

  void (async () => {
    // Caja descargable: imprime por la impresora configurada en esa computadora.
    const puente = puenteCaja();
    if (puente) {
      try {
        await puente.imprimirSilencioso(html);
        return;
      } catch {
        /* si falla la impresora local seguimos con los respaldos */
      }
    }
    if (!getPrintBridgeUrl()) await detectPrintBridge();
    if (getPrintBridgeUrl()) {
      const ok = await sendToBridge(html, jobName, printer);
      if (ok) return;
    }
    printWithIframe(html, jobName);
  })();

  return true;
}

