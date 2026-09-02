/**
 * Puente seguro entre la interfaz (POS web o pantalla de configuración)
 * y la facturación local. La página nunca toca el disco ni la firma.
 */
const { contextBridge, ipcRenderer } = require("electron");

const llamar = async (canal, datos) => {
  const r = await ipcRenderer.invoke(canal, datos);
  if (!r || r.ok !== true) throw new Error((r && r.error) || "Error en la caja local");
  return r.data;
};

contextBridge.exposeInMainWorld("costeaCaja", {
  esCajaLocal: true,
  version: 1,
  versionApp: () => llamar("app:version"),

  leerConfig: () => llamar("config:leer"),
  guardarConfig: (datos) => llamar("config:guardar", datos),
  elegirFirma: () => llamar("config:elegirFirma"),
  activar: () => llamar("caja:activar"),
  verificarAutorizacion: () => llamar("caja:verificar"),
  abrirConfiguracion: () => llamar("caja:abrirConfig"),
  abrirPos: () => llamar("caja:abrirPos"),
  abrirPendientes: () => llamar("caja:abrirPendientes"),
  abrirOrdenes: () => llamar("caja:abrirOrdenes"),
  abrirCierre: () => llamar("caja:abrirCierre"),
  abrirCuadre: () => llamar("caja:abrirCuadre"),
  secuencia: () => llamar("caja:secuencia"),

  emitirFactura: (datos) => llamar("factura:emitir", datos),
  guardarOrden: (datos) => llamar("orden:guardar", datos),
  pendientesSri: () => llamar("sri:pendientes"),
  procesarPendientes: () => llamar("sri:procesar"),
  comprobantes: () => llamar("comprobantes:listar"),
  anularOrden: (id, motivo, clave) => llamar("orden:anular", { id, motivo, clave }),

  descargarCatalogo: () => llamar("catalogo:descargar"),
  leerCatalogo: () => llamar("catalogo:leer"),
  actualizacionesCatalogo: () => llamar("catalogo:actualizaciones"),
  subirAlServidor: () => llamar("servidor:subir"),

  imprimirSilencioso: (html) => llamar("impresion:silenciosa", html),
  imprimirTicket: (doc) => llamar("impresion:ticket", doc),

  clientes: () => llamar("clientes:listar"),
  buscarCliente: (identificacion) => llamar("clientes:buscar", identificacion),
  guardarCliente: (cliente) => llamar("clientes:guardar", cliente),
  sincronizarClientes: () => llamar("clientes:sincronizar"),
  verificarClaveAdmin: (clave) => llamar("admin:verificarClave", clave),

  resumenCierre: () => llamar("cierre:resumen"),
  confirmarCierre: (datos) => llamar("cierre:confirmar", datos),
  imprimirCierre: (cierre) => llamar("cierre:imprimir", { cierre, modo: "cierre" }),
  imprimirCuadre: (cuadre) => llamar("cierre:imprimir", { cierre: cuadre, modo: "cuadre" }),
  estadoTurno: () => llamar("turno:estado"),
  abrirTurno: (clave) => llamar("turno:abrir", { clave }),
  historialCierres: () => llamar("cierre:historial"),
});
