import { createFileRoute } from "@tanstack/react-router";
import { FinalRecipesScreen } from "@/components/admin/final-recipes";

export const Route = createFileRoute("/admin/recetas-finales")({
  head: () => ({
    meta: [
      { title: "Recetas finales y costeo | Costea POS" },
      {
        name: "description",
        content:
          "Costeo de platos del menú con insumos en unidad de receta, subrecetas, porcentaje de costo y margen de contribución.",
      },
      { property: "og:title", content: "Recetas finales y costeo | Costea POS" },
      {
        property: "og:description",
        content: "Costo neto de cada plato, margen de contribución y precio sugerido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinalRecipesPage,
});

function FinalRecipesPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Recetas finales</h1>
        <p className="text-sm text-muted-foreground">
          Selecciona un plato del menú, arma su receta con ítems de inventario o subrecetas y
          controla el costo, el margen y el precio de venta neto sugerido.
        </p>
      </header>
      <FinalRecipesScreen />
    </div>
  );
}
