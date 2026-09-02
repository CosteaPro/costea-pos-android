/** Impresión Bluetooth clásica (SPP) desde la app nativa de Android. */
import { Capacitor } from "@capacitor/core";
import { BluetoothSerial } from "@e-is/capacitor-bluetooth-serial";
import type { BluetoothDevice } from "@e-is/capacitor-bluetooth-serial";

export type ImpresoraNativa = { name: string; address: string };
export type EventoImpresion = { hora: string; detalle: string; ok: boolean };

const PREF_KEY = "costea.impresora-nativa";
const LOG_KEY = "costea.impresora-nativa.log";
const MAX_EVENTOS = 15;

/** Verdadero solo cuando el POS corre dentro de la app instalada. */
export function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}

/** La app está instalada y trae el puente Bluetooth clásico listo. */
export function soportaBluetoothNativo(): boolean {
  return esAppNativa() && Capacitor.isPluginAvailable("BluetoothSerial");
}

/** Traduce los errores técnicos del puente Bluetooth a lenguaje claro. */
export function mensajeError(e: unknown): string {
  const bruto = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const texto = bruto.toLowerCase();
  if (!texto) return "No se pudo comunicar con la impresora.";
  if (texto.includes("permission") || texto.includes("denied")) {
    return "Android no dio permiso de Bluetooth. Ajustes → Aplicaciones → Costea POS → Permisos → activa Dispositivos cercanos.";
  }
  if (texto.includes("not enabled") || texto.includes("disabled") || texto.includes("turn on")) {
    return "El Bluetooth del celular está apagado. Enciéndelo y vuelve a intentar.";
  }
  if (texto.includes("read failed") || texto.includes("socket") || texto.includes("closed")) {
    return "La impresora cortó la conexión. Verifica que esté encendida, con papel y cerca del celular.";
  }
  if (texto.includes("timeout") || texto.includes("unable to connect") || texto.includes("connect")) {
    return "No se pudo conectar: la impresora está apagada o fuera de alcance.";
  }
  if (texto.includes("not found") || texto.includes("unknown device")) {
    return "No se encontró la impresora. Empárejala en Ajustes → Bluetooth con PIN 0000.";
  }
  return bruto;
}

export function getImpresoraNativa(): ImpresoraNativa | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ImpresoraNativa>;
    return value.address ? { name: value.name || value.address, address: value.address } : null;
  } catch {
    return null;
  }
}

export function setImpresoraNativa(dispositivo: ImpresoraNativa | null) {
  if (typeof localStorage === "undefined") return;
  if (dispositivo) localStorage.setItem(PREF_KEY, JSON.stringify(dispositivo));
  else localStorage.removeItem(PREF_KEY);
}

/** Bitácora corta de intentos de impresión, para diagnosticar sin cable. */
export function getEventos(): EventoImpresion[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as EventoImpresion[]) : [];
  } catch {
    return [];
  }
}

export function registrarEvento(detalle: string, ok: boolean) {
  if (typeof localStorage === "undefined") return;
  const hora = new Date().toLocaleTimeString("es-EC", { hour12: false });
  const eventos = [{ hora, detalle, ok }, ...getEventos()].slice(0, MAX_EVENTOS);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(eventos));
  } catch {
    /* almacenamiento lleno: la bitácora no es crítica */
  }
}

export function limpiarEventos() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LOG_KEY);
}

/** Estado del Bluetooth del celular: encendido y permisos aceptados. */
export async function estadoBluetooth(): Promise<{ disponible: boolean; encendido: boolean; detalle: string }> {
  if (!soportaBluetoothNativo()) {
    return { disponible: false, encendido: false, detalle: "Disponible solo en la app instalada en el celular." };
  }
  try {
    const { enabled } = await BluetoothSerial.isEnabled();
    return {
      disponible: true,
      encendido: enabled,
      detalle: enabled ? "Bluetooth encendido y con permisos." : "Bluetooth apagado.",
    };
  } catch (e) {
    return { disponible: true, encendido: false, detalle: mensajeError(e) };
  }
}

/** Pide permisos de Bluetooth y enciende la radio si hace falta. */
export async function pedirPermisos(): Promise<boolean> {
  if (!soportaBluetoothNativo()) throw new Error("Disponible solo en la app instalada en el celular.");
  try {
    const { enabled } = await BluetoothSerial.isEnabled();
    if (!enabled) await BluetoothSerial.enable();
    registrarEvento("Permisos de Bluetooth concedidos", true);
    return true;
  } catch (e) {
    registrarEvento(`Permisos: ${mensajeError(e)}`, false);
    throw new Error(mensajeError(e));
  }
}

/** Busca impresoras Bluetooth cercanas desde Android (incluye las ya emparejadas visibles). */
export async function listarEmparejadas(): Promise<ImpresoraNativa[]> {
  if (!soportaBluetoothNativo()) {
    throw new Error("Esta búsqueda solo está disponible en la app instalada en el celular.");
  }
  try {
    const estado = await BluetoothSerial.isEnabled();
    if (!estado.enabled) await BluetoothSerial.enable();
    const resultado = await BluetoothSerial.scan();
    const dispositivos = resultado.devices
      .filter((device) => Boolean(device.address))
      .map((device) => ({ name: device.name || device.address, address: device.address }));
    registrarEvento(`Búsqueda: ${dispositivos.length} dispositivo(s)`, true);
    return dispositivos;
  } catch (e) {
    registrarEvento(`Búsqueda fallida: ${mensajeError(e)}`, false);
    throw new Error(mensajeError(e));
  }
}

async function conectarConReintento(address: string, intentos = 3): Promise<void> {
  let ultimo: unknown = null;
  for (let i = 0; i < intentos; i++) {
    try {
      await BluetoothSerial.connectInsecure({ address });
      return;
    } catch (e) {
      ultimo = e;
      await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
    }
  }
  throw new Error(mensajeError(ultimo));
}

/** Conecta con una impresora Bluetooth clásica y la deja como predeterminada. */
export async function conectarImpresora(dispositivo: ImpresoraNativa): Promise<void> {
  if (!soportaBluetoothNativo()) {
    throw new Error("Esta función solo está disponible en la app instalada en el celular.");
  }
  try {
    await conectarConReintento(dispositivo.address);
    setImpresoraNativa(dispositivo);
    registrarEvento(`Conectada ${dispositivo.name}`, true);
  } catch (e) {
    registrarEvento(`Conexión ${dispositivo.name}: ${mensajeError(e)}`, false);
    throw new Error(mensajeError(e));
  }
}

async function asegurarConexion(): Promise<ImpresoraNativa> {
  if (!soportaBluetoothNativo()) {
    throw new Error("Esta función solo está disponible en la app instalada en el celular.");
  }
  const guardada = getImpresoraNativa();
  if (!guardada) {
    throw new Error("Todavía no eliges la impresora. Ve a Configuración → Impresión en celular.");
  }
  const estado = await BluetoothSerial.isConnected({ address: guardada.address }).catch(() => ({ connected: false }));
  if (!estado.connected) await conectarConReintento(guardada.address);
  return guardada;
}

/** Avance de papel y corte, compatible con impresoras de 58 y 80 mm. */
function conCorte(datos: Uint8Array): Uint8Array {
  const cola = [0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00];
  const yaCorta =
    datos.length >= 4 &&
    datos[datos.length - 4] === 0x1d &&
    datos[datos.length - 3] === 0x56;
  if (yaCorta) return datos;
  const salida = new Uint8Array(datos.length + cola.length);
  salida.set(datos, 0);
  salida.set(cola, datos.length);
  return salida;
}

/** Envía bytes ESC/POS por Bluetooth clásico, en bloques pequeños. */
export async function imprimirNativo(datos: Uint8Array): Promise<void> {
  const inicio = Date.now();
  try {
    const dispositivo = await asegurarConexion();
    const payload = conCorte(datos);
    const TAM = 512;
    for (let i = 0; i < payload.length; i += TAM) {
      const bloque = payload.slice(i, i + TAM);
      let valor = "";
      for (const byte of bloque) valor += String.fromCharCode(byte);
      await BluetoothSerial.write({ address: dispositivo.address, value: valor });
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    registrarEvento(`Impresión enviada (${payload.length} bytes, ${Date.now() - inicio} ms)`, true);
  } catch (e) {
    registrarEvento(`Impresión fallida: ${mensajeError(e)}`, false);
    throw new Error(mensajeError(e));
  }
}

/** Reconexión silenciosa al abrir la app. Nunca lanza error. */
export async function reconectarImpresora(): Promise<boolean> {
  const guardada = getImpresoraNativa();
  if (!soportaBluetoothNativo() || !guardada) return false;
  try {
    const estado = await BluetoothSerial.isConnected({ address: guardada.address }).catch(() => ({ connected: false }));
    if (estado.connected) return true;
    await conectarConReintento(guardada.address, 2);
    return true;
  } catch {
    return false;
  }
}

export function dispositivoNativo(device: BluetoothDevice): ImpresoraNativa {
  return { name: device.name || device.address, address: device.address };
}
