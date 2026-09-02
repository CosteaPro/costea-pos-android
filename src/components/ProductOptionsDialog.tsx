import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProductImage } from "@/components/ProductImage";
import {
  currency,
  type CartOption,
  type OptionKind,
  type Product,
  type RecipeVariant,
} from "@/lib/pos";

export type OpcionDisponible = {
  kind: OptionKind;
  default_selected: boolean;
  producto: Product;
};

/** Convierte un producto de opción en la línea que viaja con el pedido. */
export const aCartOption = (o: OpcionDisponible, qty = 1): CartOption => ({
  product_id: o.producto.id,
  code: o.producto.code,
  name: o.producto.name,
  price: o.kind === "modificador" ? 0 : Number(o.producto.price) || 0,
  kind: o.kind,
  print_area: o.producto.print_area ?? "cocina",
  qty: o.kind === "modificador" ? 1 : Math.max(1, qty),
});

/** Opciones marcadas por defecto: lo que se carga al tocar el centro del botón. */
export const opcionesPorDefecto = (opciones: OpcionDisponible[]): CartOption[] =>
  opciones.filter((o) => o.default_selected).map(aCartOption);

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  foto?: string | null;
  opciones: OpcionDisponible[];
  /** Recetas que este producto apunta como variantes (vacío = solo la suya). */
  variantes?: RecipeVariant[];
  /** Precio del producto en el canal activo (manda sobre product.price). */
  precioBase?: number;
  onConfirm: (opciones: CartOption[], notas: string, variante?: RecipeVariant | null) => void;
};


/**
 * Ventana de personalización: foto del platillo, modificadores (sin costo) y
 * agregadores con su precio, que se suman al total en tiempo real.
 */
export function ProductOptionsDialog({
  open,
  onOpenChange,
  product,
  foto,
  opciones,
  variantes = [],
  precioBase,
  onConfirm,
}: Props) {
  const [elegidas, setElegidas] = useState<string[]>([]);
  /** Cantidad elegida por agregador (Chorizo × 2, etc.). */
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [notas, setNotas] = useState("");
  /** "" = receta propia del producto · id = receta apuntada como variante. */
  const [recetaId, setRecetaId] = useState("");

  // Cada apertura empieza limpia: nunca hereda opciones ni notas del plato anterior.
  const opcionesRef = useRef(opciones);
  opcionesRef.current = opciones;
  useEffect(() => {
    if (!open) return;
    setElegidas(opcionesRef.current.filter((o) => o.default_selected).map((o) => o.producto.id));
    setCantidades({});
    setNotas("");
    setRecetaId("");
  }, [open, product?.id]);

  const modificadores = opciones.filter((o) => o.kind === "modificador");
  const agregadores = opciones.filter((o) => o.kind === "agregador");

  const variante = variantes.find((v) => v.id === recetaId) ?? null;

  const seleccion = useMemo(
    () =>
      opciones
        .filter((o) => elegidas.includes(o.producto.id))
        .map((o) => aCartOption(o, cantidades[o.producto.id] ?? 1)),
    [opciones, elegidas, cantidades],
  );

  const precioProducto = precioBase ?? (Number(product?.price) || 0);
  /** La variante sustituye por completo al producto: nombre, código y precio. */
  const precioLinea = variante ? Number(variante.sale_price) || 0 : precioProducto;

  const totalLinea = precioLinea + seleccion.reduce((s, o) => s + o.price * o.qty, 0);


  const alternar = (id: string) =>
    setElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** Cambia la cantidad del agregador; al llegar a 0 se quita de la selección. */
  const cambiarCantidad = (id: string, delta: number) =>
    setCantidades((prev) => {
      const actual = prev[id] ?? 1;
      const siguiente = actual + delta;
      if (siguiente < 1) {
        setElegidas((sel) => sel.filter((x) => x !== id));
        const { [id]: _quitado, ...resto } = prev;
        return resto;
      }
      return { ...prev, [id]: siguiente };
    });

  if (!product) return null;

  const boton = (o: OpcionDisponible) => {
    const activa = elegidas.includes(o.producto.id);
    const cantidad = cantidades[o.producto.id] ?? 1;
    if (o.kind === "agregador") {
      return (
        <div
          key={o.producto.id}
          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
            activa ? "border-primary bg-primary/15 font-semibold" : "border-border bg-surface-2"
          }`}
        >
          <button
            type="button"
            onClick={() => alternar(o.producto.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {activa ? (
              <Check className="size-4 shrink-0 text-primary" />
            ) : (
              <Plus className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{o.producto.name}</span>
          </button>
          {activa ? (
            <span className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="size-7"
                aria-label={`Quitar ${o.producto.name}`}
                onClick={() => cambiarCantidad(o.producto.id, -1)}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="tabular w-5 text-center font-bold">{cantidad}</span>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="size-7"
                aria-label={`Agregar ${o.producto.name}`}
                onClick={() => cambiarCantidad(o.producto.id, 1)}
              >
                <Plus className="size-3.5" />
              </Button>
              <span className="tabular w-14 text-right text-primary">
                {currency(Number(o.producto.price) * cantidad)}
              </span>
            </span>
          ) : (
            <span className="tabular shrink-0 text-primary">
              {currency(Number(o.producto.price))}
            </span>
          )}
        </div>
      );
    }
    return (
      <button
        key={o.producto.id}
        type="button"
        onClick={() => alternar(o.producto.id)}
        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
          activa
            ? "border-primary bg-primary/15 font-semibold"
            : "border-border bg-surface-2 hover:border-primary/60"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {activa ? (
            <Check className="size-4 shrink-0 text-primary" />
          ) : (
            <Plus className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{o.producto.name}</span>
        </span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {variante ? variante.name : product.name}
          </DialogTitle>
          <DialogDescription>
            {variantes.length > 0
              ? "Elige la receta y luego los modificadores y agregadores de este plato."
              : "Elige los modificadores y agregadores de este plato."}
          </DialogDescription>
        </DialogHeader>

        <div className="h-40 w-full overflow-hidden rounded-lg">
          <ProductImage path={foto ?? product.image_url} alt={product.name} className="h-full w-full" />
        </div>

        {variantes.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Receta
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setRecetaId("")}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  recetaId === ""
                    ? "border-primary bg-primary/15 font-semibold"
                    : "border-border bg-surface-2 hover:border-primary/60"
                }`}
              >
                <span className="truncate">
                  {product.code ? `${product.code} · ` : ""}
                  {product.name}
                </span>
                <span className="tabular shrink-0 text-primary">{currency(precioProducto)}</span>
              </button>
              {variantes.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setRecetaId(v.id)}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    recetaId === v.id
                      ? "border-primary bg-primary/15 font-semibold"
                      : "border-border bg-surface-2 hover:border-primary/60"
                  }`}
                >
                  <span className="truncate">
                    {v.code ? `${v.code} · ` : ""}
                    {v.name}
                  </span>
                  <span className="tabular shrink-0 text-primary">
                    {currency(Number(v.sale_price) || 0)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {modificadores.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Modificadores (sin costo)
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">{modificadores.map(boton)}</div>
          </section>
        )}

        {agregadores.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Agregadores
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">{agregadores.map(boton)}</div>
          </section>
        )}

        <Textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Observaciones para cocina (ej. sin salsa, término 3/4)"
          rows={2}
        />

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="tabular font-display text-2xl font-bold text-primary">
            {currency(totalLinea)}
          </span>
          <Button
            className="h-11 px-6 text-base"
            onClick={() => {
              onConfirm(seleccion, notas.trim(), variante);
              onOpenChange(false);
            }}
          >

            Agregar al pedido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
