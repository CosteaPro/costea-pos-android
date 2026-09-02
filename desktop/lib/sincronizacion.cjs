/**
 * Conexión con el servidor central (Costea POS en la nube).
 *  · BAJA: catálogo del día (productos, categorías, mesas, formas de pago, impresora).
 *  · SUBE: cada factura u orden ya emitida y numerada, y los totales del día.
 * El servidor NUNCA asigna números: solo recibe y consolida.
 */
const almacen = require("./almacen.cjs");

const base = () => String(almacen.leerConfig().servidorUrl || "").replace(/\/+$/, "");

function cabeceras() {
  const config = almacen.leerConfig();
  if (!base()) throw new Error("Falta la dirección del servidor central en la configuración");
  if (!config.claveSincronizacion) throw new Error("Falta la clave de sincronización de la caja");
  if (!config.establishment || !config.emissionPoint)
    throw new Error("Falta el establecimiento o el punto de emisión en la configuración");
  return {
    "Content-Type": "application/json",
    "x-caja-codigo": config.codigoCaja || "",
    "x-caja-clave": config.claveSincronizacion,
    "x-caja-establecimiento": config.establishment,
    "x-caja-punto": config.emissionPoint,
    // El tipo de local se configura SOLO aquí; el central únicamente lo almacena.
    "x-caja-tipo-local": config.tipoLocal || "restaurante",
  };
}

/** Verifica con el servidor central que esta caja está registrada y activa. */
async function verificarAutorizacion() {
  const res = await fetch(`${base()}/api/public/caja/autorizar`, { headers: cabeceras() });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok || !cuerpo.autorizado)
    throw new Error(cuerpo.error || `El servidor respondió ${res.status}`);
  return cuerpo;
}


/** Nombre estable del archivo local de una foto. */
function nombreImagen(ruta) {
  const limpio = String(ruta || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const extension = /\.(jpg|jpeg|png|webp|gif|avif)$/i.exec(limpio);
  return extension ? limpio : `${limpio}.jpg`;
}

/**
 * Descarga el catálogo del servidor y lo guarda en esta computadora, junto con
 * las fotos. Solo baja las imágenes nuevas o cambiadas: lo demás ya está local.
 */
async function descargarCatalogo() {
  const res = await fetch(`${base()}/api/public/caja/catalogo`, { headers: cabeceras() });
  const texto = await res.text();
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}: ${texto.slice(0, 200)}`);
  const catalogo = JSON.parse(texto);

  const anterior = almacen.leerCatalogo() || {};
  const previos = new Map(
    (anterior.productos || []).map((p) => [p.id, p]),
  );

  let descargadas = 0;
  for (const producto of catalogo.productos || []) {
    if (!producto.image_url) {
      producto.imagen_local = null;
      continue;
    }
    const archivo = nombreImagen(producto.image_url);
    producto.imagen_local = archivo;
    const previo = previos.get(producto.id);
    const cambio = !previo || previo.image_url !== producto.image_url;
    if (!cambio && almacen.existeImagen(archivo)) continue;
    if (!producto.image_signed_url) continue;
    try {
      const foto = await fetch(producto.image_signed_url);
      if (!foto.ok) continue;
      almacen.guardarImagen(archivo, Buffer.from(await foto.arrayBuffer()));
      descargadas += 1;
    } catch {
      /* sin conexión con el almacenamiento: se reintenta en la próxima sincronización */
    }
  }
  // El enlace firmado caduca: no se guarda en el disco.
  for (const producto of catalogo.productos || []) delete producto.image_signed_url;

  return almacen.guardarCatalogo({ ...catalogo, imagenesDescargadas: descargadas });
}

/** Huella actual del menú en el servidor (consulta muy liviana). */
async function versionCatalogoRemota() {
  const res = await fetch(`${base()}/api/public/caja/catalogo?resumen=1`, { headers: cabeceras() });
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
  const cuerpo = await res.json();
  return String(cuerpo.version || "");
}

/**
 * ¿El menú del servidor cambió respecto al que ya está guardado aquí?
 * Sin internet devuelve `hay: false` para no molestar al cajero.
 */
async function hayActualizacionesCatalogo() {
  const local = almacen.leerCatalogo();
  try {
    const remota = await versionCatalogoRemota();
    return { hay: Boolean(local) && Boolean(remota) && remota !== String(local.version || ""), version: remota, sinConexion: false };
  } catch {
    return { hay: false, version: "", sinConexion: true };
  }
}

/** Sube todos los documentos que aún no están en el servidor central. */
async function subirPendientes() {
  const pendientes = almacen.pendientesSincronizar();
  if (pendientes.length === 0) return { subidos: 0, pendientes: 0, ordenes: 0, facturas: 0, errores: [] };

  const documentos = pendientes.map((d) => ({
    tipo: d.tipo,
    doc_number: d.docNumber,
    venta_id: d.ventaId ?? null,
    doc_relacionado: d.docRelacionado ?? null,
    orden_numero: d.ordenNumero ?? null,
    mesa: d.mesa ?? null,
    mesero: d.mesero ?? null,
    clave_acceso: d.claveAcceso,
    fecha_emision: d.fechaEmision,
    cliente_identificacion: d.cliente ? d.cliente.identificacion : null,
    cliente_nombre: d.cliente ? d.cliente.razonSocial : null,
    cliente_email: d.cliente ? d.cliente.email || null : null,
    subtotal: d.subtotal,
    iva: d.iva,
    total: d.total,
    forma_pago: d.formaPago,
    estado_sri: d.estadoSri,
    numero_autorizacion: d.numeroAutorizacion ?? null,
    fecha_autorizacion: d.fechaAutorizacion ?? null,
    mensajes_sri: d.anulado
      ? `ANULADA por ${d.usuarioAnulacion || "administrador"}: ${d.motivoAnulacion || ""}`
      : (d.mensajesSri ?? []).join(" · "),
    xml_firmado: d.xmlFirmado ?? null,
    xml_autorizado: d.xmlAutorizado ?? null,
    items: d.items ?? [],
  }));

  const res = await fetch(`${base()}/api/public/caja/sincronizar`, {
    method: "POST",
    headers: cabeceras(),
    body: JSON.stringify({ documentos, totales: totalesDelDia() }),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}: ${texto.slice(0, 200)}`);

  let respuesta = {};
  try {
    respuesta = JSON.parse(texto);
  } catch {
    respuesta = {};
  }

  // Solo se marca como sincronizado lo que el servidor confirma explícitamente.
  const confirmaciones = Array.isArray(respuesta.confirmaciones) ? respuesta.confirmaciones : null;
  const confirmado = (d) => {
    if (!confirmaciones) return true;
    const c = confirmaciones.find((x) => x.tipo === d.tipo && x.doc_number === d.docNumber);
    return Boolean(c && c.registrado && !c.error);
  };

  let subidos = 0;
  const errores = [];
  for (const d of pendientes) {
    if (confirmado(d)) {
      almacen.guardarComprobante({ ...d, sincronizado: true });
      subidos++;
    } else {
      const c = (confirmaciones || []).find((x) => x.tipo === d.tipo && x.doc_number === d.docNumber);
      errores.push(`${d.docNumber}: ${(c && c.error) || "el servidor no confirmó el registro"}`);
    }
  }

  return {
    subidos,
    pendientes: pendientes.length - subidos,
    ordenes: Number(respuesta.ordenes || 0),
    facturas: Number(respuesta.facturas || 0),
    errores,
  };
}

/** Resumen del día contable de Ecuador para el servidor central. */
function totalesDelDia() {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
  const delDia = almacen
    .listarComprobantes()
    .filter(
      (d) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date(d.fechaEmision)) === hoy &&
        d.estadoSri !== "rechazado",
    );
  const formas = {};
  let ventas = 0;
  for (const d of delDia) {
    ventas += Number(d.total) || 0;
    const clave = d.formaPago || "efectivo";
    formas[clave] = Math.round(((formas[clave] || 0) + (Number(d.total) || 0)) * 100) / 100;
  }
  return {
    fecha: hoy,
    ventas: Math.round(ventas * 100) / 100,
    transacciones: delDia.length,
    formas_pago: formas,
  };
}

/** Baja la lista completa de clientes del servidor central. */
async function descargarClientes() {
  const res = await fetch(`${base()}/api/public/caja/clientes`, { headers: cabeceras() });
  const texto = await res.text();
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}: ${texto.slice(0, 200)}`);
  const cuerpo = JSON.parse(texto);
  return almacen.guardarClientesDelServidor(cuerpo.clientes || []);
}

/** Sube los clientes registrados o corregidos sin internet. */
async function subirClientes() {
  const pendientes = almacen.clientesPendientes();
  if (pendientes.length === 0) return { guardados: 0 };
  const res = await fetch(`${base()}/api/public/caja/clientes`, {
    method: "POST",
    headers: cabeceras(),
    body: JSON.stringify({
      clientes: pendientes.map(({ pendiente, ...c }) => c),
    }),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}: ${texto.slice(0, 200)}`);
  const cuerpo = JSON.parse(texto);
  almacen.marcarClientesSincronizados(cuerpo.identificaciones || pendientes.map((c) => c.id_number));
  return { guardados: Number(cuerpo.guardados || 0) };
}

/** Registra un cliente: local al instante y al servidor en cuanto haya internet. */
async function registrarCliente(cliente) {
  const guardado = almacen.guardarClienteLocal(cliente, { pendiente: true });
  if (!guardado) throw new Error("Falta la identificación del cliente");
  try {
    await subirClientes();
  } catch {
    /* sin internet: queda pendiente y sube en el próximo ciclo */
  }
  return almacen.buscarCliente(guardado.id_number);
}

/** Sincronización completa de la libreta de clientes. */
async function sincronizarClientes() {
  await subirClientes().catch(() => {});
  return descargarClientes();
}

/** Comprueba con el servidor la clave del superadministrador. */
async function verificarClaveAdmin(clave) {
  const res = await fetch(`${base()}/api/public/caja/clave-admin`, {
    method: "POST",
    headers: cabeceras(),
    body: JSON.stringify({ clave }),
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok || !cuerpo.ok)
    throw new Error(cuerpo.error || "Se requiere clave de administrador para modificar la configuración");
  return { ok: true, email: cuerpo.email || "" };
}

module.exports = {
  descargarCatalogo,
  hayActualizacionesCatalogo,
  versionCatalogoRemota,
  subirPendientes,
  totalesDelDia,
  verificarAutorizacion,
  descargarClientes,
  subirClientes,
  registrarCliente,
  sincronizarClientes,
  verificarClaveAdmin,
};
