/**
 * Exportación .xlsx compatible con Costea Pro (VBA).
 * Hojas exactas: ListaRecetas, VentaProducto, VENTAS.
 */
import * as XLSX from "xlsx";
import type { OrderWithItems, Product, Category, SriStatus } from "@/lib/pos";
import { paymentLabel, SRI_STATUS_LABEL } from "@/lib/pos";

/** Partes de fecha/hora fijadas a la zona horaria oficial de Ecuador (UTC-5). */
const partesEC = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
  return { ...v, hour: v.hour === "24" ? "00" : v.hour } as Record<string, string>;
};

/** dd/mm/aaaa */
export const fechaEC = (iso: string) => {
  const p = partesEC(iso);
  return `${p.day}/${p.month}/${p.year}`;
};

export const horaEC = (iso: string) => {
  const p = partesEC(iso);
  return `${p.hour}:${p.minute}:${p.second}`;
};

/** Separador de miles punto y decimal coma: 1.234,56 */
export const montoEC = (value: number) =>
  new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0,
  );

const fechaHora = (iso: string) => `${fechaEC(iso)} ${horaEC(iso)}`;

export function buildCosteaWorkbook({
  orders,
  products,
  categories,
}: {
  orders: OrderWithItems[];
  products: Product[];
  categories: Category[];
}) {
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const byId = new Map(products.map((p) => [p.id, p]));
  const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
  const codeFor = (productId: string | null | undefined, name: string) => {
    const prod =
      (productId ? byId.get(productId) : undefined) ?? byName.get(name.trim().toLowerCase());
    return prod;
  };
  const book = XLSX.utils.book_new();

  // ── Hoja ListaRecetas: encabezados fila 6, datos desde fila 7
  const recetas: (string | number)[][] = [
    [],
    [],
    [],
    [],
    [],
    ["Codigo", "Descripcion", "Categoria"],
    ...products.map((p) => [
      p.code ?? "",
      p.name,
      p.category_id ? (catName.get(p.category_id) ?? "") : "",
    ]),
  ];
  const wsRecetas = XLSX.utils.aoa_to_sheet(recetas);
  wsRecetas["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(book, wsRecetas, "ListaRecetas");

  // ── Hoja VentaProducto: encabezados fila 6, datos desde fila 7
  const ventaProducto: (string | number)[][] = [
    [],
    [],
    [],
    [],
    [],
    [
      "lblFechaHora",
      "Codigo",
      "Descripcion",
      "Categoria",
      "Unidades",
      "PVN",
      "Sub Total",
      "IVA",
      "Total$",
      "Orden",
      "Estado",
    ],
  ];
  orders.forEach((o) => {
    const rate = Number(o.iva_rate ?? 15);
    o.order_items.forEach((i) => {
      const prod = codeFor(i.product_id, i.product_name);
      const total = Number(i.unit_price) * i.quantity;
      const sub = total / (1 + rate / 100);
      const iva = total - sub;
      ventaProducto.push([
        fechaHora(o.created_at),
        prod?.code ?? `S/C-${i.product_name.trim().slice(0, 12).toUpperCase()}`,
        i.product_name,
        prod?.category_id ? (catName.get(prod.category_id) ?? "") : "",
        i.quantity,
        montoEC(sub / i.quantity),
        montoEC(sub),
        montoEC(iva),
        montoEC(total),
        o.doc_number ?? String(o.folio),
        o.status === "pagado" ? "PAGADO" : o.status.toUpperCase(),
      ]);
    });
  });
  const wsVentaProducto = XLSX.utils.aoa_to_sheet(ventaProducto);
  wsVentaProducto["!cols"] = [
    { wch: 20 },
    { wch: 12 },
    { wch: 34 },
    { wch: 20 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(book, wsVentaProducto, "VentaProducto");

  // ── Hoja VENTAS: encabezados fila 1, datos desde fila 2
  const ventas: (string | number)[][] = [
    [
      "Orden",
      "Fecha",
      "Hora",
      "Nombre Cliente",
      "Ruc/CI/Pass",
      "Nro. Comprobante",
      "Clave Sri",
      "Autorizacion",
      "Sub Total",
      "Iva 15%",
      "Total",
      "Metodo de Pago",
      "Estado",
    ],
    ...orders.map((o) => [
      o.doc_number ?? String(o.folio),
      fechaEC(o.created_at),
      horaEC(o.created_at),
      o.customer_name ?? "CONSUMIDOR FINAL",
      o.customer_id_number ?? "9999999999999",
      o.doc_number ?? "",
      o.access_key ?? "",
      o.access_key ?? "",
      montoEC(Number(o.subtotal ?? 0)),
      montoEC(Number(o.tax_amount ?? 0)),
      montoEC(Number(o.total ?? 0)),
      paymentLabel(o.payment_method),
      o.status === "pagado" ? "PAGADO" : o.status.toUpperCase(),
    ]),
  ];
  const wsVentas = XLSX.utils.aoa_to_sheet(ventas);
  wsVentas["!cols"] = [
    { wch: 16 },
    { wch: 12 },
    { wch: 10 },
    { wch: 28 },
    { wch: 16 },
    { wch: 20 },
    { wch: 52 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(book, wsVentas, "VENTAS");

  // ── Hoja Comprobantes: trazabilidad tributaria (no la lee Costea Pro, es respaldo interno)
  const comprobantes: (string | number)[][] = [
    [
      "Fecha",
      "Hora",
      "Tipo comprobante",
      "Nro. Comprobante",
      "Clave de acceso (49)",
      "Nro. Autorizacion",
      "Estado SRI",
      "Detalle SRI",
      "Estado comprobante",
      "Motivo anulacion",
      "Cliente",
      "Identificacion",
      "Sub Total",
      "IVA",
      "Total",
      "Forma de pago",
      "Canal",
    ],
    ...orders.map((o) => [
      fechaEC(o.created_at),
      horaEC(o.created_at),
      o.doc_type === "factura" ? "FACTURA ELECTRONICA" : o.doc_type === "nota_debito" ? "NOTA DE DEBITO ELECTRONICA" : o.doc_type === "nota_credito" ? "NOTA DE CREDITO ELECTRONICA" : "NOTA DE VENTA (INTERNO)",
      o.doc_number ?? `NV-${String(o.folio).padStart(8, "0")}`,
      o.access_key ?? "",
      o.authorization_number ?? "",
      SRI_STATUS_LABEL[(o.sri_status ?? "no_aplica") as SriStatus],
      o.sri_message ?? "",
      o.doc_status === "anulado" ? "ANULADO" : "EMITIDO",
      o.void_reason ?? "",
      o.customer_name ?? "CONSUMIDOR FINAL",
      o.customer_id_number ?? "9999999999999",
      montoEC(Number(o.subtotal ?? 0)),
      montoEC(Number(o.tax_amount ?? 0)),
      montoEC(Number(o.total ?? 0)),
      paymentLabel(o.payment_method),
      o.sales_channel ?? "",
    ]),
  ];
  const wsComprobantes = XLSX.utils.aoa_to_sheet(comprobantes);
  wsComprobantes["!cols"] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 24 },
    { wch: 20 },
    { wch: 52 },
    { wch: 20 },
    { wch: 22 },
    { wch: 40 },
    { wch: 18 },
    { wch: 30 },
    { wch: 28 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(book, wsComprobantes, "Comprobantes");

  return book;
}
