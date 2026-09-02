import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSalesChannels } from "@/hooks/useSalesChannels";
import {
  claveCanal,
  currency,
  PRINT_AREAS,
  type Category,
  type OptionKind,
  type PrintArea,
  type Product,
  type ProductOption,
  type ProductRecipeVariant,
  type RecipeVariant,
} from "@/lib/pos";
import { useProgressiveList } from "@/hooks/useProgressiveList";




export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menú y categorías | Costea POS" },
      {
        name: "description",
        content:
          "Administra categorías, platillos, precios, área de impresión y fotos del menú de tu restaurante desde Costea POS.",
      },
      { property: "og:title", content: "Menú y categorías | Costea POS" },
      {
        property: "og:description",
        content: "Crea categorías y platillos con foto, código automático, precio y área de impresión.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <MenuScreen />
    </AppShell>
  ),
});

function MenuScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newCat, setNewCat] = useState("");
  const [editCat, setEditCat] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    price: "",
    category_id: "",
    description: "",
    print_area: "cocina" as PrintArea,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const { channels, prices, reload: reloadChannels } = useSalesChannels();
  const [newChannel, setNewChannel] = useState("");
  /** Recetas disponibles (creadas una sola vez en Recetas y subrecetas). */
  const [recipes, setRecipes] = useState<(RecipeVariant & { product_id: string | null })[]>([]);
  /** Vínculos producto → receta usada como variante. */
  const [variants, setVariants] = useState<ProductRecipeVariant[]>([]);


  /** Precio configurado del producto en ese canal ("" = usa el precio base). */
  const precioDe = (productId: string, canal: string) => {
    const fila = prices.find((p) => p.product_id === productId && p.channel_value === canal);
    return fila ? String(fila.price) : "";
  };

  const guardarPrecioCanal = async (productId: string, canal: string, valor: string) => {
    const limpio = valor.trim();
    if (limpio === "" || Number(limpio) <= 0) {
      await supabase
        .from("product_channel_prices")
        .delete()
        .eq("product_id", productId)
        .eq("channel_value", canal);
      await reloadChannels();
      return;
    }
    const { error } = await supabase
      .from("product_channel_prices")
      .upsert(
        { product_id: productId, channel_value: canal, price: Number(limpio) },
        { onConflict: "product_id,channel_value" },
      );
    if (error) toast.error(error.message);
    await reloadChannels();
  };

  const agregarCanal = async () => {
    const label = newChannel.trim();
    if (!label) return;
    const value = claveCanal(label);
    if (!value) {
      toast.error("Escribe un nombre válido para el canal");
      return;
    }
    const { error } = await supabase
      .from("sales_channels")
      .insert({ value, label, sort_order: channels.length + 1 });
    if (error) toast.error(error.message);
    else {
      setNewChannel("");
      toast.success(`Canal "${label}" agregado`);
      await reloadChannels();
    }
  };

  const quitarCanal = async (canal: { id: string; value: string; label: string }) => {
    const { error } = await supabase.from("sales_channels").update({ active: false }).eq("id", canal.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Canal "${canal.label}" desactivado`);
      await reloadChannels();
    }
  };



  const load = useCallback(async () => {
    const [c, p, o, r, v] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("products").select("*").order("name"),
      supabase.from("product_options").select("*").order("sort_order"),
      supabase
        .from("recipes")
        .select("id, code, name, sale_price, product_id")
        .eq("kind", "plato")
        .order("name"),
      supabase.from("product_recipe_variants").select("*").order("sort_order"),
    ]);
    setCategories((c.data as Category[]) ?? []);
    setProducts((p.data as Product[]) ?? []);
    setOptions((o.data as ProductOption[]) ?? []);
    setRecipes((r.data as (RecipeVariant & { product_id: string | null })[]) ?? []);
    setVariants((v.data as ProductRecipeVariant[]) ?? []);
  }, []);

  /** Recetas ya apuntadas por el producto como variantes. */
  const variantesDe = (productId: string) =>
    variants
      .filter((v) => v.product_id === productId)
      .map((v) => ({ vinculo: v, receta: recipes.find((r) => r.id === v.recipe_id) }))
      .filter(
        (x): x is { vinculo: ProductRecipeVariant; receta: RecipeVariant & { product_id: string | null } } =>
          Boolean(x.receta),
      );


  const agregarVariante = async (productId: string, recipeId: string) => {
    if (!recipeId) return;

    // 1) La receta debe existir y ser una receta de plato ya creada.
    const receta = recipes.find((r) => r.id === recipeId);
    if (!receta) {
      toast.error("Esa receta ya no existe. Actualiza la lista e inténtalo de nuevo.");
      await load();
      return;
    }

    // 2) No se puede apuntar la propia receta del producto.
    if (receta.product_id === productId) {
      toast.error("Esa receta ya es la receta base del producto.");
      return;
    }

    // 3) Sin duplicados.
    if (variants.some((v) => v.product_id === productId && v.recipe_id === recipeId)) {
      toast.error(`"${receta.name}" ya está apuntada como variante.`);
      return;
    }

    const { error } = await supabase.from("product_recipe_variants").insert({
      product_id: productId,
      recipe_id: recipeId,
      sort_order: variants.filter((v) => v.product_id === productId).length,
    });
    if (error) {
      if (error.code === "23505") toast.error(`"${receta.name}" ya está apuntada como variante.`);
      else if (error.code === "23503") toast.error("El vínculo no es válido: la receta o el producto ya no existe.");
      else toast.error(error.message);
      await load();
      return;
    }
    toast.success(`Variante "${receta.name}" apuntada.`);
    load();
  };


  const quitarVariante = async (id: string) => {
    const { error } = await supabase.from("product_recipe_variants").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };


  /** Categorías reservadas: sus productos son opciones, no platos vendibles solos. */
  const catIdsDe = (kind: OptionKind) =>
    categories.filter((c) => c.kind === kind).map((c) => c.id);

  const productosDe = (kind: OptionKind) => {
    const ids = catIdsDe(kind);
    return products.filter((p) => p.category_id && ids.includes(p.category_id));
  };

  const esOpcion = (p: Product) =>
    Boolean(
      p.category_id && [...catIdsDe("modificador"), ...catIdsDe("agregador")].includes(p.category_id),
    );

  const opcionesDe = (productId: string, kind: OptionKind) =>
    options
      .filter((o) => o.product_id === productId && o.kind === kind)
      .map((o) => ({ vinculo: o, producto: products.find((p) => p.id === o.option_product_id) }))
      .filter((x): x is { vinculo: ProductOption; producto: Product } => Boolean(x.producto));

  const agregarOpcion = async (productId: string, optionProductId: string, kind: OptionKind) => {
    const { error } = await supabase.from("product_options").insert({
      product_id: productId,
      option_product_id: optionProductId,
      kind,
      sort_order: options.filter((o) => o.product_id === productId).length,
    });
    if (error) toast.error(error.message);
    else load();
  };

  const quitarOpcion = async (id: string) => {
    const { error } = await supabase.from("product_options").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const marcarPorDefecto = async (id: string, valor: boolean) => {
    const { error } = await supabase
      .from("product_options")
      .update({ default_selected: valor })
      .eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };


  useEffect(() => {
    load();
  }, [load]);

  const addCategory = async () => {
    if (!newCat.trim()) return;
    const { error } = await supabase
      .from("categories")
      .insert({ name: newCat.trim(), sort_order: categories.length });
    if (error) toast.error(error.message);
    else {
      setNewCat("");
      load();
    }
  };

  const renameCategory = async () => {
    if (!editCat || !editCat.name.trim()) return;
    const { error } = await supabase
      .from("categories")
      .update({ name: editCat.name.trim() })
      .eq("id", editCat.id);
    if (error) toast.error(error.message);
    else {
      setEditCat(null);
      toast.success("Categoría actualizada");
      load();
    }
  };

  const removeCategory = async (c: Category) => {
    if (c.kind === "modificador" || c.kind === "agregador") {
      toast.error("Modificadores y Agregadores son categorías fijas del sistema");
      return;
    }
    if (products.some((p) => p.category_id === c.id)) {

      toast.error("Primero mueve o elimina los platillos de esta categoría");
      return;
    }
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Categoría eliminada");
      load();
    }
  };

  const addProduct = async () => {
    if (!form.name.trim() || !form.price) {
      toast.error("Nombre y precio son obligatorios");
      return;
    }
    setSaving(true);
    // El código se genera automáticamente en la base (secuencial único).
    const { data, error } = await supabase
      .from("products")
      .insert({
        name: form.name.trim(),
        price: Number(form.price),
        category_id: form.category_id || null,
        description: form.description.trim() || null,
        print_area: form.print_area,
      })
      .select("code")
      .single();
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      setForm({ name: "", price: "", category_id: "", description: "", print_area: "cocina" });
      toast.success(`Platillo agregado con código ${data?.code ?? ""}`);
      load();
    }
  };

  const saveProduct = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("products")
      .update({
        name: editing.name.trim(),
        price: Number(editing.price),
        category_id: editing.category_id || null,
        description: editing.description?.trim() || null,
        print_area: editing.print_area,
      })
      .eq("id", editing.id);
    if (error) toast.error(error.message);
    else {
      setEditing(null);
      toast.success("Platillo actualizado");
      load();
    }
  };

  const toggle = async (p: Product) => {
    await supabase.from("products").update({ available: !p.available }).eq("id", p.id);
    load();
  };

  const remove = async (p: Product) => {
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) toast.error("No se puede eliminar: tiene ventas registradas");
    else load();
  };

  const upload = async (p: Product, file: File) => {
    setUploading(p.id);
    const path = `${p.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("productos").upload(path, file, { upsert: true });
    if (error) toast.error(error.message);
    else {
      await supabase.from("products").update({ image_url: path }).eq("id", p.id);
      toast.success("Foto actualizada");
      load();
    }
    setUploading(null);
  };

  const areaLabel = (a: PrintArea) => PRINT_AREAS.find((x) => x.value === a)?.label ?? a;

  // Renderizado progresivo: la cuadricula pinta por bloques al hacer scroll.
  const { rendered: productosVisibles, hasMore: hayMasProductos, sentinelRef: refProductos } =
    useProgressiveList(products, 24);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">Menú</h1>

      <section className="panel space-y-3 p-4">
        <h2 className="font-display text-base font-semibold">Categorías</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) =>
            editCat?.id === c.id ? (
              <span key={c.id} className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1">
                <Input
                  autoFocus
                  value={editCat.name}
                  onChange={(e) => setEditCat({ ...editCat, name: e.target.value })}
                  className="h-8 w-40"
                />
                <Button size="icon" variant="ghost" onClick={renameCategory} aria-label="Guardar">
                  <Check className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditCat(null)} aria-label="Cancelar">
                  <X className="size-4" />
                </Button>
              </span>
            ) : (
              <span
                key={c.id}
                className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-sm"
              >
                {c.name}
                <button
                  onClick={() => setEditCat({ id: c.id, name: c.name })}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Editar ${c.name}`}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => removeCategory(c)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Eliminar ${c.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ),
          )}
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay categorías.</p>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nueva categoría" />
          <Button onClick={addCategory}>
            <Plus className="size-4" /> Agregar
          </Button>
        </div>
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="font-display text-base font-semibold">Canales de venta</h2>
        <p className="text-sm text-muted-foreground">
          Cada producto puede tener un precio distinto por canal. Si un canal no tiene precio, se usa el
          precio base del producto.
        </p>
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-sm"
            >
              {c.label}
              <button
                onClick={() => quitarCanal(c)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Quitar ${c.label}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
            placeholder="Nuevo canal de venta (ej. Glovo, Catering)"
          />
          <Button onClick={agregarCanal}>
            <Plus className="size-4" /> Agregar canal
          </Button>
        </div>
      </section>



      <section className="panel space-y-3 p-4">
        <h2 className="font-display text-base font-semibold">Nuevo platillo</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Código</Label>
            <Input value="Automático" disabled />
          </div>
          <div className="space-y-1">
            <Label>Precio (IVA incluido)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Categoría</Label>
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Área de impresión</Label>
            <Select
              value={form.print_area}
              onValueChange={(v) => setForm({ ...form, print_area: v as PrintArea })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINT_AREAS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Descripción</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <Button onClick={addProduct} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Guardar platillo
        </Button>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {productosVisibles.map((p) => (
          <article key={p.id} className="panel flex gap-3 p-3">
            <ProductImage path={p.image_url} alt={p.name} className="size-20 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.code} · {areaLabel(p.print_area)}
              </p>
              <p className="tabular text-sm text-primary">{currency(Number(p.price))}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={p.available} onCheckedChange={() => toggle(p)} />
                  {p.available ? "Disponible" : "Agotado"}
                </label>
                <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  {uploading === p.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="size-3.5" />
                  )}
                  Foto
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(p, f);
                    }}
                  />
                </label>
                <button
                  onClick={() => setEditing(p)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="size-3.5" /> Editar
                </button>
                <button
                  onClick={() => remove(p)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" /> Eliminar
                </button>
              </div>

              <div className="mt-3 space-y-2 rounded-md border border-border p-3">
                <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Precios por canal
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {channels.map((c) => (
                    <label key={`${c.id}-${precioDe(p.id, c.value)}`} className="space-y-1 text-xs text-muted-foreground">
                      {c.label}
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-8"
                        defaultValue={precioDe(p.id, c.value)}
                        placeholder={currency(Number(p.price))}
                        onBlur={(e) => guardarPrecioCanal(p.id, c.value, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Deja vacío para usar el precio base {currency(Number(p.price))}.
                </p>
              </div>

              {!esOpcion(p) &&
                (() => {
                  const asignadas = variantesDe(p.id);
                  const disponibles = recipes.filter(
                    (r) => r.product_id !== p.id && !asignadas.some((a) => a.receta.id === r.id),
                  );
                  return (
                    <div className="mt-3 space-y-2 rounded-md border border-border p-3">
                      <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Variantes de receta
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Apunta recetas ya creadas en Recetas y subrecetas. Si no apuntas ninguna, el
                        producto se vende con su propia receta.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {asignadas.map(({ vinculo, receta }) => (
                          <span
                            key={vinculo.id}
                            className="flex items-center gap-2 rounded-full bg-surface-2 px-2.5 py-1 text-xs"
                          >
                            {receta.code ? `${receta.code} · ` : ""}
                            {receta.name}
                            <b className="tabular text-primary">
                              {receta.sale_price != null
                                ? currency(Number(receta.sale_price))
                                : "sin precio"}
                            </b>
                            <button
                              onClick={() => quitarVariante(vinculo.id)}
                              aria-label={`Quitar ${receta.name}`}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                        {asignadas.length === 0 && (
                          <span className="text-xs text-muted-foreground">Ninguna apuntada.</span>
                        )}
                      </div>
                      <Select
                        value=""
                        onValueChange={(v) => agregarVariante(p.id, v)}
                        disabled={disponibles.length === 0}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue
                            placeholder={
                              disponibles.length === 0
                                ? "No hay más recetas disponibles"
                                : "Apuntar receta como variante"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {disponibles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.code ? `${r.code} · ` : ""}
                              {r.name}
                              {r.sale_price != null ? ` · ${currency(Number(r.sale_price))}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}


              {!esOpcion(p) && (
                <div className="mt-3 space-y-3 rounded-md border border-border p-3">
                  {(["modificador", "agregador"] as OptionKind[]).map((kind) => {
                    const asignadas = opcionesDe(p.id, kind);
                    const disponibles = productosDe(kind).filter(
                      (op) => !asignadas.some((a) => a.producto.id === op.id),
                    );
                    return (
                      <div key={kind} className="space-y-2">
                        <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {kind === "modificador" ? "Modificadores" : "Agregadores"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {asignadas.map(({ vinculo, producto }) => (
                            <span
                              key={vinculo.id}
                              className="flex items-center gap-2 rounded-full bg-surface-2 px-2.5 py-1 text-xs"
                            >
                              {producto.name}
                              {kind === "agregador" && (
                                <b className="tabular text-primary">{currency(Number(producto.price))}</b>
                              )}
                              <label
                                className="flex items-center gap-1 text-[10px] text-muted-foreground"
                                title="Viene marcado por defecto"
                              >
                                <input
                                  type="checkbox"
                                  checked={vinculo.default_selected}
                                  onChange={(e) => marcarPorDefecto(vinculo.id, e.target.checked)}
                                />
                                Por defecto
                              </label>
                              <button
                                onClick={() => quitarOpcion(vinculo.id)}
                                aria-label={`Quitar ${producto.name}`}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                          {asignadas.length === 0 && (
                            <span className="text-xs text-muted-foreground">Ninguno asignado.</span>
                          )}
                        </div>
                        <Select
                          value=""
                          onValueChange={(v) => agregarOpcion(p.id, v, kind)}
                          disabled={disponibles.length === 0}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue
                              placeholder={
                                disponibles.length === 0
                                  ? `Sin productos en la categoría ${kind === "modificador" ? "Modificadores" : "Agregadores"}`
                                  : kind === "modificador"
                                    ? "Agregar Modificador"
                                    : "Agregar Agregador"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {disponibles.map((op) => (
                              <SelectItem key={op.id} value={op.id}>
                                {op.name}
                                {kind === "agregador" ? ` · ${currency(Number(op.price))}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}



              {editing?.id === p.id && (
                <div className="mt-3 space-y-2 rounded-md border border-border p-3">
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Nombre"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={String(editing.price)}
                    onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                    placeholder="Precio"
                  />
                  <Select
                    value={editing.category_id ?? ""}
                    onValueChange={(v) => setEditing({ ...editing, category_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={editing.print_area}
                    onValueChange={(v) => setEditing({ ...editing, print_area: v as PrintArea })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRINT_AREAS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveProduct}>
                      Guardar
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
        {hayMasProductos && (
          <p
            ref={refProductos}
            className="col-span-full py-3 text-center text-xs text-muted-foreground"
          >
            Cargando más platillos…
          </p>
        )}
      </section>

    </div>
  );
}
