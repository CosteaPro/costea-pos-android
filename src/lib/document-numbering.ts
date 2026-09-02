import type { SriDocumentType, SequenceBlock } from "@/lib/document-numbering.functions";

type LocalBlock = SequenceBlock & { next: number; leased?: number };
type SharedSequence = {
  doc_type: "comprobante";
  establishment: string;
  emission_point: string;
  next: number;
  leased?: number;
  /** Marca de realineación: si no coincide, la caja obedece al servidor una vez. */
  aligned?: string;
};

/**
 * Realineación única: cada caja (navegador o app instalada) olvida el número
 * viejo guardado y adopta exactamente el de Configuración la primera vez que
 * ve esta versión. Después vuelve a regir "gana el más alto".
 */
export const ALIGN_VERSION = "2026-08-09-configuracion";
type StoredSale = { orden?: Record<string, unknown> };
const DB_NAME = "costea-pos-local";
const STORE = "sequences";
const SALES_STORE = "sales";
const SHARED_KEY = "comprobante";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sales")) db.createObjectStore("sales", { keyPath: "client_uid" });
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "doc_type" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la numeración local"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Error de almacenamiento local"));
  });
}

export async function hasAvailableSequence(docType: SriDocumentType) {
  const db = await openDb();
  const store = db.transaction(STORE, "readonly").objectStore(STORE);
  const [shared, block] = await Promise.all([
    requestResult(store.get(SHARED_KEY) as IDBRequest<SharedSequence | undefined>),
    requestResult(store.get(docType) as IDBRequest<LocalBlock | undefined>),
  ]);
  db.close();
  return Boolean(shared || block);
}

export async function saveSequenceBlock(block: SequenceBlock) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const current = await requestResult(store.get(block.doc_type) as IDBRequest<LocalBlock | undefined>);
  if (!current || (current.leased === undefined && current.next > current.last_sequential)) {
    store.put({ ...block, next: block.first_sequential } satisfies LocalBlock);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar la numeración"));
    tx.onabort = () => reject(tx.error ?? new Error("No se pudo guardar la numeración"));
  });
  db.close();
}

function trailingSequence(value: unknown) {
  const match = String(value ?? "").match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

/* ------------------------------------------------------------------ */
/* ÓRDENES: contador diario propio, totalmente separado de las facturas */
/* ------------------------------------------------------------------ */

type OrderCounter = { doc_type: "orden"; date: string; next: number };
const ORDER_KEY = "orden";

/** Fecha contable de Ecuador (UTC-5) en formato AAAA-MM-DD. */
function fechaEc() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Formato visible de la orden del día: ORDEN-0001 */
export function formatOrderNumber(n: number) {
  return `ORDEN-${String(Math.max(1, Math.floor(n))).padStart(4, "0")}`;
}

async function readOrderCounter(): Promise<number> {
  const db = await openDb();
  const store = db.transaction(STORE, "readonly").objectStore(STORE);
  const row = await requestResult(store.get(ORDER_KEY) as IDBRequest<OrderCounter | undefined>);
  db.close();
  if (!row || row.date !== fechaEc()) return 1;
  return Math.max(1, row.next);
}

/** Próxima orden del día, sin consumirla. Reinicia en 1 cada día. */
export function peekDailyOrderNumber() {
  return readOrderCounter();
}

/** Toma la orden del día y deja lista la siguiente. */
export async function takeDailyOrderNumber(): Promise<number> {
  const date = fechaEc();
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite", { durability: "strict" });
  const store = tx.objectStore(STORE);
  const row = await requestResult(store.get(ORDER_KEY) as IDBRequest<OrderCounter | undefined>);
  const actual = !row || row.date !== date ? 1 : Math.max(1, row.next);
  store.put({ doc_type: ORDER_KEY, date, next: actual + 1 } satisfies OrderCounter);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar el número de orden"));
    tx.onabort = () => reject(tx.error ?? new Error("No se pudo guardar el número de orden"));
  });
  db.close();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("costea:orden"));
  return actual;
}

/** Al cerrar caja el contador de órdenes vuelve a 0: mañana empieza en 1. */
export async function resetDailyOrderCounter() {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite", { durability: "strict" });
  tx.objectStore(STORE).put({ doc_type: ORDER_KEY, date: fechaEc(), next: 1 } satisfies OrderCounter);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo reiniciar el contador de órdenes"));
    tx.onabort = () => reject(tx.error ?? new Error("No se pudo reiniciar el contador de órdenes"));
  });
  db.close();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("costea:orden"));
}


/** Formato oficial: 001-001-000000427 */
export function formatDocNumber(establishment: string, emissionPoint: string, sequential: number) {
  const pad = (v: string, n: number) => String(v).replace(/\D/g, "").padStart(n, "0").slice(-n);
  return `${pad(establishment, 3)}-${pad(emissionPoint, 3)}-${String(sequential).padStart(9, "0")}`;
}

/**
 * Lee (sin consumir) el próximo comprobante guardado en esta computadora.
 * Es exactamente el número que tomaría la siguiente venta. `aligned` indica si
 * esta caja ya se realineó con Configuración.
 */
export async function peekLocalSequence(): Promise<
  { establishment: string; emission_point: string; sequential: number; aligned: boolean } | null
> {
  const db = await openDb();
  const tx = db.transaction([STORE, SALES_STORE], "readonly");
  const [storedSequences, sales] = await Promise.all([
    requestResult(tx.objectStore(STORE).getAll() as IDBRequest<Array<LocalBlock | SharedSequence>>),
    requestResult(tx.objectStore(SALES_STORE).getAll() as IDBRequest<StoredSale[]>),
  ]);
  db.close();
  const shared = storedSequences.find((row): row is SharedSequence => row.doc_type === SHARED_KEY);
  const source = shared ?? storedSequences.find((row): row is LocalBlock => row.doc_type !== SHARED_KEY);
  if (!source) return null;
  const aligned = shared?.aligned === ALIGN_VERSION;
  if (shared && aligned) {
    return {
      establishment: shared.establishment,
      emission_point: shared.emission_point,
      sequential: Math.max(shared.leased ?? shared.next, 1),
      aligned: true,
    };
  }
  const highestSale = sales.reduce(
    (highest, sale) => Math.max(highest, trailingSequence(sale.orden?.["doc_number"])),
    0,
  );
  const legacyStart = !shared && highestSale === 0 && "first_sequential" in source ? source.first_sequential - 1 : 0;
  const highestStored = Math.max(shared ? shared.next - 1 : 0, shared?.leased ?? 0, legacyStart);
  return {
    establishment: source.establishment,
    emission_point: source.emission_point,
    sequential: shared?.leased ?? Math.max(highestSale, highestStored) + 1,
    aligned: false,
  };
}

/**
 * Conciliación: gana el número MÁS ALTO. Se compara lo que dice Configuración
 * con lo que alcanzó esta caja (facturas emitidas sin internet incluidas) y
 * ambas quedan en ese valor. Nunca retrocede.
 *
 * EXCEPCIÓN ÚNICA: si la caja todavía no se realineó (número viejo guardado),
 * se olvida ese número y se toma EXACTAMENTE el de Configuración.
 */
export async function applyServerSequence(peek: {
  establishment: string;
  emission_point: string;
  next_sequential: number;
}): Promise<{ establishment: string; emission_point: string; sequential: number; localWins: boolean }> {
  const db = await openDb();
  const tx = db.transaction([STORE, SALES_STORE], "readwrite", { durability: "strict" });
  const store = tx.objectStore(STORE);
  const [storedSequences, current, sales] = await Promise.all([
    requestResult(store.getAll() as IDBRequest<Array<LocalBlock | SharedSequence>>),
    requestResult(store.get(SHARED_KEY) as IDBRequest<SharedSequence | undefined>),
    requestResult(tx.objectStore(SALES_STORE).getAll() as IDBRequest<StoredSale[]>),
  ]);
  const yaAlineada = current?.aligned === ALIGN_VERSION;
  const highestSale = sales.reduce(
    (highest, sale) => Math.max(highest, trailingSequence(sale.orden?.["doc_number"])),
    0,
  );
  const servidor = Math.max(Math.floor(Number(peek.next_sequential) || 0), 1);
  const localNext = yaAlineada
    ? Math.max(current?.leased ?? 0, current?.next ?? 0, 1)
    : Math.max(current?.leased ?? 0, current?.next ?? 0, highestSale + 1, 1);
  const ganador = yaAlineada ? Math.max(localNext, servidor) : servidor;
  const establishment = peek.establishment || current?.establishment || "001";
  const emission_point = peek.emission_point || current?.emission_point || "001";
  if (!yaAlineada) {
    // Se borran bloques viejos para que ningún número anterior vuelva a usarse.
    for (const row of storedSequences) {
      if (String(row.doc_type) !== SHARED_KEY && String(row.doc_type) !== ORDER_KEY) store.delete(row.doc_type);
    }
  }
  store.put({
    doc_type: SHARED_KEY,
    establishment,
    emission_point,
    next: ganador,
    aligned: ALIGN_VERSION,
    ...(yaAlineada && current?.leased !== undefined && current?.leased !== null ? { leased: ganador } : {}),
  } satisfies SharedSequence);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar la numeración del servidor"));
    tx.onabort = () => reject(tx.error ?? new Error("No se pudo guardar la numeración del servidor"));
  });
  db.close();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("costea:numeracion"));
  return { establishment, emission_point, sequential: ganador, localWins: ganador > servidor };
}

/**
 * Conciliación completa contra el servidor: lee Configuración, compara con esta
 * caja, gana el más alto y, si la caja iba más adelante, sube ese número a
 * Configuración para que todas las cajas queden iguales.
 */
export async function reconcileSequence(
  peekServer: () => Promise<{ establishment: string; emission_point: string; next_sequential: number }>,
  commitServer: (sequential: number) => Promise<unknown>,
) {
  const remoto = await peekServer();
  const conciliado = await applyServerSequence(remoto);
  if (conciliado.localWins) {
    // commitDocumentSequence guarda "emitido + 1": se envía el anterior.
    try {
      await commitServer(Math.max(conciliado.sequential - 1, 0));
    } catch {
      /* si Configuración no responde, se reintenta en el próximo ciclo */
    }
  }
  return conciliado;
}




/**
 * Toma el siguiente número del único contador de comprobantes del equipo.
 * La búsqueda del máximo y el arrendamiento ocurren en la misma transacción,
 * por lo que factura y nota de venta nunca pueden tomar el mismo número.
 */
export async function takeLocalSequence(
  _docType: SriDocumentType | "nota_venta",
  location?: { establishment: string; emission_point: string },
) {
  const db = await openDb();
  const tx = db.transaction([STORE, SALES_STORE], "readwrite", { durability: "strict" });
  const sequenceStore = tx.objectStore(STORE);
  const [storedSequences, sales] = await Promise.all([
    requestResult(sequenceStore.getAll() as IDBRequest<Array<LocalBlock | SharedSequence>>),
    requestResult(tx.objectStore(SALES_STORE).getAll() as IDBRequest<StoredSale[]>),
  ]);
  const shared = storedSequences.find((row): row is SharedSequence => row.doc_type === SHARED_KEY);
  const source = shared ?? storedSequences.find((row): row is LocalBlock => row.doc_type !== SHARED_KEY);
  const establishment = location?.establishment || source?.establishment;
  const emissionPoint = location?.emission_point || source?.emission_point;
  if (!establishment || !emissionPoint) {
    tx.abort();
    db.close();
    return null;
  }
  const alineada = shared?.aligned === ALIGN_VERSION;
  const highestSale = sales.reduce(
    (highest, sale) => Math.max(highest, trailingSequence(sale.orden?.["doc_number"])),
    0,
  );
  const legacyStart = !shared && highestSale === 0 && source && "first_sequential" in source
    ? source.first_sequential - 1
    : 0;
  const highestStored = Math.max(shared ? shared.next - 1 : 0, shared?.leased ?? 0, legacyStart);
  const sequential =
    shared && alineada
      ? Math.max(shared.leased ?? shared.next, 1)
      : (shared?.leased ?? Math.max(highestSale, highestStored) + 1);
  const result = {
    establishment,
    emission_point: emissionPoint,
    sequential,
  };
  // El número queda reservado, pero no se consume hasta que la venta se escribe
  // en la misma transacción IndexedDB. Si la app se cierra, se reutiliza.
  sequenceStore.put({
    doc_type: SHARED_KEY,
    establishment,
    emission_point: emissionPoint,
    next: sequential,
    leased: sequential,
    ...(alineada ? { aligned: ALIGN_VERSION } : {}),
  } satisfies SharedSequence);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo confirmar el número local"));
    tx.onabort = () => reject(tx.error ?? new Error("No se pudo confirmar el número local"));
  });
  db.close();
  return result;
}