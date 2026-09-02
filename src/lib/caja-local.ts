/**
 * Puente con la CAJA DESCARGABLE (aplicación de escritorio).
 *
 * La caja instalada muestra exactamente la misma interfaz del POS web, pero su
 * configuración de facturación es LOCAL: RUC, razón social, dirección, punto de
 * emisión, secuencia, firma .p12 e impresora viven en esa computadora.
 * Las ventas, órdenes y reportes siguen sincronizándose con el servidor central.
 */
import type { CompanySettings } from "@/lib/pos";

export type ConfigCajaLocal = {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  dirMatriz: string;
  dirEstablecimiento: string;
  telefono: string;
  correo: string;
  establishment: string;
  emissionPoint: string;
  obligadoContabilidad: boolean;
  contribuyenteEspecial: string;
  ambiente: string;
  tarifaIva: number;
  regimen: string;
  copiasTicket: number;
  nextSequential: number;
  firmaArchivo: string;
  impresoraPos?: string;
  /** Tipo de local de esta caja: define qué pestañas se ven. */
  tipoLocal?: "rapida" | "restaurante" | "patio";
};

export type ItemFacturaLocal = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
};

export type PuenteCajaLocal = {
  esCajaLocal: true;
  version: number;
  versionApp: () => Promise<string>;
  leerConfig: () => Promise<ConfigCajaLocal>;
  abrirConfiguracion: () => Promise<void>;
  abrirPos?: () => Promise<void>;
  abrirPendientes?: () => Promise<void>;
  abrirOrdenes?: () => Promise<void>;
  abrirCierre?: () => Promise<void>;
  abrirCuadre?: () => Promise<void>;
  secuencia: () => Promise<{ nextSequential: number; establishment: string; emissionPoint: string }>;
  guardarOrden: (datos: Record<string, unknown>) => Promise<{
    id: string;
    docNumber: string;
    ordenNumero: number;
    total: number;
  }>;
  descargarCatalogo: () => Promise<Record<string, unknown>>;
  leerCatalogo: () => Promise<Record<string, unknown> | null>;
  actualizacionesCatalogo?: () => Promise<{ hay: boolean; version: string; sinConexion: boolean }>;
  buscarCliente?: (identificacion: string) => Promise<Record<string, unknown> | null>;
  guardarCliente?: (cliente: Record<string, unknown>) => Promise<Record<string, unknown>>;
  estadoTurno?: () => Promise<{ cerrado: boolean }>;
  emitirFactura: (datos: Record<string, unknown>) => Promise<{
    docNumber: string;
    claveAcceso: string;
    estadoSri?: string;
    numeroAutorizacion?: string | null;
  }>;
  imprimirSilencioso: (html: string) => Promise<boolean>;
  imprimirTicket: (doc: Record<string, unknown>) => Promise<boolean>;
};

type VentanaCaja = Window & { costeaCaja?: PuenteCajaLocal };

/** ¿Estamos dentro de la caja descargable de Windows? */
export function esCajaLocal(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as VentanaCaja).costeaCaja?.esCajaLocal);
}

export function puenteCaja(): PuenteCajaLocal | null {
  if (typeof window === "undefined") return null;
  return (window as VentanaCaja).costeaCaja ?? null;
}

/** Configuración local de esta caja (null si no es la app instalada). */
export async function leerConfigCajaLocal(): Promise<ConfigCajaLocal | null> {
  const puente = puenteCaja();
  if (!puente) return null;
  try {
    return await puente.leerConfig();
  } catch {
    return null;
  }
}

/**
 * Sobrepone la configuración local sobre la del servidor: la caja factura con
 * SUS datos, su punto de emisión y su secuencia, sin tocar a las demás cajas.
 */
export function aplicarConfigLocal(
  company: CompanySettings | null,
  local: ConfigCajaLocal | null,
): CompanySettings | null {
  if (!local) return company;
  const base: CompanySettings = company ?? {
    id: "caja-local",
    business_name: local.razonSocial || "Costea POS",
    trade_name: local.nombreComercial || local.razonSocial || "Costea POS",
    ruc: local.ruc || "",
    address: local.dirMatriz || "",
    branch_address: local.dirEstablecimiento || "",
    phone: local.telefono || "",
    email: local.correo || "",
    tax_regime: local.regimen || "",
    special_taxpayer: local.contribuyenteEspecial || null,
    accounting_required: Boolean(local.obligadoContabilidad),
    establishment: local.establishment || "001",
    emission_point: local.emissionPoint || "001",
    next_sequential: Number(local.nextSequential) || 1,
    environment: String(local.ambiente || "2"),
    emission_type: "1",
    iva_rate: Number(local.tarifaIva) || 15,
    service_charge_rate: 0,
    logo_url: null,
    operation_mode: local.tipoLocal || "restaurante",
    setup_completed: true,
    monthly_goal: 0,
    printer_kitchen: "",
    printer_grill: "",
    printer_pos: local.impresoraPos || "",
    printer_copies: Number(local.copiasTicket) || 2,
    prep_limit_minutes: 20,
    prep_limit_mesa: 20,
    prep_limit_llevar: 15,
    prep_limit_domicilio: 30,
  };
  return {
    ...base,
    business_name: local.razonSocial || base.business_name,
    trade_name: local.nombreComercial || base.trade_name,
    ruc: local.ruc || base.ruc,
    address: local.dirMatriz || base.address,
    branch_address: local.dirEstablecimiento || base.branch_address,
    phone: local.telefono || base.phone,
    email: local.correo || base.email,
    tax_regime: local.regimen || base.tax_regime,
    special_taxpayer: local.contribuyenteEspecial || base.special_taxpayer,
    accounting_required: Boolean(local.obligadoContabilidad),
    establishment: local.establishment || base.establishment,
    emission_point: local.emissionPoint || base.emission_point,
    next_sequential: Number(local.nextSequential) || base.next_sequential,
    environment: String(local.ambiente || base.environment),
    iva_rate: Number(local.tarifaIva) || base.iva_rate,
    printer_copies: Number(local.copiasTicket) || base.printer_copies,
    printer_pos: local.impresoraPos || base.printer_pos,
    // El tipo de local de la caja manda sobre el del servidor central.
    operation_mode: local.tipoLocal || base.operation_mode,
  };
}

/**
 * Emite la factura con la firma y la numeración de ESTA caja.
 * Sin internet queda firmada y pendiente: la propia caja la envía al SRI luego.
 */
export async function emitirFacturaCajaLocal(datos: {
  items: ItemFacturaLocal[];
  cliente: {
    tipoIdentificacion: string;
    identificacion: string;
    razonSocial: string;
    direccion?: string | null;
    email?: string | null;
    telefono?: string | null;
  };
  formaPago: string;
  totalConIva: number;
  mesa?: string | null;
  ordenId?: string | null;
}) {
  const puente = puenteCaja();
  if (!puente) throw new Error("Esta pantalla no se está ejecutando en la caja descargable");
  return puente.emitirFactura(datos as unknown as Record<string, unknown>);
}
