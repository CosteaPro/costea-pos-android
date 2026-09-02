/**
 * Almacenamiento local de la caja: configuración, secuencia de facturación,
 * comprobantes emitidos y catálogo descargado del servidor central.
 *
 * TODO vive en el disco de esta computadora (carpeta de datos del usuario).
 * La caja nunca depende del navegador ni del servidor para numerar o firmar.
 */
const fs = require("node:fs");
const path = require("node:path");

let RAIZ = path.join(process.cwd(), "datos-caja");

const CONFIG_POR_DEFECTO = {
  ruc: "",
  razonSocial: "",
  nombreComercial: "",
  dirMatriz: "",
  dirEstablecimiento: "",
  telefono: "",
  correo: "",
  establishment: "001",
  emissionPoint: "001",
  obligadoContabilidad: false,
  contribuyenteEspecial: "",
  ambiente: "2",
  tarifaIva: 15,
  regimen: "",
  // Ejemplares que salen por cada orden o factura.
  copiasTicket: 2,
  // Tipo de local: "rapida" (sin mesas) | "restaurante" (salón y mesas) | "patio".
  tipoLocal: "restaurante",
  firmaArchivo: "",
  firmaPassword: "",
  codigoAutorizacionSri: "",
  servidorUrl: "",
  codigoCaja: "",
  claveSincronizacion: "",
  nextSequential: 1,
  // Contador de órdenes de venta: es local y se reinicia a 1 cada día.
  ordenFecha: "",
  ordenSecuencial: 0,
  activada: false,
};

/** Fecha contable de Ecuador (UTC-5) en formato AAAA-MM-DD. */
const fechaEcuador = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(d);

function inicializar(rutaDatos) {
  RAIZ = rutaDatos;
  for (const carpeta of [RAIZ, path.join(RAIZ, "comprobantes"), path.join(RAIZ, "firma")]) {
    if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });
  }
}

const archivo = (nombre) => path.join(RAIZ, nombre);

function leerJson(nombre, porDefecto) {
  try {
    const ruta = archivo(nombre);
    if (!fs.existsSync(ruta)) return porDefecto;
    return JSON.parse(fs.readFileSync(ruta, "utf8"));
  } catch {
    return porDefecto;
  }
}

function escribirJson(nombre, valor) {
  const ruta = archivo(nombre);
  const temporal = `${ruta}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(valor, null, 2), "utf8");
  fs.renameSync(temporal, ruta);
  return valor;
}

/* ── Configuración ─────────────────────────────────────────────── */

const leerConfig = () => ({ ...CONFIG_POR_DEFECTO, ...leerJson("config.json", {}) });

function guardarConfig(parcial) {
  const actual = leerConfig();
  const nueva = { ...actual, ...parcial };
  nueva.nextSequential = Math.max(Math.floor(Number(nueva.nextSequential) || 1), 1);
  return escribirJson("config.json", nueva);
}

/** Config sin datos sensibles, apta para mostrar en pantalla. */
function configPublica() {
  const c = leerConfig();
  return { ...c, firmaPassword: c.firmaPassword ? "********" : "", claveSincronizacion: c.claveSincronizacion ? "********" : "" };
}

/** Copia el .p12/.pfx elegido a la carpeta de datos de la caja. */
function guardarFirma(rutaOrigen) {
  const destino = path.join(RAIZ, "firma", path.basename(rutaOrigen));
  fs.copyFileSync(rutaOrigen, destino);
  guardarConfig({ firmaArchivo: destino });
  return destino;
}

const leerFirmaBinaria = () => {
  const { firmaArchivo } = leerConfig();
  if (!firmaArchivo || !fs.existsSync(firmaArchivo))
    throw new Error("No se ha configurado el archivo de firma electrónica (.p12) en esta caja");
  return new Uint8Array(fs.readFileSync(firmaArchivo));
};

/* ── Secuencia de facturación (propiedad exclusiva de esta caja) ── */

/**
 * Devuelve el número que toca emitir y AVANZA de inmediato.
 * El número se consume al emitir, haya o no internet: nunca se repite ni se salta.
 */
function consumirSecuencial() {
  const config = leerConfig();
  const secuencial = Math.max(Math.floor(Number(config.nextSequential) || 1), 1);
  guardarConfig({ nextSequential: secuencial + 1 });
  return secuencial;
}

/**
 * Número de ORDEN DE VENTA de esta caja.
 * Se reinicia a 1 cada día (fecha de Ecuador). Nunca lo decide el servidor.
 */
function consumirSecuencialOrden() {
  const config = leerConfig();
  const hoy = fechaEcuador();
  const siguiente = config.ordenFecha === hoy ? Math.floor(Number(config.ordenSecuencial) || 0) + 1 : 1;
  guardarConfig({ ordenFecha: hoy, ordenSecuencial: siguiente });
  return siguiente;
}

/** Cómo van los contadores hoy, sin consumirlos. */
function estadoSecuencias() {
  const config = leerConfig();
  const hoy = fechaEcuador();
  return {
    nextSequential: Math.max(Math.floor(Number(config.nextSequential) || 1), 1),
    establishment: config.establishment,
    emissionPoint: config.emissionPoint,
    ordenFecha: hoy,
    proximaOrden: config.ordenFecha === hoy ? Math.floor(Number(config.ordenSecuencial) || 0) + 1 : 1,
  };
}

/* ── Comprobantes emitidos ─────────────────────────────────────── */

const listarComprobantes = () => leerJson("comprobantes.json", []);

function guardarComprobante(doc) {
  const todos = listarComprobantes();
  const i = todos.findIndex((d) => d.id === doc.id);
  if (i >= 0) todos[i] = { ...todos[i], ...doc };
  else todos.unshift(doc);
  escribirJson("comprobantes.json", todos.slice(0, 5000));
  if (doc.xmlFirmado && doc.claveAcceso) {
    fs.writeFileSync(path.join(RAIZ, "comprobantes", `${doc.claveAcceso}.xml`), doc.xmlFirmado, "utf8");
  }
  return doc;
}

const buscarComprobante = (id) => listarComprobantes().find((d) => d.id === id) ?? null;

/** Facturas firmadas que aún no tienen autorización del SRI. */
const pendientesSri = () =>
  listarComprobantes().filter((d) => d.tipo === "factura" && d.estadoSri !== "autorizado" && d.estadoSri !== "rechazado");

/** Documentos que aún no se han subido al servidor central. */
const pendientesSincronizar = () => listarComprobantes().filter((d) => !d.sincronizado);

/* ── Clientes compartidos con el servidor central ──────────────── */

const leerClientes = () => leerJson("clientes.json", []);

const clave = (identificacion) => String(identificacion || "").trim();

/** Guarda o actualiza un cliente en la copia local de esta caja. */
function guardarClienteLocal(cliente, opciones = {}) {
  const id = clave(cliente.id_number || cliente.identificacion);
  if (!id) return null;
  const fila = {
    id_type: cliente.id_type || cliente.tipoIdentificacion || (id.length === 13 ? "ruc" : "cedula"),
    id_number: id,
    name: cliente.name || cliente.razonSocial || "",
    address: cliente.address || cliente.direccion || null,
    email: cliente.email || null,
    phone: cliente.phone || cliente.telefono || null,
    tax_regime: cliente.tax_regime || cliente.regimen || null,
    updated_at: cliente.updated_at || new Date().toISOString(),
    pendiente: opciones.pendiente === true,
  };
  const todos = leerClientes();
  const i = todos.findIndex((c) => clave(c.id_number) === id);
  if (i >= 0) todos[i] = { ...todos[i], ...fila };
  else todos.unshift(fila);
  escribirJson("clientes.json", todos.slice(0, 20000));
  return fila;
}

/** Reemplaza la copia local con la lista del servidor, conservando lo pendiente. */
function guardarClientesDelServidor(lista) {
  const pendientes = leerClientes().filter((c) => c.pendiente);
  const mapa = new Map();
  for (const c of lista || []) mapa.set(clave(c.id_number), { ...c, pendiente: false });
  for (const c of pendientes) mapa.set(clave(c.id_number), c);
  const todos = [...mapa.values()];
  escribirJson("clientes.json", todos.slice(0, 20000));
  return todos;
}

const buscarCliente = (identificacion) =>
  leerClientes().find((c) => clave(c.id_number) === clave(identificacion)) ?? null;

const clientesPendientes = () => leerClientes().filter((c) => c.pendiente);

function marcarClientesSincronizados(identificaciones) {
  const ids = new Set((identificaciones || []).map(clave));
  const todos = leerClientes().map((c) => (ids.has(clave(c.id_number)) ? { ...c, pendiente: false } : c));
  escribirJson("clientes.json", todos);
  return todos;
}

/* ── Cierres de caja (definitivos, no editables) ───────────────── */

const listarCierres = () => leerJson("cierres.json", []);

function guardarCierre(cierre) {
  const todos = listarCierres();
  todos.unshift(cierre);
  escribirJson("cierres.json", todos.slice(0, 2000));
  return cierre;
}

/**
 * Anula una ORDEN de venta (nunca una factura autorizada).
 * La orden no se borra: queda marcada como ANULADA con motivo, usuario y fecha,
 * y vuelve a la cola de sincronización para que el central quede igual.
 */
function anularOrden(id, motivo, usuario) {
  const doc = buscarComprobante(id);
  if (!doc) throw new Error("No se encontró la orden indicada en esta caja");
  if (doc.tipo !== "orden") throw new Error("Solo se pueden anular órdenes de venta, no facturas");
  if (doc.anulado) throw new Error("Esta orden ya estaba anulada");
  if (String(motivo || "").trim().length < 5) throw new Error("Escriba el motivo de la anulación");
  const anulada = {
    ...doc,
    anulado: true,
    estadoSri: "anulado",
    motivoAnulacion: String(motivo).trim(),
    usuarioAnulacion: String(usuario || "administrador"),
    fechaAnulacion: new Date().toISOString(),
    sincronizado: false,
  };
  guardarComprobante(anulada);
  return anulada;
}

/** Reinicia el contador de órdenes: la próxima orden vuelve a ser 0001. */
function reiniciarOrdenes() {
  guardarConfig({ ordenFecha: "", ordenSecuencial: 0 });
  return true;
}

/* ── Catálogo descargado del servidor ──────────────────────────── */

/** Carpeta local de las fotos del menú (se descargan una sola vez). */
function rutaImagenes() {
  const dir = path.join(RAIZ, "imagenes");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const rutaImagen = (archivo) => path.join(rutaImagenes(), path.basename(String(archivo || "")));
const existeImagen = (archivo) => Boolean(archivo) && fs.existsSync(rutaImagen(archivo));
const guardarImagen = (archivo, datos) => {
  fs.writeFileSync(rutaImagen(archivo), datos);
  return archivo;
};

const leerCatalogo = () => leerJson("catalogo.json", null);
const guardarCatalogo = (catalogo) => escribirJson("catalogo.json", { ...catalogo, descargadoEn: new Date().toISOString() });

module.exports = {
  listarCierres,
  guardarCierre,
  reiniciarOrdenes,
  anularOrden,
  inicializar,

  leerConfig,
  guardarConfig,
  configPublica,
  guardarFirma,
  leerFirmaBinaria,
  consumirSecuencial,
  consumirSecuencialOrden,
  estadoSecuencias,
  fechaEcuador,
  listarComprobantes,
  guardarComprobante,
  buscarComprobante,
  pendientesSri,
  pendientesSincronizar,
  leerCatalogo,
  guardarCatalogo,
  rutaImagenes,
  rutaImagen,
  existeImagen,
  guardarImagen,
  leerClientes,
  guardarClienteLocal,
  guardarClientesDelServidor,
  buscarCliente,
  clientesPendientes,
  marcarClientesSincronizados,
  rutaDatos: () => RAIZ,
};
