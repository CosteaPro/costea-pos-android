/** Las categorías "Modificadores" y "Agregadores" viven al mismo nivel que las del menú. */
export type CategoryKind = "menu" | "modificador" | "agregador";

export type Category = {
  id: string;
  name: string;
  sort_order: number;
  kind?: CategoryKind;
};

export type PrintArea = "cocina" | "parrilla" | "ambas";

export type Product = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  code: string | null;
  image_url: string | null;
  print_area: PrintArea;
};

/**
 * Opción de un platillo.
 *  · modificador → precio $0.00, no suma al pedido (ej. "sin salsa", "término 3/4").
 *  · agregador   → tiene precio propio y suma al pedido (ej. "Extra chorizo $1.00").
 * Cada uno es un producto con su propio código, así el inventario y el cierre
 * del día lo descuentan igual que cualquier otra venta.
 */
export type OptionKind = "modificador" | "agregador";

export type ProductOption = {
  id: string;
  product_id: string;
  option_product_id: string;
  kind: OptionKind;
  sort_order: number;
  default_selected: boolean;
};

/** Opción ya elegida en una línea del pedido. */
export type CartOption = {
  product_id: string;
  code: string | null;
  name: string;
  price: number;
  kind: OptionKind;
  print_area: PrintArea;
  /** Cantidad del agregador dentro de la línea (los modificadores siempre 1). */
  qty: number;
};

/**
 * Receta apuntada por un producto como variante.
 * Las recetas se crean UNA sola vez en "Recetas y subrecetas"; el producto solo
 * las apunta. Si el producto no apunta ninguna, se vende con su propia receta.
 */
export type RecipeVariant = {
  /** Id de la receta (se guarda en order_items.recipe_id). */
  id: string;
  /** Código propio de la receta: es el que se imprime y reporta. */
  code: string | null;
  name: string;
  /** Precio de venta propio de la receta (con IVA incluido). */
  sale_price: number | null;
};

/** Vínculo producto → receta existente usada como variante. */
export type ProductRecipeVariant = {
  id: string;
  product_id: string;
  recipe_id: string;
  sort_order: number;
};


export const PRINT_AREAS = [
  { value: "cocina" as const, label: "Solo Cocina" },
  { value: "parrilla" as const, label: "Solo Parrilla" },
  { value: "ambas" as const, label: "Ambas áreas" },
];



export type TableStatus = "disponible" | "ocupada" | "cobrada" | "reservada";

export type RestaurantTable = {
  id: string;
  name: string;
  seats: number;
  zone: string;
  sort_order: number;
  status?: string;
};

export const TABLE_STATE: Record<
  TableStatus,
  { label: string; dot: string; card: string; text: string }
> = {
  disponible: {
    label: "Disponible",
    dot: "bg-success",
    card: "border-success/50 bg-success/10",
    text: "text-success",
  },
  ocupada: {
    label: "Ocupada",
    dot: "bg-warning",
    card: "border-warning/60 bg-warning/10",
    text: "text-warning",
  },
  cobrada: {
    label: "Cobrada",
    dot: "bg-destructive",
    card: "border-destructive/60 bg-destructive/10",
    text: "text-destructive",
  },
  reservada: {
    label: "Reservada",
    dot: "bg-reserved",
    card: "border-reserved/60 bg-reserved/10",
    text: "text-reserved",
  },
};


export type OrderStatus = "abierto" | "en_cocina" | "listo" | "pagado" | "cancelado";
export type ItemStatus = "pendiente" | "preparando" | "listo" | "entregado";
export type DocType = "factura" | "nota_venta" | "nota_debito" | "nota_credito";

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  notes: string | null;
  status: ItemStatus;
  created_at: string;
  /** Si la línea es un modificador o agregador, apunta al plato al que pertenece. */
  parent_item_id?: string | null;
  option_kind?: OptionKind | null;
};


export type Order = {
  id: string;
  folio: number;
  table_id: string | null;
  service_type: string;
  customer_name: string | null;
  order_label: string | null;
  status: OrderStatus;
  subtotal: number;
  total: number;
  payment_method: string | null;
  notes: string | null;
  paid_at: string | null;
  released_at?: string | null;
  kitchen_sent_at?: string | null;
  ready_at?: string | null;
  delivered_at?: string | null;
  guests?: number;

  created_at: string;
  updated_at: string;
  doc_type: DocType;
  sales_channel: string;
  customer_id_type: string | null;
  customer_id_number: string | null;
  customer_address: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  access_key: string | null;
  doc_number: string | null;
  iva_rate: number;
  tax_amount: number;
  discount: number;
  amount_in_words: string | null;
  authorization_number: string | null;
  doc_status: DocStatus;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_email: string | null;
  sri_status?: SriStatus;
  sri_message?: string | null;
  sri_sent_at?: string | null;
  sri_authorized_at?: string | null;
  xml_signed?: string | null;
};

export type DocStatus = "emitido" | "anulado";

/** Estado del ciclo de vida del comprobante ante el SRI. */
export type SriStatus = "no_aplica" | "pendiente" | "enviado" | "autorizado" | "rechazado";

export const SRI_STATUS_LABEL: Record<SriStatus, string> = {
  no_aplica: "Sin validez tributaria",
  pendiente: "Pendiente de envío",
  enviado: "Enviado al SRI",
  autorizado: "Autorizado por el SRI",
  rechazado: "Rechazado por el SRI",
};

export type Customer = {
  id: string;
  id_type: string;
  id_number: string;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  privacy_accepted: boolean;
  created_at: string;
  updated_at: string;
};

export const AVISO_PRIVACIDAD =
  "Los datos personales solicitados (identificación, nombre, dirección, correo y teléfono) se tratan únicamente para emitir comprobantes de venta, cumplir obligaciones tributarias con el SRI y dar seguimiento al servicio. Se conservan por el plazo legal de 7 años. El titular puede ejercer sus derechos de acceso, rectificación, eliminación, oposición y portabilidad solicitándolo al establecimiento. Ley Orgánica de Protección de Datos Personales del Ecuador.";

/** Tipos de identificación aceptados por el SRI. */
export const ID_TYPES: { value: string; label: string }[] = [
  { value: "cedula", label: "Cédula" },
  { value: "ruc", label: "RUC" },
  { value: "pasaporte", label: "Pasaporte" },
  { value: "consumidor_final", label: "Consumidor final" },
];



export type OrderWithItems = Order & { order_items: OrderItem[] };

export type OperationMode = "restaurante" | "rapida" | "patio";

export type CompanySettings = {
  id: string;
  business_name: string;
  trade_name: string;
  ruc: string;
  address: string;
  phone: string;
  email: string;
  tax_regime: string;
  special_taxpayer: string | null;
  accounting_required: boolean;
  establishment: string;
  emission_point: string;
  next_sequential: number;
  environment: string;
  emission_type: string;
  iva_rate: number;
  service_charge_rate: number;
  logo_url: string | null;
  operation_mode: OperationMode;
  setup_completed: boolean;
  monthly_goal: number;
  printer_kitchen: string;
  printer_grill: string;
  printer_pos: string;
  /** Ejemplares que se imprimen por cada orden o factura (por defecto 2). */
  printer_copies: number;
  branch_address: string;
  prep_limit_minutes: number;
  prep_limit_mesa: number;
  prep_limit_llevar: number;
  prep_limit_domicilio: number;

};


export const OPERATION_MODES = [
  {
    value: "rapida" as const,
    label: "Restaurante sin mesas",
    description: "Solo pestaña Punto de Venta. Pedido directo y cobro inmediato.",
  },
  {
    value: "restaurante" as const,
    label: "Restaurante con salón / mesas",
    description: "Pestañas Punto de Venta + Mapa de Mesas. Cuentas abiertas por mesa.",
  },
  {
    value: "patio" as const,
    label: "Restaurante de patio de comidas",
    description: "Vista simplificada sin mapa de mesas. Campo de etiqueta del pedido.",
  },
];


export const currency = (value: number) =>
  new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);

export const statusLabel: Record<OrderStatus, string> = {
  abierto: "Abierto",
  en_cocina: "En cocina",
  listo: "Listo",
  pagado: "Pagado",
  cancelado: "Cancelado",
};

export const itemStatusLabel: Record<ItemStatus, string> = {
  pendiente: "Pendiente",
  preparando: "Preparando",
  listo: "Listo",
  entregado: "Entregado",
};

export const docTypeLabel: Record<DocType, string> = {
  factura: "Factura electrónica SRI",
  nota_venta: "Orden / cuenta diaria interna",
  nota_debito: "Nota de débito electrónica SRI",
  nota_credito: "Nota de crédito electrónica SRI",
};

export const SALES_CHANNELS = [
  { value: "salon", label: "Salón" },
  { value: "llevar", label: "Para llevar" },
  { value: "domicilio", label: "Domicilio" },
  { value: "rappi", label: "Rappi" },
  { value: "pedidosya", label: "PedidosYa" },
  { value: "ubereats", label: "Uber Eats" },
  { value: "otro", label: "Otro" },
] as const;

/**
 * Formas de pago del control interno.
 *  · "transferencia"           → Transferencia Efectiva: el dinero ya está en la cuenta.
 *  · "transferencia_credito"   → Transferencia Crédito: acordada, el dinero aún NO llega.
 * Ante el SRI ambas viajan con el mismo código (sistema financiero nacional).
 */
export const PAYMENT_METHODS = [
  { value: "efectivo", label: "💵 Efectivo" },
  { value: "tarjeta", label: "💳 Tarjeta de Crédito / Débito" },
  { value: "transferencia", label: "🏦 Transferencia Efectiva" },
  { value: "transferencia_credito", label: "📄 Transferencia Crédito (por cobrar)" },
  { value: "credito", label: "🧾 Crédito (cuenta por cobrar)" },
  { value: "plataforma", label: "Pago de plataforma digital" },
  { value: "delivery", label: "🛵 Delivery" },
] as const;

/** Formas de pago que quedan como cuenta por cobrar (no entran al flujo de caja). */
export const CREDIT_PAYMENT_METHODS = ["credito", "transferencia_credito"] as const;

/** ¿La venta queda pendiente de cobro? */
export const esPagoCredito = (value: string | null | undefined) =>
  value === "credito" || value === "transferencia_credito";

/** ¿El dinero ya está disponible y por tanto entra al flujo de caja? */
export const ingresaEnFlujoDeCaja = (value: string | null | undefined) =>
  value === "efectivo" ||
  value === "tarjeta" ||
  value === "transferencia" ||
  value === "delivery" ||
  value === "plataforma";

/** Canal de venta configurable por el usuario (tabla sales_channels). */
export type SalesChannel = {
  id: string;
  value: string;
  label: string;
  sort_order: number;
  active: boolean;
};

/** Precio específico de un producto en un canal de venta. */
export type ProductChannelPrice = {
  id?: string;
  product_id: string;
  channel_value: string;
  price: number;
};

/** Convierte un nombre de canal escrito por el usuario en una clave estable. */
export const claveCanal = (label: string) =>
  label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

/**
 * Precio que corresponde al producto en el canal elegido.
 * Si el canal no tiene precio configurado, se usa el precio base del producto.
 */
export const precioPorCanal = (
  product: Pick<Product, "id" | "price">,
  channel: string | null | undefined,
  prices: ProductChannelPrice[],
): number => {
  const especial = prices.find((p) => p.product_id === product.id && p.channel_value === channel);
  const valor = especial ? Number(especial.price) : NaN;
  return Number.isFinite(valor) && valor > 0 ? valor : Number(product.price) || 0;
};

export const channelLabel = (value: string, canales: SalesChannel[] = []) =>
  canales.find((c) => c.value === value)?.label ??
  SALES_CHANNELS.find((c) => c.value === value)?.label ??
  value;


/** Etiqueta sin emoji, apta para tickets y reportes impresos. */
export const paymentLabel = (value: string | null) =>
  (PAYMENT_METHODS.find((p) => p.value === value)?.label ?? value ?? "")
    .replace(/[^\p{L}\p{N}()/.,\s-]/gu, "")
    .trim();

export const minutesSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

/**
 * Redondeo comercial a 2 decimales (medio arriba), inmune al error binario:
 * 0.945 -> 0.95 (Math.round directo devolvería 0.94).
 */
export function round2(value: number): number {
  const v = Number(value) || 0;
  const scaled = v * 100;
  // El epsilon compensa el error binario (94.49999999999999 -> 94.5 -> 95).
  const eps = scaled >= 0 ? 1e-9 : -1e-9;
  return Math.round(scaled + eps) / 100;
}

/**
 * Los precios de carta se capturan con IVA incluido (uso común en Ecuador).
 * La base se obtiene del total con IVA y el IVA se RECALCULA sobre esa base con
 * redondeo comercial (regla del SRI: base × tarifa = IVA). El total resultante
 * es base + IVA, y puede diferir en un centavo del bruto original.
 */
export function splitTax(totalWithTax: number, ivaRate: number) {
  const totalRounded = round2(totalWithTax);
  const base = round2(totalRounded / (1 + (Number(ivaRate) || 0) / 100));
  const tax = round2((base * (Number(ivaRate) || 0)) / 100);
  const total = round2(base + tax);
  return { base, tax, total };
}



/** Tiempo límite de preparación (minutos) según el tipo de pedido. */
export function prepLimitFor(
  company: Pick<
    CompanySettings,
    "prep_limit_minutes" | "prep_limit_mesa" | "prep_limit_llevar" | "prep_limit_domicilio"
  > | null,
  serviceType?: string | null,
): number {
  const general = Number(company?.prep_limit_minutes ?? 0) || 20;
  const porTipo =
    serviceType === "mesa"
      ? Number(company?.prep_limit_mesa ?? 0)
      : serviceType === "llevar"
        ? Number(company?.prep_limit_llevar ?? 0)
        : serviceType === "domicilio"
          ? Number(company?.prep_limit_domicilio ?? 0)
          : 0;
  return porTipo > 0 ? porTipo : general;
}
