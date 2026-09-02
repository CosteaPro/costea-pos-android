/**
 * Impresión térmica desde el CELULAR.
 *
 * Un navegador no puede usar impresoras Bluetooth clásicas (SPP) ya emparejadas
 * en Android: el sistema no le entrega la lista de dispositivos ni le permite
 * enviar el PIN. Por eso existen tres caminos, en este orden:
 *
 *  1. RawBT (u otra app ESC/POS instalada): se le entrega el ticket ya
 *     convertido a texto ESC/POS. Es el camino que funciona siempre.
 *  2. Bluetooth directo (BLE): solo si la impresora expone servicio BLE.
 *  3. Compartir: el ticket se entrega al menú del celular para abrirlo con
 *     cualquier app de impresión.
 */

import { currency } from "@/lib/pos";
import { formatAccessKey } from "@/lib/sri";
import type { ReceiptData, ReceiptLine } from "@/lib/receipt";

export type MetodoMovil = "rawbt" | "ble" | "compartir";

const METODO_KEY = "costea.impresion-movil";
const NOMBRE_KEY = "costea.impresora-bluetooth";

/** Ancho útil del papel de 80 mm en caracteres (fuente normal). */
const ANCHO = 42;

/* ------------------------------------------------------------------ */
/* Preferencias                                                        */
/* ------------------------------------------------------------------ */

export function getMetodoMovil(): MetodoMovil | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(METODO_KEY);
  return v === "rawbt" || v === "ble" || v === "compartir" ? v : null;
}

export function setMetodoMovil(metodo: MetodoMovil | null) {
  if (typeof localStorage === "undefined") return;
  if (metodo) localStorage.setItem(METODO_KEY, metodo);
  else localStorage.removeItem(METODO_KEY);
}

export function getImpresoraBluetooth(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(NOMBRE_KEY) ?? "";
}

export function setImpresoraBluetooth(nombre: string) {
  if (typeof localStorage === "undefined") return;
  const limpio = nombre.trim();
  if (limpio) localStorage.setItem(NOMBRE_KEY, limpio);
  else localStorage.removeItem(NOMBRE_KEY);
}

/** Verdadero en celulares y tabletas. */
export function esMovil(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function soportaBluetooth(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/* ------------------------------------------------------------------ */
/* Ticket en texto plano (ESC/POS)                                     */
/* ------------------------------------------------------------------ */

/** Quita tildes y símbolos que la impresora térmica no imprime bien. */
function ascii(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "");
}

const centrar = (t: string) => {
  const s = t.slice(0, ANCHO);
  const espacios = Math.max(0, Math.floor((ANCHO - s.length) / 2));
  return " ".repeat(espacios) + s;
};

const separador = "-".repeat(ANCHO);

/** Etiqueta a la izquierda, valor a la derecha, en el mismo renglón. */
function parLinea(label: string, valor: string) {
  const espacio = Math.max(1, ANCHO - label.length - valor.length);
  return label.slice(0, ANCHO - valor.length - 1) + " ".repeat(espacio) + valor;
}

/** Parte un texto largo en renglones del ancho del papel. */
function envolver(texto: string, ancho = ANCHO, sangria = ""): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const candidato = actual ? `${actual} ${p}` : p;
    if (candidato.length > ancho) {
      if (actual) out.push(actual);
      actual = p.length > ancho ? p.slice(0, ancho) : p;
    } else actual = candidato;
  }
  if (actual) out.push(actual);
  return out.map((l, i) => (i === 0 ? l : sangria + l));
}

function lineasItem(l: ReceiptLine): string[] {
  const importe = currency(l.unit_price * l.qty);
  const nombre = `${l.qty} x ${l.name}`;
  const out = envolver(nombre, ANCHO - importe.length - 1, "  ");
  const primera = out.shift() ?? "";
  const filas = [parLinea(primera, importe), ...out];
  for (const o of l.options ?? []) {
    const cant = l.qty * (o.qty || 1);
    const esAgregador = o.kind === "agregador" && Number(o.price) > 0;
    if (esAgregador) filas.push(parLinea(`  + ${cant} ${o.name}`, currency(o.price * cant)));
    else filas.push(`  - ${o.name}${(o.qty || 1) > 1 ? ` (${o.qty})` : ""}`);
  }
  if (l.notes) filas.push(...envolver(`  Nota: ${l.notes}`, ANCHO, "  "));
  return filas;
}

/** Convierte el ticket a texto plano listo para una impresora térmica. */
export function ticketTexto(t: ReceiptData): string {
  const esSri = t.docType !== "nota_venta";
  const titulo =
    t.docType === "factura"
      ? "FACTURA"
      : t.docType === "nota_debito"
        ? "NOTA DE DEBITO"
        : t.docType === "nota_credito"
          ? "NOTA DE CREDITO"
          : "ORDEN";

  const l: string[] = [];
  l.push(centrar(t.negocio));
  if (t.ruc) l.push(centrar(`RUC: ${t.ruc}`));
  if (t.direccion) l.push(...envolver(t.direccion).map(centrar));
  if (t.sucursal) l.push(centrar(`Establecimiento: ${t.sucursal}`));
  if (t.telefono) l.push(centrar(`Tel: ${t.telefono}`));
  if (t.correo) l.push(centrar(t.correo));
  if (t.regimen) l.push(...envolver(t.regimen).map(centrar));
  l.push(centrar(`Obligado a llevar contabilidad: ${t.obligadoContabilidad ? "SI" : "NO"}`));
  l.push(separador);
  l.push(centrar(titulo));
  l.push(centrar(`Nro. ${t.numero}`));
  if (esSri) {
    if (t.ambiente) l.push(centrar(`Ambiente: ${t.ambiente === "1" ? "PRUEBAS" : "PRODUCCION"}`));
    l.push(centrar(`Emision: ${t.tipoEmision === "2" ? "CONTINGENCIA" : "NORMAL"}`));
    if (t.autorizacion) {
      l.push(centrar("Autorizacion SRI:"));
      l.push(...envolver(t.autorizacion).map(centrar));
    }
    if (t.claveAcceso) {
      l.push(centrar("Clave de acceso:"));
      l.push(...envolver(formatAccessKey(t.claveAcceso)).map(centrar));
    }
  } else {
    l.push(...envolver("Documento de control interno - no valido como comprobante de venta autorizado por el SRI").map(centrar));
  }
  if (t.anulado) {
    l.push(centrar("*** ANULADO ***"));
    if (t.motivoAnulacion) l.push(...envolver(`Motivo: ${t.motivoAnulacion}`));
  }
  l.push(separador);
  l.push(`Fecha: ${t.fecha}`);
  if (t.mesa) l.push(`Mesa: ${t.mesa}`);
  if (t.atendio) l.push(`Atendio: ${t.atendio}`);
  if (t.cliente) l.push(...envolver(`Cliente: ${t.cliente}`));
  l.push(`Identificacion: ${t.clienteId || "0000000000000"}`);
  if (t.clienteDireccion) l.push(...envolver(`Direccion: ${t.clienteDireccion}`));
  if (t.clienteCorreo) l.push(...envolver(`Correo: ${t.clienteCorreo}`));
  l.push(separador);
  for (const linea of t.lines) l.push(...lineasItem(linea));
  l.push(separador);
  l.push(parLinea("Subtotal sin IVA", currency(t.subtotal)));
  l.push(parLinea(`IVA ${t.ivaRate}%`, currency(t.iva)));
  l.push(parLinea("TOTAL", currency(t.total)));
  l.push(parLinea("Forma de pago", t.formaPago));
  if (typeof t.recibido === "number") l.push(parLinea("Recibido", currency(t.recibido)));
  if (typeof t.cambio === "number") l.push(parLinea("Cambio", currency(t.cambio)));
  if (t.totalEnLetras) l.push(...envolver(`Son: ${t.totalEnLetras}`));
  l.push(separador);
  l.push(centrar("Gracias por su compra."));
  if (esSri) {
    l.push(...envolver("Verifique la validez y descargue su comprobante en el portal oficial: www.sri.gob.ec").map(centrar));
  } else {
    l.push(centrar("CONSUMIDOR FINAL"));
    l.push(centrar("0999999999"));
  }
  l.push(centrar("RUC: 1716626484001"));
  l.push(centrar("www.costeapro.com"));
  l.push("");
  l.push("");
  l.push("");

  return ascii(l.join("\n"));
}

/** Ticket con comandos ESC/POS (inicializar, cortar). */
export function ticketEscPos(t: ReceiptData): Uint8Array {
  const cuerpo = `${ticketTexto(t)}\n`;
  const bytes: number[] = [0x1b, 0x40]; // ESC @ : inicializar
  for (const ch of cuerpo) bytes.push(ch.charCodeAt(0) & 0xff);
  bytes.push(0x1d, 0x56, 0x42, 0x00); // GS V B 0 : corte parcial
  return new Uint8Array(bytes);
}

/* ------------------------------------------------------------------ */
/* 1) Apps ESC/POS instaladas (RawBT y compatibles)                    */
/* ------------------------------------------------------------------ */

/**
 * Entrega el ticket a la app de impresión del celular. No podemos saber si la
 * app existe, así que devolvemos false cuando el celular no acepta el enlace.
 */
export function imprimirConApp(texto: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const payload = encodeURIComponent(texto);
    // RawBT acepta el esquema rawbt: con el texto ya formateado.
    window.location.href = `rawbt:${payload}`;
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 2) Bluetooth directo (BLE)                                          */
/* ------------------------------------------------------------------ */

/** Servicios BLE habituales en impresoras térmicas ESC/POS. */
const SERVICIOS_BLE = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
];

type BleDevice = {
  name?: string | null;
  gatt?: {
    connected: boolean;
    connect: () => Promise<{ getPrimaryServices: () => Promise<BleService[]> }>;
    disconnect: () => void;
  };
};
type BleService = { getCharacteristics: () => Promise<BleChar[]> };
type BleChar = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue: (v: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (v: BufferSource) => Promise<void>;
};

let dispositivoBle: BleDevice | null = null;

/** Abre el selector del navegador para elegir la impresora BLE. */
export async function buscarImpresoraBle(): Promise<string> {
  if (!soportaBluetooth()) {
    throw new Error(
      "Este navegador no permite Bluetooth. Use Chrome en Android o el envío a la app de impresión.",
    );
  }
  const bt = (navigator as unknown as { bluetooth: { requestDevice: (o: unknown) => Promise<BleDevice> } })
    .bluetooth;
  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: SERVICIOS_BLE,
  });
  dispositivoBle = device;
  const nombre = device.name ?? "";
  if (nombre) setImpresoraBluetooth(nombre);
  return nombre;
}

/** Envía bytes ESC/POS por Bluetooth BLE, en bloques pequeños. */
export async function imprimirPorBle(datos: Uint8Array): Promise<void> {
  if (!dispositivoBle) await buscarImpresoraBle();
  const device = dispositivoBle;
  if (!device?.gatt) throw new Error("No se pudo abrir la conexión con la impresora.");

  const server = await device.gatt.connect();
  const servicios = await server.getPrimaryServices();
  let destino: BleChar | null = null;
  for (const s of servicios) {
    for (const c of await s.getCharacteristics()) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        destino = c;
        break;
      }
    }
    if (destino) break;
  }
  if (!destino) {
    throw new Error(
      "La impresora respondió, pero no acepta impresión por Bluetooth de navegador (es Bluetooth clásico). Use el envío a la app de impresión.",
    );
  }

  const TAM = 180;
  for (let i = 0; i < datos.length; i += TAM) {
    const bloque = datos.slice(i, i + TAM);
    if (destino.properties.writeWithoutResponse && destino.writeValueWithoutResponse) {
      await destino.writeValueWithoutResponse(bloque);
    } else {
      await destino.writeValue(bloque);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

/* ------------------------------------------------------------------ */
/* 3) Compartir con cualquier app                                      */
/* ------------------------------------------------------------------ */

export async function compartirTicket(texto: string, nombre = "ticket.txt"): Promise<boolean> {
  const archivo = new File([texto], nombre, { type: "text/plain" });
  const nav = navigator as unknown as {
    canShare?: (d: unknown) => boolean;
    share?: (d: unknown) => Promise<void>;
  };
  try {
    if (nav.share && nav.canShare?.({ files: [archivo] })) {
      await nav.share({ files: [archivo], title: "Ticket" });
      return true;
    }
    if (nav.share) {
      await nav.share({ title: "Ticket", text: texto });
      return true;
    }
  } catch {
    return false;
  }
  // Respaldo: descarga del archivo para abrirlo con la app de impresión.
  const url = URL.createObjectURL(archivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

/* ------------------------------------------------------------------ */
/* Envío según el método preferido                                     */
/* ------------------------------------------------------------------ */

/**
 * Imprime el ticket con el método guardado por el usuario.
 * Devuelve false si no hay método móvil configurado (se usa la impresión normal).
 */
export async function imprimirEnMovil(t: ReceiptData): Promise<boolean> {
  const metodo = getMetodoMovil();
  if (!metodo || !esMovil()) return false;
  const texto = ticketTexto(t);
  try {
    if (metodo === "ble") {
      await imprimirPorBle(ticketEscPos(t));
      return true;
    }
    if (metodo === "compartir") return await compartirTicket(texto, `ticket-${t.numero}.txt`);
    return imprimirConApp(texto);
  } catch {
    return false;
  }
}

/** Ticket corto de prueba, para verificar la conexión. */
export function ticketPruebaTexto(negocio: string): string {
  return ascii(
    [
      centrar(negocio || "Costea POS"),
      centrar("PRUEBA DE IMPRESION"),
      separador,
      parLinea("1 x Cafe", "$1.50"),
      parLinea("TOTAL", "$1.50"),
      separador,
      centrar("Si lee este texto, la impresora"),
      centrar("esta lista para trabajar."),
      centrar("www.costeapro.com"),
      "",
      "",
      "",
    ].join("\n"),
  );
}

export function ticketPruebaEscPos(negocio: string): Uint8Array {
  const cuerpo = `${ticketPruebaTexto(negocio)}\n`;
  const bytes: number[] = [0x1b, 0x40];
  for (const ch of cuerpo) bytes.push(ch.charCodeAt(0) & 0xff);
  bytes.push(0x1d, 0x56, 0x42, 0x00);
  return new Uint8Array(bytes);
}
