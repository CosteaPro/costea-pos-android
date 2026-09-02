/** Utilidades de cumplimiento SRI (Ecuador) */

export const IVA_DEFAULT = 15;

/** Dígito verificador módulo 11 con pesos 2..7 (norma SRI) */
export function modulo11(payload: string): number {
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

/**
 * Normaliza a dígitos y deja EXACTAMENTE `size` caracteres (ceros a la izquierda,
 * recorte por la derecha si sobra). Sin esto, un establecimiento "0010" o un
 * secuencial de 10 dígitos desplazaban la clave y el verificador quedaba mal.
 */
const pad = (value: string | number, size: number) =>
  String(value ?? "").replace(/\D/g, "").padStart(size, "0").slice(-size);


export type AccessKeyInput = {
  date: Date;
  ruc: string;
  environment: string; // Catálogo oficial SRI: 1 pruebas, 2 producción
  establishment: string;
  emissionPoint: string;
  sequential: number;
  numericCode?: string;
  emissionType?: string; // 1 normal
  docCode?: string; // 01 factura
};

/**
 * Clave de acceso de 49 dígitos según formato oficial del SRI:
 * fecha(8) + codDoc(2) + ruc(13) + ambiente(1) + serie(6) + secuencial(9) + código(8) + tipoEmisión(1) + dv(1)
 * Nota: los dos dígitos después de la fecha son el TIPO DE COMPROBANTE (01 = factura),
 * no el ambiente. El ambiente es un solo dígito y siempre toma el valor configurado.
 */
export function buildAccessKey({
  date,
  ruc,
  environment,
  establishment,
  emissionPoint,
  sequential,
  numericCode,
  emissionType = "1",
  docCode = "01",
}: AccessKeyInput): string {
  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  const fecha = `${dateParts.day}${dateParts.month}${dateParts.year}`;
  const serie = `${pad(establishment, 3)}${pad(emissionPoint, 3)}`;
  const codigo = pad(numericCode ?? Math.floor(Math.random() * 1e8), 8);
  // El ambiente ocupa un solo dígito en la posición 24. Las posiciones 9–10
  // corresponden a codDoc (01 = factura), no al ambiente.
  const ambiente = String(environment ?? "").replace(/\D/g, "").slice(-1);
  if (ambiente !== "1" && ambiente !== "2") {
    throw new Error("El ambiente SRI debe ser 1 (Pruebas) o 2 (Producción)");
  }
  const tipoEmision = pad(emissionType || "1", 1);
  const base =
    fecha + pad(docCode, 2) + pad(ruc, 13) + ambiente + serie + pad(sequential, 9) + codigo + tipoEmision;
  // El verificador se calcula SIEMPRE al final, sobre los 48 dígitos completos,
  // y ocupa únicamente la posición 49.
  if (base.length !== 48) {
    throw new Error(`La clave de acceso debe tener 48 dígitos antes del verificador (tiene ${base.length})`);
  }
  const clave = base + modulo11(base);
  if (clave.length !== 49) throw new Error("La clave de acceso generada no tiene 49 dígitos");
  return clave;
}


/** Dígito de ambiente contenido en una clave de acceso de 49 dígitos (posición 24). */
export const accessKeyEnvironment = (key: string) => key.slice(23, 24);


export const formatAccessKey = (key: string) => (key.match(/.{1,7}/g) ?? []).join(" ");

export const docNumber = (establishment: string, emissionPoint: string, sequential: number) =>
  `${pad(establishment, 3)}-${pad(emissionPoint, 3)}-${pad(sequential, 9)}`;

/**
 * Validación de RUC ecuatoriano (13 dígitos numéricos, sin caracteres especiales).
 * Acepta los tres tipos vigentes: persona natural (3.er dígito 0-5),
 * sector público (6) y sociedad privada/extranjera (9), con cualquier
 * código de establecimiento válido (001, 002, ... incluido 0001 del sector público).
 */
export function isValidRuc(ruc: string) {
  const value = String(ruc ?? "").replace(/\D/g, "");
  if (value.length !== 13) return false;
  const province = Number(value.slice(0, 2));
  if (province < 1 || province > 24) return false;
  const third = Number(value[2]);
  if (Number.isNaN(third)) return false;
  // El código de establecimiento nunca puede ser 000.
  const establecimiento = value.slice(10);
  if (establecimiento === "000") return false;
  if (third === 6) return value.slice(9) === "0001" || establecimiento !== "000";
  return true;
}


export function isValidCedula(cedula: string) {
  const value = cedula.replace(/\D/g, "");
  if (value.length !== 10) return false;
  const province = Number(value.slice(0, 2));
  if (province < 1 || province > 24) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = Number(value[i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(value[9]);
}

const UNIDADES = [
  "",
  "UN",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISÉIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
  "VEINTE",
];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
];

function hundredsToWords(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const rest = n % 100;
  let text = CENTENAS[c];
  if (rest > 0) {
    if (rest <= 20) text += ` ${UNIDADES[rest]}`;
    else {
      const d = Math.floor(rest / 10);
      const u = rest % 10;
      text += ` ${DECENAS[d]}${u ? (d === 2 ? "" : " Y ") + UNIDADES[u] : ""}`;
      if (d === 2 && u) text = text.replace("VEINTE ", "VEINTI");
    }
  }
  return text.trim();
}

function integerToWords(n: number): string {
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const parts: string[] = [];
  if (millones) parts.push(millones === 1 ? "UN MILLÓN" : `${integerToWords(millones)} MILLONES`);
  if (miles) parts.push(miles === 1 ? "MIL" : `${hundredsToWords(miles)} MIL`);
  if (resto) parts.push(hundredsToWords(resto));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Monto en letras obligatorio en la factura */
export function amountInWords(amount: number): string {
  const value = Math.round(amount * 100) / 100;
  const entero = Math.floor(value);
  const centavos = Math.round((value - entero) * 100);
  return `${integerToWords(entero)} CON ${String(centavos).padStart(2, "0")}/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA`;
}

export const SRI_LEYENDAS = [
  "Costea POS | Sistema de Gestión de Restaurantes",
  "Contribuyente sujeto a retención en la fuente de IVA e Impuesto a la Renta según corresponda.",
];

/**
 * Redondeo comercial a 2 decimales (medio arriba), única regla válida en todo el
 * flujo de facturación. El epsilon evita que 0.945 (0.9449999… en binario) se
 * trunque a 0.94: siempre sube a 0.95.
 */
export const round2 = (v: number) => {
  const scaled = (Number(v) || 0) * 100;
  return Math.round(scaled + (scaled >= 0 ? 1e-9 : -1e-9)) / 100;
};

export type InvoiceLineInput = { descripcion: string; codigo: string; cantidad: number; precioUnitario: number };

/**
 * Reparte el total con IVA entre base imponible e IVA. El IVA SIEMPRE se
 * recalcula sobre la base con redondeo comercial (base × tarifa), nunca por
 * diferencia, porque el SRI valida esa igualdad. El importe total resultante es
 * base + IVA y es el valor único que se muestra, se imprime, se guarda y se envía.
 */
export function buildInvoiceAmounts(
  lines: InvoiceLineInput[],
  tarifa: number,
  totalConIva: number,
) {
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
    const last = detalles[detalles.length - 1]!;
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
