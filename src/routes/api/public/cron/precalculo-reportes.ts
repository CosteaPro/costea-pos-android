/**
 * Proceso nocturno: calcula y guarda el Mix y el P&G del día y del acumulado
 * del mes, para que las pantallas abran al instante.
 * Se ejecuta una vez al día; el llamante debe enviar la clave del proceso.
 */
import { createFileRoute } from "@tanstack/react-router";

async function ejecutar(request: Request) {
  const enviado = request.headers.get("x-cron-secret") ?? "";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Se acepta la clave del entorno o la clave interna que usa la tarea nocturna.
  const cliente = supabaseAdmin as unknown as {
    schema: (s: string) => {
      from: (t: string) => {
        select: (c: string) => {
          maybeSingle: () => Promise<{ data: { secret?: string } | null }>;
        };
      };
    };
  };
  const { data: fila } = await cliente.schema("private").from("cron_secret").select("secret")
    .maybeSingle();
  const validas = [process.env["CRON_SECRET"], (fila as { secret?: string } | null)?.secret].filter(
    (s): s is string => Boolean(s),
  );
  if (!enviado || !validas.includes(enviado)) {
    return new Response("No autorizado", { status: 401 });
  }
  const { recalcularSnapshots } = await import("@/lib/reportes-cache.server");
  const { empresaScoped } = await import("@/lib/db-empresa");
  const { fechaEc } = await import("@/lib/fecha-ec");
  try {
    // Sin parámetro se procesa el día anterior, ya cerrado (la tarea corre a
    // las 00:15 de Ecuador), y también el día en curso para dejarlo listo.
    const url = new URL(request.url);
    const pedida = url.searchParams.get("fecha");
    const hoy = fechaEc(new Date());
    const ayer = new Date(`${hoy}T12:00:00Z`);
    ayer.setUTCDate(ayer.getUTCDate() - 1);
    const objetivo = pedida ?? ayer.toISOString().slice(0, 10);

    // Cada empresa activa recibe su propio cálculo, con sus propios datos.
    const { data: empresas, error } = await supabaseAdmin
      .from("platform_companies")
      .select("id, slug")
      .is("deleted_at", null);
    if (error) throw new Error(error.message);

    const resultados: { empresa: string; dia: string; desde: string }[] = [];
    for (const empresa of empresas ?? []) {
      const db = empresaScoped(supabaseAdmin, empresa.id as string);
      const res = await recalcularSnapshots(db, empresa.id as string, objetivo);
      if (!pedida) await recalcularSnapshots(db, empresa.id as string, hoy);
      resultados.push({ empresa: String(empresa.slug ?? empresa.id), dia: res.dia, desde: res.desde });
    }
    return Response.json({ ok: true, hoy, empresas: resultados });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 },
    );
  }
}


export const Route = createFileRoute("/api/public/cron/precalculo-reportes")({
  server: {
    handlers: {
      POST: ({ request }) => ejecutar(request),
      GET: ({ request }) => ejecutar(request),
    },
  },
});
