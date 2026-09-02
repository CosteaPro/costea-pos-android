import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Minus,
  Plus,
  Printer,
  Search,
  SlidersHorizontal,
  Trash2,
  Send,
  ShoppingCart,
  Calculator,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ProductImage } from "@/components/ProductImage";
import { MobileWaiter } from "@/components/MobileWaiter";

import { CheckoutDialog, type CheckoutResult } from "@/components/CheckoutDialog";
import { emitirFacturaSri } from "@/lib/sri.functions";
import { emitirFacturaCajaLocal, esCajaLocal, puenteCaja } from "@/lib/caja-local";
import { descontarInventarioPorVenta } from "@/lib/sales-consumption";
import { buscarPedidoAbierto } from "@/lib/mesa-abierta";



import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompany } from "@/hooks/useCompany";
import { useRole } from "@/hooks/useRole";
import { useDayLock } from "@/hooks/useDayLock";
import { printComanda } from "@/lib/print";
import { printReceipt } from "@/lib/receipt";
import {
  ProductOptionsDialog,
  opcionesPorDefecto,
  type OpcionDisponible,
} from "@/components/ProductOptionsDialog";
import { useSalesChannels } from "@/hooks/useSalesChannels";
import { useProgressiveList } from "@/hooks/useProgressiveList";
import {
  currency,
  paymentLabel,
  precioPorCanal,
  splitTax,
  type CartOption,
  type Category,
  type PrintArea,
  type Product,
  type ProductOption,
  type ProductRecipeVariant,
  type RecipeVariant,
  type RestaurantTable,

} from "@/lib/pos";



type Search = { order?: string; table?: string };

/** Convierte cualquier error (Error, PostgrestError, objeto) en un texto legible y específico. */
function detalleError(e: unknown): string {
  if (!e) return "Error desconocido";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const partes = [o["message"], o["details"], o["hint"], o["code"]].filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    if (partes.length > 0) return partes.join(" · ");
    try {
      return JSON.stringify(e);
    } catch {
      return "Error desconocido";
    }
  }
  return String(e);
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    order: typeof search.order === "string" ? search.order : undefined,
    table: typeof search.table === "string" ? search.table : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Punto de venta | Costea POS para restaurantes en Ecuador" },
      {
        name: "description",
        content:
          "Toma pedidos por mesa, envía comandas a cocina y cobra con factura electrónica SRI o nota de venta.",
      },
      { property: "og:title", content: "Punto de venta | Costea POS" },
      {
        property: "og:description",
        content: "Pedidos, mesas y cobro con factura electrónica SRI para restaurantes en Ecuador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosRoute,
});

/** Bandera para enviar a cada rol a su pantalla solo la primera vez de la sesión. */
const INICIO_ROL_KEY = "costea.inicio-rol";
/** Última forma de trabajo elegida por el usuario (no depende del dispositivo). */
const MODO_POS_KEY = "costea.modo-pos";

type ModoPos = "caja" | "mesero";

/** El dispositivo no define nada: manda el rol y la elección del usuario. */
function PosRoute() {
  const navigate = useNavigate();
  const { homePath, loading: loadingRole, resuelto: rolResuelto, can } = useRole();
  const [redirigiendo, setRedirigiendo] = useState(false);
  const [modo, setModo] = useState<ModoPos | null>(null);
  const [modoLeido, setModoLeido] = useState(false);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(MODO_POS_KEY);
      if (guardado === "caja" || guardado === "mesero") setModo(guardado);
    } catch {
      /* sin almacenamiento se pregunta cada vez */
    }
    setModoLeido(true);
  }, []);

  const elegir = (valor: ModoPos) => {
    setModo(valor);
    try {
      localStorage.setItem(MODO_POS_KEY, valor);
    } catch {
      /* la elección vale al menos para esta visita */
    }
  };

  // Al abrir la aplicación en la raíz, cada rol entra a su pantalla inicial.
  // Solo se marca "ya entró" cuando la pantalla asignada está confirmada, para
  // no quemar la bandera con el valor por defecto mientras cargan los permisos.
  useEffect(() => {
    if (loadingRole || !rolResuelto) return;
    let yaEntro = true;
    try {
      yaEntro = sessionStorage.getItem(INICIO_ROL_KEY) === "1";
      sessionStorage.setItem(INICIO_ROL_KEY, "1");
    } catch {
      /* sin sessionStorage no se redirige */
    }
    if (!yaEntro && homePath !== "/") {
      setRedirigiendo(true);
      navigate({ to: homePath, replace: true });
    }
  }, [loadingRole, rolResuelto, homePath, navigate]);

  if (loadingRole || redirigiendo || !modoLeido) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }

  const puedeCaja = can.cobrar;
  const puedeMesero = can.tomarPedidos;
  const ambos = puedeCaja && puedeMesero;
  const modoActivo: ModoPos = ambos ? (modo ?? "caja") : puedeCaja ? "caja" : "mesero";

  // Con permiso para las dos formas de trabajo, el usuario elige; nunca el dispositivo.
  if (ambos && !modo) {
    return (
      <AppShell>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-8">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold">¿Cómo vas a trabajar ahora?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Puedes cambiar de forma de trabajo cuando quieras.
            </p>
          </div>
          <button
            type="button"
            onClick={() => elegir("caja")}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5 text-left transition-colors hover:border-primary"
          >
            <Calculator className="size-9 shrink-0 text-primary" />
            <span>
              <span className="block font-display text-lg font-semibold">Modo Caja</span>
              <span className="block text-sm text-muted-foreground">Facturación y ventas</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => elegir("mesero")}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5 text-left transition-colors hover:border-primary"
          >
            <LayoutGrid className="size-9 shrink-0 text-primary" />
            <span>
              <span className="block font-display text-lg font-semibold">Modo Mesero</span>
              <span className="block text-sm text-muted-foreground">Mesas y comandas</span>
            </span>
          </button>
        </div>
      </AppShell>
    );
  }

  const cambiar = ambos ? (
    <button
      type="button"
      onClick={() => {
        setModo(null);
        try {
          localStorage.removeItem(MODO_POS_KEY);
        } catch {
          /* sin almacenamiento igual se vuelve a preguntar */
        }
      }}
      className="fixed bottom-3 left-3 z-40 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-lg hover:text-foreground"
    >
      Cambiar modo
    </button>
  ) : null;

  if (modoActivo === "mesero")
    return (
      <>
        <MobileWaiter />
        {cambiar}
      </>
    );

  return (
    <AppShell>
      <PosScreen />
      {cambiar}
    </AppShell>
  );
}


type CartLine = {
  /** Identificador de la línea en pantalla (un mismo plato puede repetirse con otras opciones). */
  uid: string;
  /** Id de la fila ya guardada en el pedido (si aplica). */
  item_id?: string;
  /** Estado de cocina de la fila ya guardada: pendiente | preparando | listo | entregado. */
  item_status?: string;
  product_id: string;
  name: string;
  price: number;
  qty: number;
  notes: string;
  print_area: PrintArea;
  /** Receta variante elegida (nulo = el producto se vende con su propia receta). */
  recipe_id?: string | null;
  /** Código realmente vendido: el del producto o el de la variante. */
  item_code?: string | null;
  /** Modificadores (sin costo) y agregadores (con precio) elegidos para esta línea. */
  options: CartOption[];
};


let contadorLinea = 0;
const nuevoUid = () => `l${++contadorLinea}`;

/** Precio de la línea: plato base + agregadores. */
const precioLinea = (l: CartLine) =>
  l.price + l.options.reduce((s, o) => s + (Number(o.price) || 0) * (Number(o.qty) || 1), 0);



function PosScreen() {
  const navigate = useNavigate();
  const { order: orderParam, table: tableParam } = Route.useSearch();
  const { company } = useCompany();
  const { can } = useRole();
  const { locked: dayLocked } = useDayLock();
  const { channels: salesChannels, prices: channelPrices } = useSalesChannels();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  /** Recetas apuntadas por cada producto como variantes. */
  const [recipeLinks, setRecipeLinks] = useState<ProductRecipeVariant[]>([]);
  const [recipes, setRecipes] = useState<RecipeVariant[]>([]);
  const [personalizar, setPersonalizar] = useState<Product | null>(null);


  const [activeCat, setActiveCat] = useState<string>("all");
  const [query, setQuery] = useState("");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableId, setTableId] = useState<string>("");
  const [serviceType, setServiceType] = useState("mesa");
  const [channel, setChannel] = useState("salon");
  const [customerName, setCustomerName] = useState("");
  const [orderLabel, setOrderLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [orderId, setOrderId] = useState<string | null>(orderParam ?? null);
  const [orderFolio, setOrderFolio] = useState<number | null>(null);
  const [guests, setGuests] = useState("");
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  const [sentTotal, setSentTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const lastErrorRef = useRef<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [menuDesactualizado, setMenuDesactualizado] = useState(false);
  /** Foto local de la caja si ya está descargada; si no, la del servidor. */
  const fotoProducto = (p: Product) => {
    const local = (p as unknown as Record<string, unknown>)["imagen_local"];
    return typeof local === "string" && local ? `costea-img://${local}` : p.image_url;
  };

  const loadCatalog = useCallback(async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      const puente = puenteCaja();
      if (puente) {
        // La caja lee SIEMPRE del almacenamiento local: menú y fotos ya están
        // en este computador. Solo se descarga si todavía no hay catálogo.
        try {
          const local = await puente.leerCatalogo();
          if (local) {
            setCategories((local["categorias"] as Category[]) ?? []);
            setProducts((local["productos"] as Product[]) ?? []);
            setTables((local["mesas"] as RestaurantTable[]) ?? []);
            setProductOptions((local["opciones"] as ProductOption[]) ?? []);
          } else {
            const actualizado = await puente.descargarCatalogo();
            setCategories((actualizado["categorias"] as Category[]) ?? []);
            setProducts((actualizado["productos"] as Product[]) ?? []);
            setTables((actualizado["mesas"] as RestaurantTable[]) ?? []);
      setProductOptions((actualizado["opciones"] as ProductOption[]) ?? []);
          }
          setMenuDesactualizado(false);
        } catch (error) {
          setCatalogError(detalleError(error));
        } finally {
          setCatalogLoading(false);
        }
        return;
      }
      try {
        const [cats, prods, tbls, opts, links, recs] = await Promise.all([
          supabase.from("categories").select("*").order("sort_order"),
          supabase.from("products").select("*").order("name"),
          supabase.from("restaurant_tables").select("*").order("sort_order"),
          supabase.from("product_options").select("*").order("sort_order"),
          supabase.from("product_recipe_variants").select("*").order("sort_order"),
          supabase.from("recipes").select("id, code, name, sale_price").eq("kind", "plato"),
        ]);
        setCategories((cats.data as Category[]) ?? []);
        setProducts((prods.data as Product[]) ?? []);
        setTables((tbls.data as RestaurantTable[]) ?? []);
        setProductOptions((opts.data as ProductOption[]) ?? []);
        setRecipeLinks((links.data as ProductRecipeVariant[]) ?? []);
        setRecipes((recs.data as RecipeVariant[]) ?? []);

      } catch (error) {
        setCatalogError(detalleError(error));
        toast.error("Sin conexión — no se pudo cargar el catálogo");
      } finally {
        setCatalogLoading(false);
      }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  /** Descarga el menú nuevo solo cuando el cajero lo pide. */
  const sincronizarMenu = useCallback(async () => {
    const puente = puenteCaja();
    if (!puente) return;
    try {
      const actualizado = await puente.descargarCatalogo();
      setCategories((actualizado["categorias"] as Category[]) ?? []);
      setProducts((actualizado["productos"] as Product[]) ?? []);
      setTables((actualizado["mesas"] as RestaurantTable[]) ?? []);
      setProductOptions((actualizado["opciones"] as ProductOption[]) ?? []);
      setMenuDesactualizado(false);
      toast.success("Menú actualizado en esta caja");
    } catch (error) {
      toast.error(detalleError(error));
    }
  }, []);

  /** Consulta discreta: avisa si hay cambios, nunca actualiza sola. */
  useEffect(() => {
    const puente = puenteCaja();
    if (!puente?.actualizacionesCatalogo) return;
    let vivo = true;
    const revisar = async () => {
      try {
        const r = await puente.actualizacionesCatalogo!();
        if (vivo && r?.hay) setMenuDesactualizado(true);
      } catch {
        /* sin conexión: se sigue trabajando con lo local */
      }
    };
    void revisar();
    const id = setInterval(revisar, 10 * 60_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);



  const loadOrder = useCallback(async (id: string) => {
    const [{ data }, { data: items }] = await Promise.all([
      supabase.from("orders").select("*").eq("id", id).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", id).order("created_at"),
    ]);
    if (!data) return;
    setOrderFolio(data.folio);
    setTableId(data.table_id ?? "");
    setServiceType(data.service_type);
    setChannel(data.sales_channel ?? "salon");
    setCustomerName(data.customer_name ?? "");
    setOrderLabel(data.order_label ?? "");
    setNotes(data.notes ?? "");
    setGuests(data.guests ? String(data.guests) : "");
    setSentTotal(0);
    setRemovedItemIds([]);
    // Los modificadores y agregadores llegan como filas hijas del plato.
    const filas = items ?? [];
    const hijas = filas.filter((i) => i.parent_item_id);
    setCart(
      filas
        .filter((i) => !i.parent_item_id)
        .map((i) => ({
          uid: nuevoUid(),
          item_id: i.id,
          item_status: i.status as string,
          product_id: i.product_id ?? i.id,
          name: i.product_name,
          price: Number(i.unit_price),
          qty: Number(i.quantity),
          notes: i.notes ?? "",
          print_area: "cocina" as PrintArea,
          recipe_id: i.recipe_id ?? null,
          item_code: i.item_code ?? null,

          options: hijas
            .filter((h) => h.parent_item_id === i.id)
            .map((h) => ({
              product_id: h.product_id ?? h.id,
              code: null,
              name: h.product_name,
              price: Number(h.unit_price),
              kind: (h.option_kind === "agregador" ? "agregador" : "modificador") as CartOption["kind"],
              print_area: "cocina" as PrintArea,
              qty: Math.max(1, Math.round(Number(h.quantity) / Math.max(1, Number(i.quantity)))),
            })),
        })),
    );

  }, []);

  useEffect(() => {
    if (orderParam) {
      setOrderId(orderParam);
      loadOrder(orderParam);
    }
  }, [orderParam, loadOrder]);

  useEffect(() => {
    if (tableParam && !orderParam) {
      setServiceType("mesa");
      setTableId(tableParam);
    }
  }, [tableParam, orderParam]);

  /**
   * Mesa abierta = se vuelve a abrir la MISMA cuenta.
   * Al elegir una mesa que ya tiene comanda del día (no cobrada), se cargan
   * los productos que ya pidió y lo nuevo se suma a esa misma cuenta.
   */
  useEffect(() => {
    if (esCajaLocal()) return;
    if (orderId || serviceType !== "mesa" || !tableId) return;
    let cancelado = false;
    (async () => {
      const abierta = await buscarPedidoAbierto(tableId);
      if (cancelado || !abierta) return;
      const pendientes = cart.filter((l) => !l.item_id);
      setOrderId(abierta.id);
      await loadOrder(abierta.id);
      if (cancelado) return;
      if (pendientes.length > 0) setCart((prev) => [...prev, ...pendientes]);
      toast.info(`Mesa con cuenta abierta #${abierta.folio} — puedes agregar más productos`);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, orderId, serviceType, loadOrder]);

  const visible = useMemo(
    () =>
      products.filter(
        (p) =>
          p.available &&
          !categories.some(
            (c) => c.id === p.category_id && (c.kind === "modificador" || c.kind === "agregador"),
          ) &&
          (activeCat === "all" || p.category_id === activeCat) &&
          `${p.name} ${p.code ?? ""}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [products, categories, activeCat, query],
  );

  // Carga diferida: se pintan primero los platillos visibles y el resto al hacer scroll.
  const {
    rendered: visibleRender,
    hasMore: hayMasProductos,
    sentinelRef: sentinelProductos,
  } = useProgressiveList(visible, 24);

  const withTables = (company?.operation_mode ?? "restaurante") === "restaurante";
  const isPatio = (company?.operation_mode ?? "restaurante") === "patio";

  useEffect(() => {
    if (!withTables && serviceType === "mesa") {
      setServiceType("llevar");
      setTableId("");
    }
  }, [withTables, serviceType]);

  const cartTotal = cart.reduce((sum, l) => sum + precioLinea(l) * l.qty, 0);
  const ticketTotal = sentTotal + cartTotal;
  const ivaRate = company?.iva_rate ?? 15;
  const { base, tax, total: ticketTotalIva } = splitTax(ticketTotal, ivaRate);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  /** Modificadores y agregadores configurados para cada platillo. */
  const opcionesDe = useCallback(
    (productId: string): OpcionDisponible[] =>
      productOptions
        .filter((o) => o.product_id === productId)
        .map((o) => ({
          kind: o.kind,
          default_selected: o.default_selected,
          producto: products.find((p) => p.id === o.option_product_id),
        }))
        .filter((o): o is OpcionDisponible => Boolean(o.producto)),
    [productOptions, products],
  );

  /** Recetas que este producto apunta como variantes (vacío = solo la suya). */
  const variantesDe = useCallback(
    (productId: string): RecipeVariant[] =>
      recipeLinks
        .filter((v) => v.product_id === productId)
        .map((v) => recipes.find((r) => r.id === v.recipe_id))
        .filter((r): r is RecipeVariant => Boolean(r)),
    [recipeLinks, recipes],
  );

  const mismasOpciones = (a: CartOption[], b: CartOption[]) =>
    a.length === b.length &&
    a.every((o) => b.some((x) => x.product_id === o.product_id && x.qty === o.qty));

  /** Precio del producto en el canal activo (o el base si el canal no tiene precio). */
  const precioActual = useCallback(
    (p: Pick<Product, "id" | "price">) => precioPorCanal(p, channel, channelPrices),
    [channel, channelPrices],
  );

  const add = (
    p: Product,
    options: CartOption[] = [],
    nota = "",
    variante: RecipeVariant | null = null,
  ) => {
    const opcionesConPrecio = options.map((o) =>
      o.kind === "agregador"
        ? { ...o, price: precioPorCanal({ id: o.product_id, price: o.price }, channel, channelPrices) }
        : o,
    );
    // La variante sustituye por completo al producto: nombre, código y precio.
    const nombre = variante ? variante.name : p.name;
    const precio = variante ? Number(variante.sale_price) || 0 : precioActual(p);
    const codigo = variante ? variante.code : p.code;
    setCart((prev) => {
      const found = prev.find(
        (l) =>
          l.product_id === p.id &&
          !l.item_id &&
          (l.recipe_id ?? null) === (variante?.id ?? null) &&
          mismasOpciones(l.options, opcionesConPrecio) &&
          l.notes === nota,
      );
      if (found) return prev.map((l) => (l.uid === found.uid ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...prev,
        {
          uid: nuevoUid(),
          product_id: p.id,
          name: nombre,
          price: precio,
          qty: 1,
          notes: nota,
          print_area: p.print_area ?? "cocina",
          recipe_id: variante?.id ?? null,
          item_code: codigo,
          options: opcionesConPrecio,
        },
      ];
    });
  };


  /** Centro del botón = configuración por defecto; esquina = ventana de personalización. */
  const agregarRapido = (p: Product) => add(p, opcionesPorDefecto(opcionesDe(p.id)));

  /**
   * Cambiar el canal con productos ya agregados: se pregunta si se actualizan
   * los precios existentes. Si responde No, lo ya agregado conserva su precio.
   */
  const precioBase = (productId: string, fallback: number) =>
    Number(products.find((p) => p.id === productId)?.price ?? fallback);

  const cambiarCanal = (nuevo: string) => {
    const editables = cart.filter((l) => !l.item_id);
    setChannel(nuevo);
    if (editables.length === 0) return;
    const actualizar = window.confirm(
      "¿Deseas actualizar los precios de los productos existentes al nuevo canal?",
    );
    if (!actualizar) return;
    setCart((prev) =>
      prev.map((l) =>
        l.item_id
          ? l
          : {
              ...l,
              // Las variantes mandan con su propio precio: el canal no las toca.
              price: l.recipe_id
                ? l.price
                : precioPorCanal(
                    { id: l.product_id, price: precioBase(l.product_id, l.price) },
                    nuevo,
                    channelPrices,
                  ),

              options: l.options.map((o) =>
                o.kind === "agregador"
                  ? {
                      ...o,
                      price: precioPorCanal(
                        { id: o.product_id, price: precioBase(o.product_id, o.price) },
                        nuevo,
                        channelPrices,
                      ),
                    }
                  : o,
              ),
            },
      ),
    );
    toast.success("Precios actualizados al canal seleccionado");
  };

  const lineKey = (l: CartLine) => l.uid;


  const setQty = (key: string, delta: number) =>
    setCart((prev) => {
      const next = prev.map((l) => (lineKey(l) === key ? { ...l, qty: l.qty + delta } : l));
      const gone = next.find((l) => lineKey(l) === key && l.qty <= 0);
      if (gone?.item_id) setRemovedItemIds((ids) => [...ids, gone.item_id!]);
      return next.filter((l) => l.qty > 0);
    });

  const removeLine = (key: string) =>
    setCart((prev) => {
      const gone = prev.find((l) => lineKey(l) === key);
      if (gone?.item_id) setRemovedItemIds((ids) => [...ids, gone.item_id!]);
      return prev.filter((l) => lineKey(l) !== key);
    });

  const resetTicket = () => {
    setCart([]);
    setGuests("");
    setRemovedItemIds([]);
    setOrderId(null);
    setOrderFolio(null);
    setSentTotal(0);
    setTableId("");
    setCustomerName("");
    setOrderLabel("");
    setNotes("");
    setServiceType(withTables ? "mesa" : "llevar");
    setChannel("salon");
    navigate({ to: "/", search: {} });
  };

  const persist = async (
    status: "en_cocina" | "pagado",
    extra?: Partial<CheckoutResult>,
  ): Promise<{ total: number; id: string; folio: number | null; docNumber?: string; localOnly?: boolean } | null> => {
    if (!orderId && cart.length === 0) {
      toast.error("Agrega productos al pedido");
      return null;
    }
    const puente = puenteCaja();
    if (puente || (typeof navigator !== "undefined" && !navigator.onLine)) {
      if (!puente) {
        toast.error("Sin conexión — esperando para facturar");
        return null;
      }
      const total = cart.reduce((suma, linea) => suma + linea.price * linea.qty, 0);
      const impuestos = splitTax(total, ivaRate);
      const doc = await puente.guardarOrden({
        items: cart.flatMap((linea) => [
          {
            codigo: linea.product_id,
            descripcion: linea.name,
            cantidad: linea.qty,
            precioUnitario: linea.price,
            notas: linea.notes || null,
          },
          ...linea.options.map((o) => ({
            codigo: o.product_id,
            descripcion: `${o.kind === "agregador" ? "+ " : "> "}${o.name}`,
            cantidad: linea.qty * (o.qty || 1),
            precioUnitario: o.price,
            notas: null,
          })),
        ]),
        subtotal: extra?.subtotal ?? impuestos.base,
        iva: extra?.tax_amount ?? impuestos.tax,
        total: extra?.total ?? impuestos.total,
        formaPago: extra?.payment_method ?? "pendiente",
        mesa:
          isPatio && orderLabel.trim()
            ? orderLabel.trim()
            : serviceType === "mesa"
              ? (tables.find((t) => t.id === tableId)?.name ?? null)
              : null,
        cliente: extra
          ? {
              tipoIdentificacion: extra.customer_id_type,
              identificacion: extra.customer_id_number,
              razonSocial: extra.customer_name,
              direccion: extra.customer_address,
              email: extra.customer_email,
            }
          : null,
      });
      if (status === "pagado") setCart([]);
      return {
        total: Number(doc.total) || total,
        id: doc.id,
        folio: doc.ordenNumero,
        docNumber: doc.docNumber,
        localOnly: true,
      };
    }

    setBusy(true);
    lastErrorRef.current = null;

    try {
      let id = orderId;
      let folio = orderFolio;
      if (!id) {
        const { data, error } = await supabase
          .from("orders")
          .insert({
            table_id: serviceType === "mesa" ? tableId || null : null,
            service_type: serviceType,
            sales_channel: channel,
            customer_name: customerName || null,
            order_label: orderLabel || null,
            notes: notes || null,
            status,
            kitchen_sent_at: status === "en_cocina" ? new Date().toISOString() : null,
          })
          .select("id, folio")
          .single();
        if (error) throw error;
        id = data.id;
        folio = data.folio;
        setOrderId(data.id);
        setOrderFolio(data.folio);
      }

      if (removedItemIds.length > 0) {
        const { error } = await supabase.from("order_items").delete().in("id", removedItemIds);
        if (error) throw error;
        setRemovedItemIds([]);
      }

      // Cada plato nuevo se guarda con sus modificadores y agregadores como filas hijas,
      // así el inventario y el cierre del día los descuentan con su propio código.
      for (const l of cart.filter((x) => !x.item_id)) {
        const { data: fila, error } = await supabase
          .from("order_items")
          .insert({
            order_id: id!,
            product_id: l.product_id,
            product_name: l.name,
            unit_price: l.price,
            quantity: l.qty,
            notes: l.notes || null,
            recipe_id: l.recipe_id ?? null,
            item_code: l.item_code ?? null,
          })

          .select("id")
          .single();
        if (error) throw error;
        if (l.options.length > 0) {
          const { error: optErr } = await supabase.from("order_items").insert(
            l.options.map((o) => ({
              order_id: id!,
              product_id: o.product_id,
              product_name: o.name,
              unit_price: o.price,
              quantity: l.qty * (o.qty || 1),
              parent_item_id: fila.id,
              option_kind: o.kind,
            })),
          );
          if (optErr) throw optErr;
        }
      }

      for (const l of cart.filter((x) => x.item_id)) {
        const { error } = await supabase
          .from("order_items")
          .update({ quantity: l.qty, notes: l.notes || null })
          .eq("id", l.item_id!);
        if (error) throw error;
        // Las opciones siguen la cantidad del plato, multiplicada por su propia cantidad.
        for (const o of l.options) {
          await supabase
            .from("order_items")
            .update({ quantity: l.qty * (o.qty || 1) })
            .eq("parent_item_id", l.item_id!)
            .eq("product_id", o.product_id);
        }
      }

      const { data: items } = await supabase
        .from("order_items")
        .select("unit_price, quantity")
        .eq("order_id", id!);
      const total = (items ?? []).reduce((sum, i) => sum + Number(i.unit_price) * Number(i.quantity), 0);
      const split = splitTax(total, ivaRate);

      if (status === "en_cocina") {
        // Solo la primera vez: el contador de demora arranca al enviar a cocina.
        await supabase
          .from("orders")
          .update({ kitchen_sent_at: new Date().toISOString() })
          .eq("id", id!)
          .is("kitchen_sent_at", null);
      }

      const { error: upErr } = await supabase
        .from("orders")
        .update({
          status,
          // Al agregar productos nuevos la mesa vuelve a "en preparación" (naranja).
          ...(status === "en_cocina" ? { ready_at: null, delivered_at: null } : {}),
          subtotal: extra?.subtotal ?? split.base,
          tax_amount: extra?.tax_amount ?? split.tax,
          iva_rate: ivaRate,
          total: extra?.total ?? split.total,
          table_id: serviceType === "mesa" ? tableId || null : null,
          guests: Number(guests) || 0,
          service_type: serviceType,
          sales_channel: extra?.sales_channel ?? channel,
          notes: notes || null,
          order_label: orderLabel || null,
          doc_type: extra?.doc_type ?? "nota_venta",
          payment_method: extra?.payment_method ?? null,
          customer_name: extra?.customer_name ?? customerName ?? null,
          customer_id_type: extra?.customer_id_type ?? null,
          customer_id_number: extra?.customer_id_number ?? null,
          customer_address: extra?.customer_address ?? null,
          customer_email: extra?.customer_email ?? null,
          customer_phone: extra?.customer_phone ?? null,
          access_key: extra?.access_key ?? null,
          doc_number: extra?.doc_number ?? null,
          amount_in_words: extra?.amount_in_words ?? null,
          issued_at_device: extra?.issued_at_device ?? new Date().toISOString(),
          related_doc_number: extra?.related_doc_number ?? null,
          related_access_key: extra?.related_access_key ?? null,
          credit_customer_name: extra?.credit_customer_name ?? null,
          credit_customer_id: extra?.credit_customer_id ?? null,
          credit_phone: extra?.credit_phone ?? null,
          credit_due_date: extra?.credit_due_date ?? null,
          credit_status: extra?.credit_status ?? null,
          paid_at: status === "pagado" ? new Date().toISOString() : null,
        })
        .eq("id", id!);
      if (upErr) throw upErr;

      if (status === "pagado") setCart([]);
      else await loadOrder(id!);
      setSentTotal(0);
      return { total: extra?.total ?? split.total, id: id!, folio };
    } catch (err) {
      const msg = detalleError(err);
      lastErrorRef.current = msg;
      toast.error(`No se pudo guardar: ${msg}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const sendToKitchen = async () => {
    const saved = await persist("en_cocina");
    if (saved) toast.success("Comanda enviada a cocina");
  };

  const printCurrentComanda = async () => {
    let lines = cart.map((l) => {
      const area = (products.find((p) => p.id === l.product_id)?.print_area ??
        l.print_area) as PrintArea;
      return {
        name: l.name,
        qty: l.qty,
        notes: l.notes,
        print_area: area,
        options: l.options.map((o) => ({
          name: o.name,
          qty: l.qty * (o.qty || 1),
          kind: o.kind,
          price: o.price,
        })),
      };
    });
    if (lines.length === 0 && orderId) {
      const { data } = await supabase
        .from("order_items")
        .select("id, product_id, product_name, quantity, notes, unit_price, parent_item_id, option_kind")
        .eq("order_id", orderId);
      const filas = data ?? [];
      lines = filas
        .filter((i) => !i.parent_item_id)
        .map((i) => ({
          name: i.product_name,
          qty: i.quantity,
          notes: i.notes ?? "",
          print_area: (products.find((p) => p.id === i.product_id)?.print_area ??
            "cocina") as PrintArea,
          options: filas
            .filter((o) => o.parent_item_id === i.id)
            .map((o) => ({
              name: o.product_name,
              qty: o.quantity,
              kind: (o.option_kind === "agregador" ? "agregador" : "modificador") as
                | "agregador"
                | "modificador",
              price: Number(o.unit_price),
            })),
        }));
    }

    if (lines.length === 0) {
      toast.error("No hay productos en la comanda");
      return;
    }
    const mesa =
      isPatio && orderLabel.trim()
        ? orderLabel.trim().toUpperCase()
        : serviceType === "mesa"
          ? (tables.find((t) => t.id === tableId)?.name ?? "Sin asignar")
          : serviceType === "llevar"
            ? "PARA LLEVAR"
            : "DOMICILIO";
    const ok = printComanda(lines, {
      negocio: company?.trade_name || company?.business_name || undefined,
      orden: orderFolio ? `#${orderFolio}` : "NUEVA",
      mesa,
      canal: salesChannels.find((c) => c.value === channel)?.label ?? channel,
      notas: notes,
      printerKitchen: company?.printer_kitchen || undefined,
      printerGrill: company?.printer_grill || undefined,
    });
    if (!ok) toast.error("Permite las ventanas emergentes para imprimir");
  };

  const handleCheckout = async (result: CheckoutResult) => {
    // Cada plato lleva sus opciones anidadas: el ticket decide qué imprimir en cada copia.
    const snapshot = cart.map((l) => ({
      name: l.name,
      qty: l.qty,
      unit_price: l.price,
      notes: l.notes ?? null,
      options: l.options.map((o) => ({
        name: o.name,
        qty: o.qty || 1,
        kind: o.kind,
        price: Number(o.price || 0),
      })),
    }));
    const saved = await persist("pagado", result);
    if (!saved)
      throw new Error(lastErrorRef.current ?? "No se pudo guardar la venta. Inténtalo nuevamente.");
    const { total, id: printId } = saved;

    // Descuento de inventario: cantidad vendida × cada ingrediente de la receta.
    if (!saved.localOnly) {
      try {
        await descontarInventarioPorVenta(printId, { folio: saved.folio ?? null });
      } catch (e) {
        toast.error(
          `Venta registrada, pero no se descontó el inventario: ${e instanceof Error ? e.message : "error"}`,
        );
      }
    }

    // Ticket automático en la impresora de Punto de Venta (80 mm).
    const [{ data: items }, { data: ord }] = saved.localOnly
      ? [{ data: null }, { data: null }]
      : await Promise.all([
          supabase
            .from("order_items")
            .select("id, product_name, quantity, unit_price, option_kind, parent_item_id, notes")
            .eq("order_id", printId),
          supabase.from("orders").select("folio, doc_number").eq("id", printId).maybeSingle(),
        ]);
    // Platos con sus opciones anidadas: el ticket decide qué mostrar en cada copia.
    const lines = items
      ? items
          .filter((i) => !i.parent_item_id)
          .map((i) => ({
            name: i.product_name,
            qty: i.quantity,
            unit_price: Number(i.unit_price),
            notes: i.notes ?? null,
            options: items
              .filter((o) => o.parent_item_id === i.id)
              .map((o) => ({
                name: o.product_name,
                qty: i.quantity > 0 ? Math.round(o.quantity / i.quantity) || 1 : o.quantity,
                kind: (o.option_kind === "agregador" ? "agregador" : "modificador") as
                  | "agregador"
                  | "modificador",
                price: Number(o.unit_price),
              })),
          }))
      : snapshot;
    const numero = result.doc_number ?? saved.docNumber ?? ord?.doc_number ?? "SIN NÚMERO";

    const ok = printReceipt({
      copias: company?.printer_copies ?? 2,
      docType: result.doc_type,
      negocio: company?.trade_name || company?.business_name || "Costea POS",
      ruc: company?.ruc,
      direccion: company?.address,
      sucursal: company?.branch_address,
      telefono: company?.phone,
      correo: company?.email,
      regimen: company?.tax_regime,
      obligadoContabilidad: company?.accounting_required ?? false,
      ambiente: company?.environment,
      tipoEmision: company?.emission_type,
      numero,
      claveAcceso: result.access_key,
      fecha: new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" }),
      cliente: result.customer_name ?? customerName ?? null,
      clienteId: result.customer_id_number,
      clienteDireccion: result.customer_address,
      clienteCorreo: result.customer_email,
      lines,
      subtotal: result.subtotal,
      ivaRate: result.iva_rate,
      iva: result.tax_amount,
      total,
      formaPago: paymentLabel(result.payment_method),
      totalEnLetras: result.amount_in_words,
      mesa:
        isPatio && orderLabel.trim()
          ? orderLabel.trim()
          : serviceType === "mesa"
            ? (tables.find((t) => t.id === tableId)?.name ?? null)
            : null,
      recibido: result.received_amount,
      cambio: result.change_amount,
      impresora: company?.printer_pos || undefined,
    });
    if (!ok) toast.error("Permite las ventanas emergentes para imprimir el ticket");

    toast.success("✅ Venta registrada correctamente");
    if (result.doc_type !== "nota_venta") {
      if (esCajaLocal()) {
        // Caja descargable: firma y numera con la configuración de ESTA computadora.
        void emitirFacturaCajaLocal({
          items: lines.map((l, i) => ({
            codigo: String(i + 1).padStart(4, "0"),
            descripcion: l.name,
            cantidad: l.qty,
            precioUnitario: l.unit_price,
          })),
          cliente: {
            tipoIdentificacion: result.customer_id_type ?? "consumidor_final",
            identificacion: result.customer_id_number ?? "9999999999999",
            razonSocial: result.customer_name ?? "CONSUMIDOR FINAL",
            direccion: result.customer_address,
            email: result.customer_email,
          },
          formaPago: result.payment_method,
          totalConIva: total,
          ordenId: printId,
        })
          .then(async (doc) => {
            // El servidor central recibe el número y la clave que generó la caja.
            if (!saved.localOnly) {
              await supabase
                .from("orders")
                .update({ doc_number: doc.docNumber, access_key: doc.claveAcceso })
                .eq("id", printId);
            }
          })
          .catch(() => {
            /* Sin internet queda firmada y pendiente en la propia caja. */
          });
      } else {
        // Emisión 100% en segundo plano: sin avisos al cajero. El seguimiento se hace en el área administrativa.
        void emitirFacturaSri({
          data: { orderId: printId, issuedAtDevice: result.issued_at_device },
        }).catch(() => {
          /* El estado del comprobante queda registrado en la bitácora administrativa. */
        });
      }
    }


    resetTicket();
  };



  const ticketPanel = (
    <div className="flex flex-1 flex-col gap-3 min-h-0">
      {/* Cabecera fija: título y controles del pedido */}
      <div className="shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {orderFolio ? `PEDIDO #${orderFolio}` : "Pedido nuevo"}
          </h2>
          {(cart.length > 0 || orderId) && (
            <button onClick={resetTicket} className="text-xs text-muted-foreground hover:text-destructive">
              Limpiar
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select value={serviceType} onValueChange={setServiceType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withTables && <SelectItem value="mesa">En mesa</SelectItem>}
              <SelectItem value="llevar">Para llevar</SelectItem>
              <SelectItem value="domicilio">A domicilio</SelectItem>
            </SelectContent>
          </Select>

          {withTables && serviceType === "mesa" ? (
            <Select value={tableId} onValueChange={setTableId}>
              <SelectTrigger>
                <SelectValue placeholder="Mesa" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} · {t.zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Cliente"
            />
          )}

          {isPatio && (
            <Input
              value={orderLabel}
              onChange={(e) => setOrderLabel(e.target.value)}
              placeholder="Etiqueta del pedido (ej. Mesa 5, Juan, Ticket feria)"
              className="col-span-2"
            />
          )}

          {withTables && serviceType === "mesa" && (
            <Input
              type="number"
              min={0}
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              placeholder="N° de personas"
              className="col-span-2"
            />
          )}

          <Select value={channel} onValueChange={cambiarCanal}>
            <SelectTrigger className="col-span-2">
              <SelectValue placeholder="Canal de venta" />
            </SelectTrigger>
            <SelectContent>
              {salesChannels.map((c) => (
                <SelectItem key={c.id} value={c.value}>
                  Canal: {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista de productos: altura limitada con scroll interno */}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
        {sentTotal > 0 && (
          <div className="tabular flex justify-between rounded-md bg-surface-2 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Ya enviado a cocina</span>
            <span>{currency(sentTotal)}</span>
          </div>
        )}
        {cart.map((l) => {
          // Lo que cocina ya despachó se muestra tachado; lo nuevo se resalta.
          const hecho = l.item_status === "listo" || l.item_status === "entregado";
          const nuevo = !l.item_id;
          return (
            <div
              key={lineKey(l)}
              className={`rounded-md px-2 py-1 ${
                hecho
                  ? "bg-success/10 opacity-70"
                  : nuevo
                    ? "border border-primary/60 bg-primary/10"
                    : "bg-surface-2"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Button
                  size="icon"
                  variant="secondary"
                  className="size-7 shrink-0"
                  onClick={() => setQty(lineKey(l), -1)}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="tabular w-5 shrink-0 text-center text-xs">{l.qty}</span>
                <Button
                  size="icon"
                  variant="secondary"
                  className="size-7 shrink-0"
                  onClick={() => setQty(lineKey(l), 1)}
                >
                  <Plus className="size-3.5" />
                </Button>
                <span
                  className={`min-w-0 flex-1 truncate text-xs leading-tight ${
                    hecho ? "text-muted-foreground line-through" : nuevo ? "font-bold" : ""
                  }`}
                >
                  {l.name}
                </span>
                {hecho && (
                  <span className="shrink-0 rounded-full bg-success/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-success">
                    Listo
                  </span>
                )}
                {nuevo && (
                  <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                    Nuevo
                  </span>
                )}
                <span className="tabular shrink-0 text-xs">{currency(l.price * l.qty)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  onClick={() => removeLine(lineKey(l))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              {/* Modificadores: solo indicaciones para cocina, sin costo. */}
              {l.options.some((o) => o.kind === "modificador") && (
                <ul className="ml-9 mt-0.5 space-y-0.5 text-[11px] leading-tight text-muted-foreground">
                  {l.options
                    .filter((o) => o.kind === "modificador")
                    .map((o) => (
                      <li key={o.product_id}>📝 {o.name}</li>
                    ))}
                </ul>
              )}
              {/* Agregadores: líneas propias con su precio, igual que en la factura. */}
              {l.options
                .filter((o) => o.kind === "agregador")
                .map((o) => (
                  <div
                    key={o.product_id}
                    className="ml-9 mt-0.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="min-w-0 truncate">
                      {l.qty * (o.qty || 1)}× ➕ {o.name}
                    </span>
                    <span className="tabular shrink-0">
                      {currency(o.price * (o.qty || 1) * l.qty)}
                    </span>
                  </div>
                ))}
              <Input
                value={l.notes}
                onChange={(e) =>
                  setCart((prev) =>
                    prev.map((x) => (lineKey(x) === lineKey(l) ? { ...x, notes: e.target.value } : x)),
                  )
                }
                placeholder="Nota de cocina"
                className="mt-1 h-7 w-full text-xs"
              />
            </div>
          );
        })}

        {cart.length === 0 && sentTotal === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Toca un platillo para agregarlo.
          </p>
        )}
      </div>

      {/* Pie fijo: totales y botones siempre visibles */}
      <div className="shrink-0 space-y-3">
        <div className="tabular space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotal sin IVA</span>
            <span>{currency(base)}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA {ivaRate}%</span>
            <span>{currency(tax)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-primary">Total</span>
            <span className="font-display text-3xl font-bold text-primary">{currency(ticketTotalIva)}</span>
          </div>

        </div>

        {dayLocked && (
          <p className="rounded-md border border-destructive/60 bg-destructive/10 p-3 text-xs text-destructive">
            La caja de hoy tiene un cierre definitivo: no se pueden registrar ni cobrar ventas. El
            Super Administrador puede reabrir el día desde Caja; mañana se habilita automáticamente.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            onClick={sendToKitchen}
            disabled={dayLocked || busy || (cart.length === 0 && removedItemIds.length === 0)}
            className="panel-btn-orange w-full"
          >
            <Send className="size-4" /> Enviar a pantalla de cocina
          </Button>
          <Button
            variant="secondary"
            onClick={printCurrentComanda}
            disabled={busy || (cart.length === 0 && !orderId)}
            className="panel-btn-dark w-full"
          >
            <Printer className="size-4" /> Imprimir comanda
          </Button>
        </div>
        {can.cobrar && (
          <Button
            className="panel-btn-orange h-12 w-full text-base"
            disabled={dayLocked || busy || ticketTotal === 0}
            onClick={() => setCheckoutOpen(true)}
          >
            Cobrar {currency(ticketTotalIva)}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid w-full max-w-full gap-4 lg:grid-cols-[minmax(0,1fr)_clamp(300px,29%,430px)]">
      <section className="min-w-0 space-y-3 pb-24 lg:pb-0">
        <div className="relative">

          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar platillo o código…"
            className="h-10 pl-9 text-sm 2xl:h-12 2xl:text-base"
          />
        </div>

        {menuDesactualizado && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-primary/60 bg-primary/10 p-3 text-sm">
            <span>Hay actualizaciones pendientes del menú. ¿Desea sincronizar ahora?</span>
            <span className="flex gap-2">
              <Button size="sm" onClick={() => void sincronizarMenu()}>
                Sincronizar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMenuDesactualizado(false)}>
                Más tarde
              </Button>
            </span>
          </div>
        )}
        {catalogError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/60 bg-destructive/10 p-3 text-sm">
            <span>No se pudo cargar el catálogo local: {catalogError}</span>
            <Button variant="secondary" size="sm" onClick={() => void loadCatalog()}>
              Reintentar
            </Button>
          </div>
        )}
        {catalogLoading && products.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando catálogo de esta caja…</p>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ id: "all", name: "Todo" } as Category, ...categories.filter((c) => c.kind !== "modificador" && c.kind !== "agregador")].map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`whitespace-nowrap rounded-full px-4 py-2 font-display text-sm font-bold tracking-tight transition-colors 2xl:px-5 2xl:py-3 2xl:text-base ${
                activeCat === c.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-white hover:bg-surface-2"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))]">
          {visibleRender.map((p) => (
            <button
              key={p.id}
              onClick={() => agregarRapido(p)}
              className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-primary hover:shadow-ember active:scale-[0.98]"
            >
              <div className="relative aspect-[4/3] max-h-40 w-full shrink-0">
                <ProductImage path={fotoProducto(p)} alt={p.name} className="h-full w-full" />
                {(opcionesDe(p.id).length > 0 || variantesDe(p.id).length > 0) && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Personalizar ${p.name}`}
                    title="Personalizar (recetas, modificadores y agregadores)"

                    onClick={(e) => {
                      e.stopPropagation();
                      setPersonalizar(p);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        setPersonalizar(p);
                      }
                    }}
                    className="absolute right-0 top-0 grid size-9 place-items-center rounded-bl-xl bg-primary text-primary-foreground"
                  >
                    <SlidersHorizontal className="size-4" />
                  </span>
                )}
              </div>
              <span className="mt-auto flex w-full items-stretch">
                <span className="flex min-w-0 flex-1 items-center bg-product-bar px-2.5 py-2 2xl:px-3 2xl:py-2.5">
                  <span className="line-clamp-2 font-display text-sm font-semibold leading-tight tracking-tight text-product-name 2xl:text-base">
                    {p.name}
                  </span>
                </span>
                <span className="tabular flex shrink-0 items-center whitespace-nowrap bg-product-price px-2.5 py-2 font-display text-sm font-bold tracking-tight text-product-name 2xl:px-3 2xl:py-2.5 2xl:text-base">
                  {currency(Number(p.price))}
                </span>
              </span>
            </button>

          ))}
          {hayMasProductos && (
            <div ref={sentinelProductos} className="col-span-full py-4 text-center text-xs text-muted-foreground">
              Cargando más platillos…
            </div>
          )}
          {visible.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              Sin platillos para esta búsqueda.
            </p>
          )}
        </div>
      </section>

      <aside className="panel light-panel hidden h-[calc(100vh-5rem)] min-w-0 max-w-full flex-col gap-3 p-3 lg:sticky lg:top-20 lg:flex 2xl:p-4">
        {ticketPanel}
      </aside>

      {/* Carrito móvil siempre visible */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 backdrop-blur lg:hidden">
        <Button className="h-12 w-full justify-between" onClick={() => setCartOpen(true)}>
          <span className="flex items-center gap-2">
            <ShoppingCart className="size-4" /> {cartCount} ítems
          </span>
          <span className="tabular">{currency(ticketTotalIva)}</span>
        </Button>
      </div>

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background/95 p-4 backdrop-blur lg:hidden">
          <button
            className="mb-2 self-end text-sm text-muted-foreground"
            onClick={() => setCartOpen(false)}
          >
            Cerrar
          </button>
          <div className="flex flex-1 flex-col gap-3 min-h-0">{ticketPanel}</div>
        </div>
      )}

      <ProductOptionsDialog
        open={Boolean(personalizar)}
        onOpenChange={(v) => !v && setPersonalizar(null)}
        product={personalizar}
        foto={personalizar ? fotoProducto(personalizar) : null}
        opciones={personalizar ? opcionesDe(personalizar.id) : []}
        variantes={personalizar ? variantesDe(personalizar.id) : []}
        precioBase={personalizar ? precioActual(personalizar) : undefined}
        onConfirm={(ops, nota, variante) => {
          if (personalizar) add(personalizar, ops, nota, variante ?? null);
          setPersonalizar(null);
        }}

      />

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        total={ticketTotal}
        company={company}
        salesChannel={channel}
        onConfirm={handleCheckout}
      />
    </div>
  );
}
