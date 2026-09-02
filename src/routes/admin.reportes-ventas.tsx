import { createFileRoute } from "@tanstack/react-router";
import { ReportsScreen } from "@/routes/reportes";

export const Route = createFileRoute("/admin/reportes-ventas")({
  head: () => ({
    meta: [
      { title: "Reportes administrativos | Costea POS" },
      {
        name: "description",
        content:
          "Reportes de ventas, meta mensual y exportación a Excel compatible con Costea Pro.",
      },
      { property: "og:title", content: "Reportes administrativos | Costea POS" },
      { property: "og:description", content: "Ventas, metas y exportación contable." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ReportsScreen />,
});
