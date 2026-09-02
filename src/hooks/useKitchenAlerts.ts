import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { esCajaLocal } from "@/lib/caja-local";

export type ReadyOrder = {
  id: string;
  folio: number;
  table_id: string | null;
  table_name: string | null;
  service_type: string;
  customer_name: string | null;
};

/** Aviso sonoro corto generado en el navegador (sin archivos externos). */
function beep() {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (start: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.4);
    };
    play(0, 880);
    play(0.35, 1175);
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // El navegador puede bloquear el audio hasta la primera interacción del usuario.
  }
}

/** Anuncio de voz en español (es-EC). Silencioso si el navegador no lo soporta. */
function hablar(texto: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-EC";
    u.rate = 0.95;
    u.pitch = 1;
    u.volume = 1;
    const voz = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("es"));
    if (voz) u.voice = voz;
    window.speechSynthesis.speak(u);
  } catch {
    // El navegador puede bloquear la voz hasta la primera interacción del usuario.
  }
}

/** Texto claro del destino del pedido para el anuncio de voz. */
function destino(r: ReadyOrder) {
  if (r.table_name) return `Mesa ${r.table_name}`;
  if (r.service_type === "llevar") return "Para llevar";
  if (r.service_type === "domicilio") return "A domicilio";
  return `Pedido ${r.folio}`;
}

const RECORDATORIO_MS = 2 * 60 * 1000;

/**
 * Pedidos marcados como listos en cocina y aún no entregados.
 * Con `sound` activo emite el aviso sonoro, el anuncio de voz "Orden lista — Mesa X"
 * y un recordatorio hablado cada 2 minutos hasta que el mesero la retire.
 */
export function useKitchenAlerts({ sound = false }: { sound?: boolean } = {}) {
  const [ready, setReady] = useState<ReadyOrder[]>([]);
  const known = useRef<Set<string> | null>(null);
  const pendientes = useRef<Map<string, { orden: ReadyOrder; ultimo: number }>>(new Map());

  const load = useCallback(async () => {
    if (esCajaLocal()) {
      setReady([]);
      return;
    }
    const { data } = await supabase
      .from("orders")
      .select("id, folio, table_id, service_type, customer_name, restaurant_tables(name)")
      .eq("status", "listo")
      .is("delivered_at", null)
      .order("ready_at");

    const rows: ReadyOrder[] = (data ?? []).map((o) => {
      const rel = (o as { restaurant_tables?: { name: string } | { name: string }[] | null })
        .restaurant_tables;
      const table_name = Array.isArray(rel) ? (rel[0]?.name ?? null) : (rel?.name ?? null);
      return {
        id: o.id,
        folio: o.folio,
        table_id: o.table_id,
        table_name,
        service_type: o.service_type,
        customer_name: o.customer_name,
      };
    });

    setReady(rows);

    if (sound) {
      const first = known.current === null;
      const seen = known.current ?? new Set<string>();
      const nuevos = rows.filter((r) => !seen.has(r.id));
      known.current = new Set(rows.map((r) => r.id));

      // Mantener solo las órdenes que siguen listas y sin retirar.
      const vivas = new Set(rows.map((r) => r.id));
      pendientes.current.forEach((_, id) => {
        if (!vivas.has(id)) pendientes.current.delete(id);
      });
      rows.forEach((r) => {
        const prev = pendientes.current.get(r.id);
        pendientes.current.set(r.id, { orden: r, ultimo: prev?.ultimo ?? Date.now() });
      });

      if (!first && nuevos.length > 0) {
        beep();
        nuevos.forEach((r) => {
          const donde = destino(r);
          pendientes.current.set(r.id, { orden: r, ultimo: Date.now() });
          hablar(`Orden lista. ${donde}`);
          toast.warning(`${donde} - Pedido listo para entregar`, {
            description: `Comanda #${r.folio}`,
            duration: 10000,
          });
        });
      }
    }
  }, [sound]);

  useEffect(() => {
    load();
    if (esCajaLocal()) return;
    const channel = supabase
      .channel(`alertas-cocina-${sound ? "sonido" : "vista"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, sound]);

  // Recordatorio hablado cada 2 minutos mientras la orden siga sin retirarse.
  useEffect(() => {
    if (!sound) return;
    const id = window.setInterval(() => {
      const ahora = Date.now();
      pendientes.current.forEach((p, key) => {
        if (ahora - p.ultimo < RECORDATORIO_MS) return;
        pendientes.current.set(key, { ...p, ultimo: ahora });
        const donde = destino(p.orden);
        beep();
        hablar(`Recordatorio: orden lista de ${donde} pendiente de retiro`);
        toast.warning(`${donde} — pendiente de retiro`, {
          description: `Comanda #${p.orden.folio}`,
          duration: 10000,
        });
      });
    }, 15000);
    return () => window.clearInterval(id);
  }, [sound]);


  const readyTableIds = new Set(ready.map((r) => r.table_id).filter(Boolean) as string[]);

  return { ready, readyTableIds, reload: load };
}
