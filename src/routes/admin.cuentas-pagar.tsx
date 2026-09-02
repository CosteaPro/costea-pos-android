import { createFileRoute } from "@tanstack/react-router";
import { PayablesPanel } from "@/components/admin/accounts";

export const Route = createFileRoute("/admin/cuentas-pagar")({
  head: () => ({
    meta: [
      { title: "Cuentas por pagar | Módulo administrativo" },
      {
        name: "description",
        content:
          "Compras y gastos a crédito de proveedores con vencimiento, saldos vencidos y registro de pago.",
      },
      { property: "og:title", content: "Cuentas por pagar | Módulo administrativo" },
      { property: "og:description", content: "Control de deudas con proveedores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cuentas por pagar</h1>
        <p className="text-sm text-muted-foreground">
          Compras y gastos a crédito con proveedor, vencimiento y estado de pago.
        </p>
      </header>
      <PayablesPanel />
    </div>
  ),
});
