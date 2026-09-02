import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Minus, Plus, Send, Trash2, Check, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useDayLock } from "@/hooks/useDayLock";
import { useKitchenAlerts } from "@/hooks/useKitchenAlerts";
import { ReadyOrdersAlert } from "@/components/ReadyOrdersAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buscarPedidoAbierto, itemsDePedido } from "@/lib/mesa-abierta";
import {
  ProductOptionsDialog,
  opcionesPorDefecto,
  type OpcionDisponible,
} from "@/components/ProductOptionsDialog";
import { useSalesChannels } from "@/hooks/useSalesChannels";
import { useProgressiveList } from "@/hooks/useProgressiveList";
import { cerrarSesionSegura } from "@/lib/auth-session";
import {
  currency,
  precioPorCanal,
  splitTax,
  type CartOption,
  type Category,
  type Product,
  type ProductOption,
  type ProductRecipeVariant,
  type RecipeVariant,
  type RestaurantTable,
} from "@/lib/pos";



let contador = 0;
const nuevoUid = () => `l${++contador}`;

type Line = {
  uid: string;
  product_id: string;
  name: string;
  price: number;
  qty: number;
  notes: string;
  /** Receta variante elegida (nulo = el producto se vende con su propia receta). */
  recipe_id?: string | null;
  /** Código realmente vendido: el del producto o el de la variante. */
  item_code?: string | null;
  options: CartOption[];
};


/**
 * Vista móvil exclusiva para meseros: categorías grandes, tarjetas amplias
 * y carrito fijo abajo. Sin menús, reportes ni configuración.
 */
export function MobileWaiter() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { company } = useCompany();
  const { locked: dayLocked } = useDayLock();
  // Avisos de voz + tarjeta visible cuando cocina marca una orden como lista.
  const { ready: ordenesListas, reload: recargarListas } = useKitchenAlerts({ sound: true });

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  /** Recetas apuntadas por cada producto como variantes. */
  const [recipeLinks, setRecipeLinks] = useState<ProductRecipeVariant[]>([]);
  const [recipes, setRecipes] = useState<RecipeVariant[]>([]);
  const [personalizar, setPersonalizar] = useState<Product | null>(null);

  const [tableId, setTableId] = useState("");
  const [orderLabel, setOrderLabel] = useState("");
  const [channel, setChannel] = useState("salon");
  const { channels: salesChannels, prices: channelPrices } = useSalesChannels();
  const [serviceType, setServiceType] = useState("mesa");
  const [busy, setBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  /** Cuenta abierta de la mesa: mientras no se cobre, todo se suma a la misma. */
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderFolio, setOrderFolio] = useState<number | null>(null);
  const [previos, setPrevios] = useState<
    { id: string; name: string; qty: number; price: number; status: string }[]
  >([]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    (async () => {
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
    })();
  }, []);




  const withTables = (company?.operation_mode ?? "restaurante") === "restaurante";
  const isPatio = (company?.operation_mode ?? "restaurante") === "patio";

  /**
   * Mesa abierta = se vuelve a abrir la comanda que ya existía.
   * Al elegir la mesa se muestran los productos ya pedidos y lo nuevo se suma.
   */
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setOrderId(null);
      setOrderFolio(null);
      setPrevios([]);
      if (serviceType !== "mesa" || !tableId) return;
      const abierta = await buscarPedidoAbierto(tableId);
      if (cancelado || !abierta) return;
      const items = await itemsDePedido(abierta.id);
      if (cancelado) return;
      setOrderId(abierta.id);
      setOrderFolio(abierta.folio);
      setPrevios(
        items.map((i) => ({
          id: i.id,
          name: i.product_name,
          qty: Number(i.quantity),
          price: Number(i.unit_price),
          status: String(i.status ?? "pendiente"),
        })),
      );
      toast.info(`Mesa con cuenta abierta #${abierta.folio} — puedes agregar más`);
    })();
    return () => {
      cancelado = true;
    };
  }, [tableId, serviceType]);

  useEffect(() => {
    if (!withTables && serviceType === "mesa") setServiceType("llevar");
  }, [withTables, serviceType]);

  const visible = useMemo(
    () =>
      products.filter(
        (p) =>
          p.available &&
          // Los modificadores y agregadores no se venden sueltos.
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
  } = useProgressiveList(visible, 20);

  /** Modificadores y agregadores configurados para cada platillo. */
  const opcionesDe = useCallback(
    (productId: string): OpcionDisponible[] =>
      productOptions
        .filter((o) => o.product_id === productId)
        .map((o) => ({
          kind: o.kind,
          default_selected: o.default_selected,
          producto: products.find((x) => x.id === o.option_product_id),
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

  const precioLinea = (l: Line) =>
    l.price + l.options.reduce((s, o) => s + Number(o.price || 0) * (Number(o.qty) || 1), 0);

  const mismasOpciones = (a: CartOption[], b: CartOption[]) =>
    a.length === b.length &&
    a.every((o) => b.some((x) => x.product_id === o.product_id && x.qty === o.qty));

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
    const precio = variante
      ? Number(variante.sale_price) || 0
      : precioPorCanal(p, channel, channelPrices);
    setCart((prev) => {
      const found = prev.find(
        (l) =>
          l.product_id === p.id &&
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
          recipe_id: variante?.id ?? null,
          item_code: variante ? variante.code : p.code,
          options: opcionesConPrecio,
        },
      ];
    });
    toast.success(`${nombre} agregado`, { duration: 900 });
  };


  const agregarRapido = (p: Product) => add(p, opcionesPorDefecto(opcionesDe(p.id)));

  /** Al cambiar el canal se pregunta si se actualizan los precios ya agregados. */
  const cambiarCanal = (nuevo: string) => {
    setChannel(nuevo);
    if (cart.length === 0) return;
    if (!window.confirm("¿Deseas actualizar los precios de los productos existentes al nuevo canal?"))
      return;
    const base = (id: string, fallback: number) =>
      Number(products.find((x) => x.id === id)?.price ?? fallback);
    setCart((prev) =>
      prev.map((l) => ({
        ...l,
        // Las variantes conservan su propio precio: el canal no las toca.
        price: l.recipe_id
          ? l.price
          : precioPorCanal({ id: l.product_id, price: base(l.product_id, l.price) }, nuevo, channelPrices),

        options: l.options.map((o) =>
          o.kind === "agregador"
            ? {
                ...o,
                price: precioPorCanal(
                  { id: o.product_id, price: base(o.product_id, o.price) },
                  nuevo,
                  channelPrices,
                ),
              }
            : o,
        ),
      })),
    );
    toast.success("Precios actualizados al canal seleccionado");
  };

  const setQty = (uid: string, delta: number) =>
    setCart((prev) =>
      prev.map((l) => (l.uid === uid ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0),
    );

  const totalPrevio = previos.reduce((s, l) => s + l.price * l.qty, 0);
  const total = cart.reduce((s, l) => s + precioLinea(l) * l.qty, 0) + totalPrevio;
  const count = cart.reduce((s, l) => s + l.qty, 0) + previos.reduce((s, l) => s + l.qty, 0);
  const ivaRate = company?.iva_rate ?? 15;
  const { total: totalIva } = splitTax(total, ivaRate);

  const guardar = async (status: "en_cocina" | "abierto") => {
    if (cart.length === 0) {
      toast.error("Agrega productos al pedido");
      return;
    }
    if (withTables && serviceType === "mesa" && !tableId) {
      toast.error("Selecciona la mesa");
      return;
    }
    const split = splitTax(total, ivaRate);

    // Siempre en línea: sin conexión no se registra el pedido.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("Sin conexión — espera para enviar el pedido");
      return;
    }

    setBusy(true);
    try {
      let id = orderId;
      let folio = orderFolio;

      if (!id) {
        const { data, error } = await supabase
          .from("orders")
          .insert({
            table_id: serviceType === "mesa" ? tableId || null : null,
            order_label: isPatio && orderLabel.trim() ? orderLabel.trim() : null,
            service_type: serviceType,
            sales_channel: channel,
            status,
            subtotal: split.base,
            tax_amount: split.tax,
            iva_rate: ivaRate,
            total: split.total,
            kitchen_sent_at: status === "en_cocina" ? new Date().toISOString() : null,
          })
          .select("id, folio")
          .single();
        if (error) throw error;
        id = data.id;
        folio = data.folio;
      }

      const { data: guardados, error: itErr } = await supabase
        .from("order_items")
        .insert(
          cart.map((l) => ({
            order_id: id!,
            product_id: l.product_id,
            product_name: l.name,
            unit_price: l.price,
            quantity: l.qty,
            notes: l.notes || null,
            recipe_id: l.recipe_id ?? null,
            item_code: l.item_code ?? null,
          })),

        )
        .select("id");
      if (itErr) throw itErr;

      // Modificadores y agregadores: filas hijas con su propio código de producto.
      const hijos = (guardados ?? []).flatMap((fila, indice) =>
        (cart[indice]?.options ?? []).map((o) => ({
          order_id: id!,
          parent_item_id: fila.id,
          option_kind: o.kind,
          product_id: o.product_id,
          product_name: o.name,
          unit_price: o.price,
          quantity: cart[indice]!.qty * (o.qty || 1),
        })),
      );
      if (hijos.length > 0) {
        const { error: hijoErr } = await supabase.from("order_items").insert(hijos);
        if (hijoErr) throw hijoErr;
      }

      if (orderId) {
        // La cuenta sigue siendo la misma: se recalcula con todo lo acumulado.
        const acumulado = splitTax(total, ivaRate);
        const { error: upErr } = await supabase
          .from("orders")
          .update({
            status,
            // Al agregar más productos la mesa vuelve a estar en preparación (naranja).
            ...(status === "en_cocina" ? { ready_at: null, delivered_at: null } : {}),
            subtotal: acumulado.base,
            tax_amount: acumulado.tax,
            iva_rate: ivaRate,
            total: acumulado.total,
          })
          .eq("id", id!);
        if (upErr) throw upErr;
        if (status === "en_cocina") {
          await supabase
            .from("orders")
            .update({ kitchen_sent_at: new Date().toISOString() })
            .eq("id", id!)
            .is("kitchen_sent_at", null);
        }
      }

      toast.success(
        status === "en_cocina"
          ? `Comanda #${folio ?? ""} enviada a cocina`
          : `Pedido #${folio ?? ""} confirmado`,
      );
      setCart([]);
      setOrderLabel("");
      setCartOpen(false);
      setOrderId(null);
      setOrderFolio(null);
      setPrevios([]);
      setTableId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el pedido");
    } finally {
      setBusy(false);
    }
  };

  if (loading || (!session && navigator.onLine)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando…</div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background pb-40">
      {/* Cabecera mínima */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 px-3 py-3 backdrop-blur">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h1 className="truncate font-display text-lg font-bold">
            {company?.trade_name || company?.business_name || "Costea POS"}
          </h1>
          
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cerrar sesión"
            onClick={async () => {
              await cerrarSesionSegura();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-5" />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Select value={serviceType} onValueChange={setServiceType}>
            <SelectTrigger className="h-12 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withTables && <SelectItem value="mesa">En mesa</SelectItem>}
              <SelectItem value="llevar">Para llevar</SelectItem>
              <SelectItem value="domicilio">A domicilio</SelectItem>
            </SelectContent>
          </Select>
          {withTables && serviceType === "mesa" && (
            <Select value={tableId} onValueChange={setTableId}>
              <SelectTrigger className="h-12 text-base">
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
          )}
          <Select value={channel} onValueChange={cambiarCanal}>
            <SelectTrigger className="col-span-2 h-12 text-base">
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
          {isPatio && (
            <Input
              value={orderLabel}
              onChange={(e) => setOrderLabel(e.target.value)}
              placeholder="Etiqueta del pedido"
              className="col-span-2 h-12 text-base"
            />
          )}
        </div>

        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar platillo…"
            className="h-12 pl-10 text-base"
          />
        </div>

        <div className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1">
          {[
            { id: "all", name: "Todo" },
            ...categories.filter((c) => c.kind !== "modificador" && c.kind !== "agregador"),
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`min-w-[130px] whitespace-nowrap rounded-2xl px-6 py-4 text-lg font-bold transition-colors ${
                activeCat === c.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-white hover:bg-surface"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </header>

      <ReadyOrdersAlert ready={ordenesListas} onChange={recargarListas} />



      {/* Lista compacta: sin fotos, 2 columnas, ~4 productos visibles */}
      <main className="grid max-h-[42vh] grid-cols-2 gap-2 overflow-y-auto p-3">
        {visibleRender.map((p) => {
          const enCarrito = cart
            .filter((l) => l.product_id === p.id)
            .reduce((s, l) => s + l.qty, 0);
          const tieneOpciones = opcionesDe(p.id).length > 0 || variantesDe(p.id).length > 0;
          return (
            <div key={p.id} className="relative">
              <button
                onClick={() => agregarRapido(p)}
                className="panel flex min-h-[86px] w-full flex-col justify-between gap-1 px-3 py-3 text-left transition-transform active:scale-[0.98]"
              >
                <span className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 font-display text-lg font-bold leading-tight">{p.name}</span>
                  {enCarrito > 0 && (
                    <span className="tabular shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                      x{enCarrito}
                    </span>
                  )}
                </span>
                <span className="tabular text-base font-bold text-primary">{currency(Number(p.price))}</span>
              </button>
              {tieneOpciones && (
                <button
                  onClick={() => setPersonalizar(p)}
                  aria-label={`Personalizar ${p.name}`}
                  className="absolute bottom-2 right-2 rounded-full bg-primary p-2 text-primary-foreground shadow-lg"
                >
                  <SlidersHorizontal className="size-4" />
                </button>
              )}
            </div>
          );
        })}
        {hayMasProductos && (
          <div ref={sentinelProductos} className="col-span-full py-3 text-center text-xs text-muted-foreground">
            Cargando más platillos…
          </div>
        )}
        {visible.length === 0 && (
          <p className="col-span-full py-12 text-center text-base text-muted-foreground">
            Sin platillos para esta búsqueda.
          </p>
        )}
      </main>


      {/* Carrito fijo */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface p-3">
        {cartOpen && (
          <div className="mb-3 max-h-[45vh] space-y-2 overflow-y-auto">
            {previos.length > 0 && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-2">
                <p className="mb-1 text-sm font-bold text-primary">
                  Ya pedido en esta mesa · cuenta #{orderFolio ?? ""}
                </p>
                {previos.map((l) => {
                  const hecho = l.status === "listo" || l.status === "entregado";
                  return (
                    <p
                      key={l.id}
                      className={`flex items-center justify-between gap-2 text-base font-semibold ${
                        hecho ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      <span className="truncate">
                        {l.qty} × {l.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {hecho && (
                          <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-bold uppercase text-success no-underline">
                            Listo
                          </span>
                        )}
                        <span className="tabular">{currency(l.price * l.qty)}</span>
                      </span>
                    </p>
                  );
                })}
              </div>
            )}
            {cart.length === 0 && previos.length === 0 && (
              <p className="py-6 text-center text-base text-muted-foreground">
                Toca un platillo para agregarlo.
              </p>
            )}
            {cart.map((l) => (
              <div
                key={l.uid}
                className="rounded-xl border border-primary/60 bg-primary/10 p-2"
              >
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="secondary" className="size-11" onClick={() => setQty(l.uid, -1)}>
                    <Minus className="size-5" />
                  </Button>
                  <span className="tabular w-8 text-center text-lg font-bold">{l.qty}</span>
                  <Button size="icon" variant="secondary" className="size-11" onClick={() => setQty(l.uid, 1)}>
                    <Plus className="size-5" />
                  </Button>
                  <span className="min-w-0 flex-1 truncate text-base font-semibold">{l.name}</span>
                  <span className="tabular shrink-0 text-base font-bold">
                    {currency(l.price * l.qty)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-11 shrink-0"
                    onClick={() => setCart((prev) => prev.filter((x) => x.uid !== l.uid))}
                  >
                    <Trash2 className="size-5" />
                  </Button>
                </div>
                {/* Agregadores: líneas propias con precio; modificadores: solo indicación. */}
                {l.options
                  .filter((o) => o.kind === "agregador")
                  .map((o) => (
                    <div
                      key={o.product_id}
                      className="mt-1 flex items-center justify-between gap-2 pl-[8.5rem] text-sm font-semibold text-primary"
                    >
                      <span className="min-w-0 truncate">
                        {l.qty * (o.qty || 1)}× ➕ {o.name}
                      </span>
                      <span className="tabular shrink-0">
                        {currency(o.price * (o.qty || 1) * l.qty)}
                      </span>
                    </div>
                  ))}
                {(l.options.some((o) => o.kind === "modificador") || l.notes) && (
                  <div className="mt-1 space-y-0.5 pl-[8.5rem] text-xs">
                    {l.options
                      .filter((o) => o.kind === "modificador")
                      .map((o) => (
                        <p key={o.product_id} className="text-muted-foreground">
                          • {o.name}
                        </p>
                      ))}
                    {l.notes && <p className="italic text-warning">📝 {l.notes}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setCartOpen((v) => !v)}
          className="mb-2 flex w-full items-center justify-between rounded-xl bg-surface-2 px-4 py-3"
        >
          <span className="text-base font-bold">{count} ítems en el pedido</span>
          <span className="tabular font-display text-2xl font-bold text-primary">{currency(totalIva)}</span>
        </button>

        {dayLocked && (
          <p className="mb-2 rounded-md border border-destructive/60 bg-destructive/10 p-2 text-xs text-destructive">
            La caja de hoy tiene un cierre definitivo: no se pueden registrar pedidos.
          </p>
        )}

        <Button
          onClick={() => guardar("en_cocina")}
          disabled={busy || dayLocked || cart.length === 0}
          className="panel-btn-orange h-16 w-full text-xl font-bold"
        >
          <Send className="size-6" /> ENVIAR A COCINA
        </Button>
        <Button
          onClick={() => guardar("abierto")}
          disabled={busy || dayLocked || cart.length === 0}
          variant="secondary"
          className="mt-2 h-14 w-full text-lg font-bold"
        >
          <Check className="size-5" /> CONFIRMAR PEDIDO
        </Button>
      </div>

      <ProductOptionsDialog
        open={Boolean(personalizar)}
        onOpenChange={(v) => !v && setPersonalizar(null)}
        product={personalizar}
        opciones={personalizar ? opcionesDe(personalizar.id) : []}
        variantes={personalizar ? variantesDe(personalizar.id) : []}
        precioBase={
          personalizar ? precioPorCanal(personalizar, channel, channelPrices) : undefined
        }
        onConfirm={(opciones, notas, variante) => {
          if (personalizar) add(personalizar, opciones, notas, variante ?? null);
          setPersonalizar(null);
        }}

      />
    </div>
  );
}
