import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";

export const Route = createFileRoute("/admin/horarios")({
  head: () => ({
    meta: [
      { title: "Horarios y asistencia | Costea Pro" },
      {
        name: "description",
        content:
          "Control de horarios y asistencia del personal del restaurante dentro del módulo de talento humano.",
      },
      { property: "og:title", content: "Horarios y asistencia | Costea Pro" },
      { property: "og:description", content: "Turnos y asistencia del equipo del restaurante." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HorariosPage,
});

function HorariosPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Horarios y asistencia
        </h1>
        <p className="text-sm text-muted-foreground">
          Turnos del personal y registro de entradas y salidas del equipo.
        </p>
      </header>

      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
        <CalendarClock className="size-8 text-muted-foreground" />
        <h2 className="font-display text-lg font-semibold">Pantalla en preparación</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Esta opción del módulo de talento humano aún no tiene datos configurados. Indícanos cómo
          quieres registrar turnos y asistencia (marcación por usuario, horarios semanales, atrasos)
          y la habilitamos aquí mismo.
        </p>
      </div>
    </div>
  );
}
