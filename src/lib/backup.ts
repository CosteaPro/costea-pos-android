/**
 * Respaldo global de datos: exportación e importación de toda la información del
 * establecimiento. Nunca incluye la firma electrónica (.p12), su contraseña ni
 * las contraseñas de usuarios.
 */
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

export type Row = Record<string, unknown>;
export type BackupPayload = { manifest: Manifest; tables: Record<string, Row[]> };

export type Manifest = {
  app: "Costea POS";
  version: 1;
  exported_at: string;
  tables: Record<string, number>;
  images: number;
  xml_files: number;
  excluded: string[];
};

/** Orden de dependencias: los padres siempre antes que los hijos. */
export const BACKUP_TABLES = [
  "company_settings",
  "measurement_units",
  "categories",
  "products",
  "restaurant_tables",
  "customers",
  "suppliers",
  "inventory_categories",
  "inventory_items",
  "item_cost_history",
  "purchases",
  "purchase_items",
  "inventory_movements",
  "inventory_opening_balances",
  "inventory_day_closures",
  "orders",
  "order_items",
  "cash_closures",
  "delay_logs",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Columnas sensibles que jamás se exportan. */
const STRIP_COLUMNS: Record<string, string[]> = {
  company_settings: [],
};

const fetchAll = async (table: string): Promise<Row[]> => {
  const out: Row[] = [];
  const size = 1000;
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from(table as BackupTable)
      .select("*")
      .range(page * size, page * size + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  const strip = STRIP_COLUMNS[table] ?? [];
  return strip.length ? out.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !strip.includes(k)))) : out;
};

const safeName = (value: string) => value.replace(/[^\w.-]+/g, "_");

/** Genera el paquete .zip completo y lo descarga en el navegador. */
export async function exportBackupZip(onStep?: (msg: string) => void) {
  const zip = new JSZip();
  const datos = zip.folder("datos")!;
  const tables: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    onStep?.(`Exportando ${table}…`);
    const rows = await fetchAll(table);
    tables[table] = rows;
    counts[table] = rows.length;
    datos.file(`${table}.json`, JSON.stringify(rows, null, 2));
  }

  // Comprobantes electrónicos autorizados (XML firmado).
  onStep?.("Exportando comprobantes XML…");
  const xmlFolder = zip.folder("comprobantes")!;
  let xmlCount = 0;
  for (const o of tables["orders"] ?? []) {
    const xml = o["xml_signed"];
    if (typeof xml === "string" && xml.trim()) {
      const nombre = safeName(String(o["doc_number"] ?? o["id"]));
      xmlFolder.file(`${nombre}.xml`, xml);
      xmlCount += 1;
    }
  }

  // Imágenes de productos almacenadas en el bucket privado.
  onStep?.("Exportando imágenes…");
  const imgFolder = zip.folder("imagenes/productos")!;
  let images = 0;
  const { data: files } = await supabase.storage.from("productos").list("", { limit: 1000 });
  for (const f of files ?? []) {
    const { data: blob } = await supabase.storage.from("productos").download(f.name);
    if (blob) {
      imgFolder.file(f.name, blob);
      images += 1;
    }
  }

  const manifest: Manifest = {
    app: "Costea POS",
    version: 1,
    exported_at: new Date().toISOString(),
    tables: counts,
    images,
    xml_files: xmlCount,
    excluded: [
      "Firma electrónica (.p12/.pfx) y su contraseña",
      "Contraseñas y credenciales de usuarios",
    ],
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(
    "LEEME.txt",
    [
      "Respaldo completo de Costea POS.",
      "",
      "Incluye: comprobantes (facturas y notas de venta con su XML), maestros",
      "(clientes, proveedores, ítems con unidades, conversiones y costos, categorías,",
      "unidades de medida e imágenes), movimientos (compras, ventas, transferencias,",
      "bajas y consumos) y la configuración del establecimiento.",
      "",
      "NO incluye por seguridad: el archivo de firma electrónica (.p12/.pfx), su",
      "contraseña ni las contraseñas de los usuarios. Debes cargarlos manualmente",
      "en la versión nueva.",
    ].join("\n"),
  );

  onStep?.("Comprimiendo…");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `costea-respaldo-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
  return manifest;
}

/** Lee un paquete .zip de respaldo y devuelve los datos e imágenes. */
export async function readBackupZip(file: File) {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("El archivo no es un respaldo válido de Costea POS.");
  const manifest = JSON.parse(await manifestFile.async("string")) as Manifest;

  const tables: Record<string, Row[]> = {};
  for (const table of BACKUP_TABLES) {
    const f = zip.file(`datos/${table}.json`);
    tables[table] = f ? (JSON.parse(await f.async("string")) as Row[]) : [];
  }

  const images: { name: string; blob: Blob }[] = [];
  const imgFiles = zip.folder("imagenes/productos");
  if (imgFiles) {
    const entries: JSZip.JSZipObject[] = [];
    imgFiles.forEach((_p, entry) => {
      if (!entry.dir) entries.push(entry);
    });
    for (const entry of entries) {
      images.push({
        name: entry.name.split("/").pop() as string,
        blob: await entry.async("blob"),
      });
    }
  }

  return { manifest, tables, images };
}

/** Sube las imágenes del respaldo al almacenamiento sin sobrescribir las existentes. */
export async function restoreImages(images: { name: string; blob: Blob }[]) {
  let ok = 0;
  for (const img of images) {
    const { error } = await supabase.storage
      .from("productos")
      .upload(img.name, img.blob, { upsert: false });
    if (!error) ok += 1;
  }
  return ok;
}
