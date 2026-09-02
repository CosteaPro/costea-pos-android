/**
 * Cierre de caja local.
 * Toma los comprobantes emitidos por ESTA caja desde el último cierre y arma
 * el resumen del período: órdenes, facturas, anuladas, formas de pago,
 * subtotal, IVA, total y efectivo esperado.
 */
const { randomUUID } = require("node:crypto");
const almacen = require("./almacen.cjs");

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const FORMAS = ["efectivo", "tarjeta", "transferencia", "apps", "credito", "otros"];

/** Agrupa las formas de pago de la caja en las seis columnas del cierre. */
function grupoPago(forma) {
  const f = String(forma || "efectivo").toLowerCase();
  if (f === "efectivo") return "efectivo";
  if (f === "tarjeta") return "tarjeta";
  if (f === "transferencia") return "transferencia";
  if (f === "apps" || f === "delivery" || f === "app") return "apps";
  if (f === "credito" || f === "transferencia_credito") return "credito";
  return "otros";
}

const anulado = (d) => d.estadoSri === "rechazado" || d.estadoSri === "anulado" || d.anulado === true;

/** Inicio del período: fin del último cierre o el inicio del día contable. */
function inicioPeriodo() {
  const ultimo = almacen.listarCierres()[0];
  if (ultimo && ultimo.hasta) return ultimo.hasta;
  const hoy = almacen.fechaEcuador();
  return `${hoy}T00:00:00.000-05:00`;
}

/** Resumen del período abierto, sin guardar nada. */
function resumen() {
  const config = almacen.leerConfig();
  const desde = inicioPeriodo();
  const hasta = new Date().toISOString();
  const docs = almacen
    .listarComprobantes()
    .filter((d) => {
      const t = new Date(d.fechaEmision).getTime();
      return t >= new Date(desde).getTime() && t <= new Date(hasta).getTime();
    });

  const ordenes = docs.filter((d) => d.tipo === "orden");
  const facturas = docs.filter((d) => d.tipo === "factura");
  const anuladas = facturas.filter(anulado);

  // Una venta facturada guarda su orden y su factura: se cuenta una sola vez.
  const ventas = docs.filter((d) => !anulado(d) && !(d.tipo === "orden" && d.docRelacionado));

  const formasPago = Object.fromEntries(FORMAS.map((f) => [f, 0]));
  let subtotal = 0;
  let iva = 0;
  let total = 0;
  for (const d of ventas) {
    subtotal += Number(d.subtotal) || 0;
    iva += Number(d.iva) || 0;
    total += Number(d.total) || 0;
    const g = grupoPago(d.formaPago);
    formasPago[g] = r2(formasPago[g] + (Number(d.total) || 0));
  }

  return {
    caja: { codigo: config.codigoCaja || "", establecimiento: config.establishment, punto: config.emissionPoint },
    negocio: {
      nombre: config.nombreComercial || config.razonSocial || "Costea POS",
      razonSocial: config.razonSocial || "",
      ruc: config.ruc || "",
      direccion: config.dirEstablecimiento || config.dirMatriz || "",
    },
    fecha: almacen.fechaEcuador(),
    desde,
    hasta,
    tarifaIva: Number(config.tarifaIva ?? 15),
    ordenes: ordenes.length,
    facturas: facturas.length,
    anuladas: anuladas.length,
    detalleAnuladas: anuladas.map((d) => ({ numero: d.docNumber, total: r2(d.total) })),
    formasPago,
    subtotal: r2(subtotal),
    iva: r2(iva),
    total: r2(total),
    efectivoEsperado: r2(formasPago.efectivo),
    cerrado: false,
  };
}

/** Estado del turno: cerrado tras un cierre definitivo, abierto tras reabrirlo. */
function estadoTurno() {
  const c = almacen.leerConfig();
  return {
    cerrado: Boolean(c.turnoCerrado),
    cerradoEn: c.turnoCerradoEn || null,
  };
}

/** Reabre el turno (la clave la valida quien llama). */
function abrirTurno() {
  almacen.guardarConfig({ turnoCerrado: false, turnoCerradoEn: "", turnoAbiertoEn: new Date().toISOString() });
  return estadoTurno();
}

/**
 * Guarda el cierre (definitivo, no editable) y reinicia el número de orden.
 * La numeración de facturas NO se toca: sigue secuencial.
 */
function confirmar({ efectivoContado, contado, notas } = {}) {
  const base = resumen();
  // Se cuentan TODOS los medios de pago, no solo el efectivo.
  const contados = Object.fromEntries(
    FORMAS.map((f) => [f, r2(contado && contado[f] != null ? contado[f] : f === "efectivo" ? efectivoContado : 0)]),
  );
  const diferencias = Object.fromEntries(
    FORMAS.map((f) => [f, r2(contados[f] - (Number(base.formasPago[f]) || 0))]),
  );
  const contadoTotal = r2(FORMAS.reduce((s, f) => s + contados[f], 0));
  const cierre = {
    ...base,
    id: randomUUID(),
    contado: contados,
    diferencias,
    contadoTotal,
    efectivoContado: contados.efectivo,
    diferencia: r2(contadoTotal - base.total),
    diferenciaEfectivo: diferencias.efectivo,
    notas: String(notas || ""),
    cerrado: true,
    creadoEn: new Date().toISOString(),
  };
  almacen.guardarCierre(cierre);
  almacen.reiniciarOrdenes();
  // El turno queda CERRADO: no se puede vender hasta abrir uno nuevo con clave.
  almacen.guardarConfig({ turnoCerrado: true, turnoCerradoEn: cierre.creadoEn });
  return cierre;
}

module.exports = { resumen, confirmar, estadoTurno, abrirTurno, FORMAS, grupoPago };
