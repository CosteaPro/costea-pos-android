/**
 * Costea POS Caja — proceso principal.
 * Abre el POS ya probado (mismo diseño y flujo) dentro de un programa de
 * escritorio, pero con la facturación electrónica corriendo LOCALMENTE:
 * datos del SRI, firma .p12 y numeración viven en esta computadora.
 */
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol, net } = require("electron");

// Las fotos del menú se leen del disco de esta computadora, no del servidor.
protocol.registerSchemesAsPrivileged([
  { scheme: "costea-img", privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
]);
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const almacen = require("./lib/almacen.cjs");
const facturacion = require("./lib/facturacion.cjs");
const sincronizacion = require("./lib/sincronizacion.cjs");
const cierreCaja = require("./lib/cierre.cjs");
const { ticketHtml, cierreHtml, ordenAnuladaHtml } = require("./lib/ticket.cjs");

let ventana = null;
let temporizador = null;
let carga = null;
let servidorInterfaz = null;
let urlInterfaz = null;
let rutaLog = null;

function registrar(tipo, detalle) {
  try {
    if (!rutaLog) rutaLog = path.join(app.getPath("userData"), "costea-caja.log");
    const texto = detalle instanceof Error ? detalle.stack || detalle.message : String(detalle);
    fs.appendFileSync(rutaLog, `[${new Date().toISOString()}] ${tipo}: ${texto}\n`, "utf8");
  } catch {
    /* el diagnóstico nunca debe impedir que abra la caja */
  }
}

const rutaConfig = () => path.join(__dirname, "config.html");
const rutaPendientes = () => path.join(__dirname, "pendientes.html");
const rutaSinConexion = () => path.join(__dirname, "sin-conexion.html");
const rutaCierre = () => path.join(__dirname, "cierre.html");
const rutaCuadre = () => path.join(__dirname, "cuadre.html");
const rutaOrdenes = () => path.join(__dirname, "ordenes.html");
const rutaAcerca = () => path.join(__dirname, "acerca.html");
/** Ícono propio de Costea POS: barra de título, acceso directo y "Acerca de". */
const rutaIcono = () => path.join(__dirname, "build", "icon.png");

/** Pantalla de carga con el ícono mientras arranca la caja. */
function mostrarCarga() {
  carga = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    center: true,
    show: true,
    backgroundColor: "#1b1a19",
    icon: rutaIcono(),
  });
  carga.loadFile(path.join(__dirname, "carga.html"));
}

function cerrarCarga() {
  if (carga && !carga.isDestroyed()) carga.destroy();
  carga = null;
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#1b1a19",
    title: "Costea POS Caja",
    icon: rutaIcono(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const config = almacen.leerConfig();
  // La caja SIEMPRE abre en Punto de venta: la configuración tiene datos
  // sensibles del contribuyente y solo se entra desde el menú, con clave.
  abrirPos();
  if (!config.activada) {
    dialog
      .showMessageBox(ventana, {
        type: "info",
        title: "Costea POS Caja",
        message: "Esta caja todavía no está activada.",
        detail:
          "Puede usar el punto de venta, pero para facturar al SRI debe completar la configuración (menú Caja › Configuración de la caja).",
        buttons: ["Seguir en el punto de venta", "Ir a Configuración"],
        defaultId: 0,
        cancelId: 0,
      })
      .then((r) => {
        if (r.response === 1) abrirConfiguracion();
      })
      .catch(() => {});
  }

  ventana.once("ready-to-show", () => {
    cerrarCarga();
    ventana.show();
  });

  // Los enlaces externos se abren en el navegador, no dentro de la caja.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  ventana.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) registrar("renderizador", `${message} (${sourceId}:${line})`);
  });
  ventana.webContents.on("did-fail-load", (_event, code, descripcion, url, esPrincipal) => {
    if (esPrincipal) registrar("carga", `${code} ${descripcion} ${url}`);
  });
  ventana.webContents.on("render-process-gone", (_event, detalles) => {
    registrar("renderizador-cerrado", JSON.stringify(detalles));
    dialog.showErrorBox(
      "Costea POS Caja",
      `La pantalla se cerró inesperadamente. Abra nuevamente Punto de venta.\n\nDiagnóstico: ${rutaLog}`,
    );
  });
}

/** Ventana "Acerca de" con el ícono, la versión y las funciones incluidas. */
function abrirAcercaDe() {
  const w = new BrowserWindow({
    width: 520,
    height: 620,
    resizable: false,
    title: "Acerca de Costea POS Caja",
    backgroundColor: "#1b1a19",
    icon: rutaIcono(),
    parent: ventana || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  w.setMenuBarVisibility(false);
  w.loadFile(rutaAcerca());
}


/**
 * La caja se abre sin clave, pero la CONFIGURACIÓN queda protegida:
 * config.html pide la clave del superadministrador del servidor central.
 */
function abrirConfiguracion() {
  if (!ventana) return;
  const c = almacen.leerConfig();
  // Configuración siempre protegida salvo la primera puesta en marcha, cuando
  // todavía no hay servidor central contra el cual validar la clave.
  const protegida = Boolean(c.activada || (c.servidorUrl && c.claveSincronizacion));
  ventana.loadFile(rutaConfig(), protegida ? { query: { bloqueado: "1" } } : undefined);
}

function abrirPendientes() {
  if (ventana) ventana.loadFile(rutaPendientes());
}

function abrirCierre() {
  if (ventana) ventana.loadFile(rutaCierre());
}

function abrirCuadre() {
  if (ventana) ventana.loadFile(rutaCuadre());
}

/** Órdenes de venta emitidas por esta caja (pantalla aparte de las facturas). */
function abrirOrdenes() {
  if (ventana) ventana.loadFile(rutaOrdenes());
}

/** Carpeta desde la que se ejecuta la interfaz integrada de esta caja. */
function raizInterfaz() {
  // La interfaz se copia como recurso completo fuera de app.asar. Esto evita
  // que el empaquetador elimine dependencias trazadas que el motor local usa.
  const appEmpaquetada = path.join(process.resourcesPath || "", "web-app");
  return app.isPackaged ? appEmpaquetada : path.join(__dirname, "web-app");
}

/**
 * Revisa que la carpeta de la interfaz esté completa y sea de esta versión.
 * Devuelve null si todo está bien, o el texto del problema encontrado.
 */
function revisarPaquete() {
  const raiz = raizInterfaz();
  const entrada = path.join(raiz, "server", "index.mjs");
  if (!fs.existsSync(entrada)) return "No se encontró el motor local de la interfaz (server/index.mjs).";
  const rutaSello = path.join(raiz, "sello-caja.json");
  if (!fs.existsSync(rutaSello))
    return "Esta carpeta no tiene el sello de versión; corresponde a una versión anterior de la caja.";
  try {
    const sello = JSON.parse(fs.readFileSync(rutaSello, "utf8"));
    registrar("paquete", `versión sellada ${sello.version} · ${sello.modulos.length} módulos · ${raiz}`);
    const faltantes = sello.modulos.filter(
      (m) => !fs.existsSync(path.join(raiz, "server", ...m.split("/"))),
    );
    if (faltantes.length > 0)
      return `Faltan ${faltantes.length} archivos del motor local (por ejemplo: ${faltantes.slice(0, 3).join(", ")}).`;
    if (sello.version !== app.getVersion())
      return `La interfaz integrada es de la versión ${sello.version} y el programa es ${app.getVersion()}.`;
  } catch (e) {
    return `No se pudo leer el sello del paquete: ${String(e.message || e)}`;
  }
  return null;
}

const AVISO_PAQUETE_VIEJO =
  "Esta carpeta de la caja está incompleta o es de una versión anterior. Instale la versión más reciente de Costea POS Caja y abra el acceso directo nuevo.";

/**
 * Punto de venta completo incluido en el ejecutable. No abre el sitio web:
 * carga la aplicación React empaquetada y servida por esta misma computadora.
 */
async function abrirPos() {
  if (!ventana) return;
  const problema = revisarPaquete();
  if (problema) {
    registrar("paquete-incompleto", `${problema} (carpeta: ${raizInterfaz()})`);
    await mostrarFalloInterfaz(AVISO_PAQUETE_VIEJO, `${problema}\n\nCarpeta en uso:\n${raizInterfaz()}`);
    return;
  }
  try {
    const url = await iniciarInterfazLocal();
    // Si el motor local responde con error, se explica en español en vez de
    // dejar la pantalla genérica "This page didn't load".
    const estado = await estadoRuta(`${url}/`);
    if (estado.codigo >= 500) {
      registrar("pos-error", `La pantalla de venta respondió ${estado.codigo}: ${estado.detalle}`);
      const moduloFaltante = /ERR_MODULE_NOT_FOUND|Cannot find module/i.test(estado.detalle);
      await mostrarFalloInterfaz(
        moduloFaltante
          ? AVISO_PAQUETE_VIEJO
          : `El motor local respondió error ${estado.codigo} al abrir la pantalla de venta.`,
        moduloFaltante
          ? `Falta un archivo del motor local.\n\nCarpeta en uso:\n${raizInterfaz()}`
          : estado.detalle,
        moduloFaltante ? undefined : `${url}/`,
      );
      return;
    }
    await ventana.loadURL(`${url}/`);
  } catch (e) {
    registrar("abrir-pos", e);
    const texto = String(e.message || e);
    const moduloFaltante = /ERR_MODULE_NOT_FOUND|Cannot find module/i.test(texto);
    await mostrarFalloInterfaz(
      moduloFaltante ? AVISO_PAQUETE_VIEJO : "No se pudo iniciar la interfaz integrada.",
      `${texto}\n\nCarpeta en uso:\n${raizInterfaz()}`,
    );
  }
}


/** Consulta una ruta del servidor local y devuelve su código y el detalle del error. */
function estadoRuta(url) {
  return new Promise((resolve) => {
    const peticion = http.get(url, (res) => {
      let cuerpo = "";
      res.setEncoding("utf8");
      res.on("data", (t) => {
        if (cuerpo.length < 4000) cuerpo += t;
      });
      res.on("end", () => resolve({ codigo: res.statusCode || 0, detalle: cuerpo.slice(0, 1500) }));
    });
    peticion.on("error", (e) => resolve({ codigo: 0, detalle: String(e.message || e) }));
    peticion.setTimeout(15_000, () => {
      peticion.destroy();
      resolve({ codigo: 0, detalle: "El motor local no respondió a tiempo" });
    });
  });
}

/** Pantalla de aviso, en español, con el detalle real del fallo y botón de reintento. */
async function mostrarFalloInterfaz(mensaje, detalle, destino) {
  if (!ventana) return;
  const escapar = (t) =>
    String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>Costea POS Caja</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; background:#1f1c1a; color:#f4efe9; margin:0;
           min-height:100vh; display:grid; place-items:center; padding:24px; }
    .caja { max-width:720px; text-align:center; }
    h1 { color:#e85d3a; font-size:22px; margin:0 0 8px; }
    p { margin:6px 0; line-height:1.5; }
    pre { text-align:left; background:#2a2624; border:1px solid #453f3b; border-radius:8px;
          padding:12px; font-size:12px; max-height:240px; overflow:auto; white-space:pre-wrap; }
    button { margin-top:16px; background:#e85d3a; color:#fff; border:0; border-radius:8px;
             padding:12px 22px; font-size:15px; font-weight:600; cursor:pointer; }
  </style></head><body><div class="caja">
    <h1>La pantalla de venta no pudo abrirse</h1>
    <p>${escapar(mensaje)}</p>
    <p>Detalle técnico para soporte:</p>
    <pre>${escapar(detalle)}</pre>
    <button onclick="${destino ? `location.href=${JSON.stringify(String(destino))}` : "location.reload()"}">Reintentar</button>
  </div></body></html>`;
  await ventana.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

/** Arranca una sola vez el paquete web incluido, en un puerto local libre. */
async function iniciarInterfazLocal() {
  if (urlInterfaz) return urlInterfaz;
  // Puerto fijo: mantiene la misma dirección local en cada arranque, así la caja
  // conserva su sesión y sus datos guardados en esta computadora.
  const puerto = (await puertoDisponible(7331)) || (await puertoLibre());
  const entrada = path.join(raizInterfaz(), "server", "index.mjs");

  servidorInterfaz = spawn(process.execPath, [entrada], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(puerto),
      HOST: "127.0.0.1",
      NITRO_PORT: String(puerto),
      NITRO_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  servidorInterfaz.stdout?.on("data", (data) => registrar("servidor", data.toString().trim()));
  servidorInterfaz.stderr?.on("data", (data) => registrar("servidor-error", data.toString().trim()));
  servidorInterfaz.on("error", (error) => registrar("proceso-servidor", error));
  servidorInterfaz.on("exit", (code, signal) => registrar("servidor-cerrado", `código=${code} señal=${signal}`));
  const url = `http://127.0.0.1:${puerto}`;
  await esperarServidor(url, servidorInterfaz);
  urlInterfaz = url;
  return url;
}

/** Comprueba si un puerto concreto está libre en esta computadora. */
function puertoDisponible(puerto) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once("error", () => resolve(0));
    server.listen(puerto, "127.0.0.1", () => server.close(() => resolve(puerto)));
  });
}

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const direccion = server.address();
      const puerto = direccion && typeof direccion === "object" ? direccion.port : 0;
      server.close(() => (puerto ? resolve(puerto) : reject(new Error("No se encontró un puerto local"))));
    });
  });
}

function esperarServidor(url, proceso) {
  return new Promise((resolve, reject) => {
    const limite = Date.now() + 20_000;
    const probar = () => {
      if (!proceso || proceso.exitCode !== null)
        return reject(new Error("El motor local de la interfaz se cerró durante el arranque"));
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() >= limite) reject(new Error("La interfaz local no respondió a tiempo"));
          else setTimeout(probar, 200);
        });
    };
    probar();
  });
}


function menu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Caja",
        submenu: [
          { label: "Punto de venta", click: abrirPos },
          { label: "Facturas pendientes", click: abrirPendientes },
          { label: "Órdenes de venta", click: abrirOrdenes },
          { label: "Configuración de la caja", click: abrirConfiguracion },
          { type: "separator" },
          {
            label: "Enviar pendientes al SRI ahora",
            click: async () => {
              const r = await facturacion.procesarPendientes();
              dialog.showMessageBox({ message: `Se procesaron ${r.length} comprobantes pendientes.` });
            },
          },
          {
            label: "Sincronizar con el servidor",
            click: async () => {
              try {
                const r = await sincronizacion.subirPendientes();
                dialog.showMessageBox({ message: `Documentos subidos: ${r.subidos}` });
              } catch (e) {
                dialog.showErrorBox("Sincronización", String(e.message || e));
              }
            },
          },
          { type: "separator" },
          { label: "Carpeta de datos", click: () => shell.openPath(almacen.rutaDatos()) },
          { label: "Acerca de Costea POS Caja", click: abrirAcercaDe },
          { role: "quit", label: "Salir" },
        ],
      },
      { label: "Ver", submenu: [{ role: "reload", label: "Recargar" }, { role: "toggleDevTools" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
      { label: "Imprimir", submenu: [{ label: "Imprimir pantalla", click: () => ventana && ventana.webContents.print({ silent: false }) }] },
    ]),
  );
}

/** Cada minuto: reintenta pendientes del SRI y sube al servidor central. */
function arrancarReintentos() {
  clearInterval(temporizador);
  temporizador = setInterval(async () => {
    try {
      await facturacion.procesarPendientes();
    } catch {
      /* sin conexión: se reintenta en el próximo ciclo */
    }
    try {
      await sincronizacion.subirPendientes();
    } catch {
      /* sin conexión */
    }
    try {
      await sincronizacion.sincronizarClientes();
    } catch {
      /* sin conexión */
    }
  }, 60_000);
}

app.whenReady().then(() => {
  // costea-img://archivo.jpg → carpeta local de imágenes de la caja.
  protocol.handle("costea-img", (peticion) => {
    const archivo = decodeURIComponent(new URL(peticion.url).hostname + new URL(peticion.url).pathname).replace(/^\/+/, "");
    return net.fetch(pathToFileURL(almacen.rutaImagen(archivo)).toString());
  });
  // Identidad de la aplicación en Windows: usa el ícono propio en la barra de tareas.
  app.setAppUserModelId("ec.costeapro.pos.caja");
  almacen.inicializar(path.join(app.getPath("userData"), "datos-caja"));
  mostrarCarga();
  menu();
  crearVentana();
  arrancarReintentos();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on("window-all-closed", () => {
  if (servidorInterfaz && servidorInterfaz.exitCode === null) servidorInterfaz.kill();
  if (process.platform !== "darwin") app.quit();
});

/* ── Puente con la interfaz (preload → window.costeaCaja) ──────── */

const ok = (fn) => async (_evento, datos) => {
  try {
    return { ok: true, data: await fn(datos) };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
};

ipcMain.handle("app:version", ok(async () => app.getVersion()));
ipcMain.handle("config:leer", ok(async () => almacen.configPublica()));

ipcMain.handle(
  "config:guardar",
  ok(async (datos) => {
    const parcial = { ...datos };
    // Los campos enmascarados no se sobrescriben si el usuario no los cambió.
    if (parcial.firmaPassword === "********") delete parcial.firmaPassword;
    if (parcial.claveSincronizacion === "********") delete parcial.claveSincronizacion;
    almacen.guardarConfig(parcial);
    return almacen.configPublica();
  }),
);

ipcMain.handle(
  "config:elegirFirma",
  ok(async () => {
    const r = await dialog.showOpenDialog({
      title: "Seleccione el certificado de firma electrónica",
      filters: [{ name: "Certificado", extensions: ["p12", "pfx"] }],
      properties: ["openFile"],
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    return almacen.guardarFirma(r.filePaths[0]);
  }),
);

/** Comprueba con el servidor que esta caja está registrada y descarga el catálogo. */
ipcMain.handle(
  "caja:verificar",
  ok(async () => {
    const respuesta = await sincronizacion.verificarAutorizacion();
    const catalogo = await sincronizacion.descargarCatalogo();
    return {
      caja: respuesta.caja || null,
      productos: Array.isArray(catalogo.productos) ? catalogo.productos.length : 0,
      categorias: Array.isArray(catalogo.categorias) ? catalogo.categorias.length : 0,
    };
  }),
);

ipcMain.handle(
  "caja:activar",
  ok(async () => {
    // La caja solo se abre si el servidor la reconoce (establecimiento + punto + clave).
    await sincronizacion.verificarAutorizacion();
    let catalogo = null;
    try {
      catalogo = await sincronizacion.descargarCatalogo();
    } catch {
      catalogo = almacen.leerCatalogo();
    }
    almacen.guardarConfig({ activada: true });
    abrirPos();
    return { catalogo: Boolean(catalogo) };
  }),
);

/** Con el turno cerrado no se registran ventas hasta abrir uno nuevo con clave. */
function exigirTurnoAbierto() {
  if (cierreCaja.estadoTurno().cerrado)
    throw new Error("El turno está cerrado. Abra un turno nuevo con clave de administrador para vender.");
}

ipcMain.handle(
  "factura:emitir",
  ok(async (datos) => {
    exigirTurnoAbierto();
    return facturacion.emitirFactura(datos);
  }),
);
ipcMain.handle(
  "orden:guardar",
  ok(async (datos) => {
    exigirTurnoAbierto();
    return facturacion.guardarOrden(datos);
  }),
);
ipcMain.handle("sri:pendientes", ok(async () => almacen.pendientesSri()));
ipcMain.handle("sri:procesar", ok(async () => facturacion.procesarPendientes()));
ipcMain.handle("comprobantes:listar", ok(async () => almacen.listarComprobantes().slice(0, 200)));
ipcMain.handle("catalogo:descargar", ok(async () => sincronizacion.descargarCatalogo()));
ipcMain.handle("catalogo:leer", ok(async () => almacen.leerCatalogo()));
ipcMain.handle("catalogo:actualizaciones", ok(async () => sincronizacion.hayActualizacionesCatalogo()));
ipcMain.handle("servidor:subir", ok(async () => sincronizacion.subirPendientes()));
ipcMain.handle("clientes:listar", ok(async () => almacen.leerClientes()));
ipcMain.handle("clientes:buscar", ok(async (identificacion) => almacen.buscarCliente(identificacion)));
ipcMain.handle("clientes:guardar", ok(async (cliente) => sincronizacion.registrarCliente(cliente)));
ipcMain.handle("clientes:sincronizar", ok(async () => sincronizacion.sincronizarClientes()));
ipcMain.handle("admin:verificarClave", ok(async (clave) => sincronizacion.verificarClaveAdmin(clave)));
ipcMain.handle("caja:secuencia", ok(async () => almacen.estadoSecuencias()));
ipcMain.handle("caja:abrirConfig", ok(async () => abrirConfiguracion()));
ipcMain.handle("caja:abrirPos", ok(async () => abrirPos()));
ipcMain.handle("caja:abrirPendientes", ok(async () => abrirPendientes()));
ipcMain.handle("caja:abrirOrdenes", ok(async () => abrirOrdenes()));
ipcMain.handle("caja:abrirCierre", ok(async () => abrirCierre()));
ipcMain.handle("caja:abrirCuadre", ok(async () => abrirCuadre()));
ipcMain.handle("cierre:resumen", ok(async () => cierreCaja.resumen()));
ipcMain.handle("turno:estado", ok(async () => cierreCaja.estadoTurno()));
/** Abrir un turno nuevo exige clave de administrador o superadministrador. */
ipcMain.handle(
  "turno:abrir",
  ok(async (datos) => {
    await sincronizacion.verificarClaveAdmin(String((datos && datos.clave) || ""));
    return cierreCaja.abrirTurno();
  }),
);
ipcMain.handle("cierre:historial", ok(async () => almacen.listarCierres().slice(0, 60)));
/** Confirma el cierre: exige la clave del superadministrador del servidor. */
ipcMain.handle(
  "cierre:confirmar",
  ok(async (datos) => {
    await sincronizacion.verificarClaveAdmin(String((datos && datos.clave) || ""));
    const cierre = cierreCaja.confirmar({
      efectivoContado: (datos && datos.efectivoContado) || 0,
      notas: (datos && datos.notas) || "",
    });
    try {
      await sincronizacion.subirPendientes();
    } catch {
      /* sin internet: se sube en el próximo ciclo */
    }
    return cierre;
  }),
);
/**
 * Anula una ORDEN de venta: pide clave de administrador, guarda el motivo,
 * imprime el comprobante "ORDEN ANULADA" y avisa al servidor central.
 */
ipcMain.handle(
  "orden:anular",
  ok(async (datos) => {
    const id = String((datos && datos.id) || "");
    const motivo = String((datos && datos.motivo) || "");
    const verificacion = await sincronizacion.verificarClaveAdmin(String((datos && datos.clave) || ""));
    const usuario = (verificacion && verificacion.email) || "administrador";
    const anulada = almacen.anularOrden(id, motivo, usuario);

    const w = new BrowserWindow({ show: false });
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(ordenAnuladaHtml(anulada))}`);
    await new Promise((resolve) => w.webContents.print({ silent: true, printBackground: true }, () => resolve()));
    w.destroy();

    try {
      await sincronizacion.subirPendientes();
    } catch {
      /* sin internet: la anulación viaja en el próximo ciclo */
    }
    return anulada;
  }),
);

/** Imprime el reporte del cierre o del cuadre (papel térmico 80 mm). */
ipcMain.handle(
  "cierre:imprimir",
  ok(async (datos) => {
    const cierre = datos && datos.cierre ? datos.cierre : datos;
    const modo = (datos && datos.modo) || "cierre";
    const w = new BrowserWindow({ show: false });
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(cierreHtml(cierre, modo))}`);
    await new Promise((resolve) => w.webContents.print({ silent: true, printBackground: true }, () => resolve()));
    w.destroy();
    return true;
  }),
);
/** Imprime el comprobante con el formato oficial y las copias configuradas. */
ipcMain.handle(
  "impresion:ticket",
  ok(async (doc) => {
    const html = ticketHtml(doc, almacen.leerConfig().copiasTicket);
    const w = new BrowserWindow({ show: false });
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve) => w.webContents.print({ silent: true, printBackground: true }, () => resolve()));
    w.destroy();
    return true;
  }),
);

ipcMain.handle(
  "impresion:silenciosa",
  ok(async (html) => {
    const w = new BrowserWindow({ show: false });
    // Todo lo que imprime la caja sale por la térmica de 80 mm: forzamos el ancho
    // útil (74 mm) y un margen pequeño para que nada se salga ni se corte.
    const ajuste80mm = `<style>
      @page { size: 80mm auto; margin: 3mm 2mm; }
      html, body { margin:0 !important; padding:0 !important; width:74mm !important; max-width:74mm !important;
        overflow-x:hidden; }
      body * { max-width:74mm !important; box-sizing:border-box; overflow-wrap:anywhere; word-break:break-word; }
      table { width:100% !important; table-layout:fixed !important; border-collapse:collapse; }
      img, svg { max-width:74mm !important; height:auto !important; }
      body { font-size:11px !important; }
    </style>`;
    const documento = html.includes("</head>")
      ? html.replace("</head>", `${ajuste80mm}</head>`)
      : `${ajuste80mm}${html}`;
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(documento)}`);
    await new Promise((resolve) =>
      w.webContents.print(
        {
          silent: true,
          printBackground: true,
          margins: { marginType: "none" },
          pageSize: { width: 80000, height: 297000 },
        },
        () => resolve(),
      ),
    );
    w.destroy();
    return true;
  }),
);
