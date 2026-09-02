/**
 * Clave de acceso y cálculo de importes — COPIA EXACTA de src/lib/sri.ts del
 * sistema web (misma fórmula módulo 11, mismo orden de campos, mismo redondeo).
 * No modificar sin cambiar también la versión web.
 */

/** Dígito verificador módulo 11 con pesos 2..7 (norma SRI) */
function modulo11(payload) {
  const weights = [2, 3, 4, 5, 6, 7];
  let sum = 0;
  let w = 0;
  for (let i = payload.length - 1; i >= 0; i--) {
    sum += Number(payload[i]) * weights[w];
    w = (w + 1) % weights.length;
  }
  const rest = sum % 11;
  const dv = 11 - rest;
  if (dv === 11) return 0;
  if (dv === 10) return 1;
  return dv;
}

const pad = (value, size) => String(value ?? "").replace(/\D/g, "").padStart(size, "0").slice(-size);

/**
 * fecha(8) + codDoc(2) + ruc(13) + ambiente(1) + serie(6) + secuencial(9) +
 * código(8) + tipoEmisión(1) + verificador(1) = 49 dígitos.
 * El verificador SIEMPRE es el último, nunca en medio.
 */
function buildAccessKey({
  date,
  ruc,
  environment,
  establishment,
  emissionPoint,
  sequential,
  numericCode,
  emissionType = "1",
  docCode = "01",
}) {
  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const fecha = `${dateParts.day}${dateParts.month}${dateParts.year}`;
  const serie = `${pad(establishment, 3)}${pad(emissionPoint, 3)}`;
  const codigo = pad(numericCode ?? Math.floor(Math.random() * 1e8), 8);
  const ambiente = String(environment ?? "").replace(/\D/g, "").slice(-1);
  if (ambiente !== "1" && ambiente !== "2") throw new Error("El ambiente SRI debe ser 1 (Pruebas) o 2 (Producción)");
  const tipoEmision = pad(emissionType || "1", 1);
  const base = fecha + pad(docCode, 2) + pad(ruc, 13) + ambiente + serie + pad(sequential, 9) + codigo + tipoEmision;
  if (base.length !== 48)
    throw new Error(`La clave de acceso debe tener 48 dígitos antes del verificador (tiene ${base.length})`);
  const clave = base + modulo11(base);
  if (clave.length !== 49) throw new Error("La clave de acceso generada no tiene 49 dígitos");
  return clave;
}

const docNumber = (establishment, emissionPoint, sequential) =>
  `${pad(establishment, 3)}-${pad(emissionPoint, 3)}-${pad(sequential, 9)}`;

/** Redondeo comercial a 2 decimales (medio arriba). */
const round2 = (v) => {
  const scaled = (Number(v) || 0) * 100;
  return Math.round(scaled + (scaled >= 0 ? 1e-9 : -1e-9)) / 100;
};

/** Reparto de base imponible e IVA idéntico al del sistema web. */
function buildInvoiceAmounts(lines, tarifa, totalConIva) {
  const factor = 1 + tarifa / 100;
  const baseTotal = round2(round2(totalConIva) / factor);
  const ivaTotal = round2((baseTotal * tarifa) / 100);
  const importeTotal = round2(baseTotal + ivaTotal);

  const detalles = lines.map((l) => {
    const bruto = round2(l.precioUnitario * l.cantidad);
    return {
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad),
      precioUnitario: round2(l.precioUnitario / factor),
      descuento: 0,
      precioTotalSinImpuesto: round2(bruto / factor),
      tarifa,
      baseImponible: round2(bruto / factor),
      valorIva: 0,
    };
  });

  if (detalles.length > 0) {
    const last = detalles[detalles.length - 1];
    const sumaBases = round2(detalles.reduce((s, d) => s + d.baseImponible, 0));
    const ajuste = round2(baseTotal - sumaBases);
    last.baseImponible = round2(last.baseImponible + ajuste);
    last.precioTotalSinImpuesto = last.baseImponible;
    detalles.forEach((d) => {
      d.valorIva = round2((d.baseImponible * tarifa) / 100);
    });
    const sumaIva = round2(detalles.reduce((s, d) => s + d.valorIva, 0));
    last.valorIva = round2(last.valorIva + round2(ivaTotal - sumaIva));
  }

  return { detalles, baseTotal, ivaTotal, importeTotal };
}

module.exports = { modulo11, buildAccessKey, docNumber, round2, buildInvoiceAmounts };
