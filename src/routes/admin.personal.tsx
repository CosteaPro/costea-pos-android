import { createFileRoute } from "@tanstack/react-router";
import { StaffPanel } from "@/routes/configuracion";

export const Route = createFileRoute("/admin/personal")({
  head: () => ({
    meta: [
      { title: "Personal y empleados | Costea Pro" },
      {
        name: "description",
        content:
          "Listado del personal del restaurante: usuarios activos, correos, nombres de usuario y su rol operativo.",
      },
      { property: "og:title", content: "Personal y empleados | Costea Pro" },
      { property: "og:description", content: "Equipo de trabajo del restaurante." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PersonalPage,
});

function PersonalPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Personal / Empleados</h1>
        <p className="text-sm text-muted-foreground">
          Equipo del restaurante con su usuario de acceso y el rol con el que trabaja a diario.
        </p>
      </header>
      <StaffPanel />
    </div>
  );
}
