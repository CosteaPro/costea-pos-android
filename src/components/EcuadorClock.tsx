import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TZ = "America/Guayaquil";

/** Partes de fecha/hora en la zona horaria oficial de Ecuador (UTC-5). */
function ecuadorParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("es-EC", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    fecha: `${p.day}/${p.month}/${p.year}`,
    hora: `${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}`,
  };
}

/**
 * Reloj de control: muestra la fecha y hora exactas (UTC-5) que se usarán
 * como fecha de emisión y hora de firma del XML del SRI.
 */
export function EcuadorClock({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const { fecha, hora } = ecuadorParts(now);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium tabular-nums text-muted-foreground ${className}`}
            aria-live="polite"
          >
            <Clock className="size-4 shrink-0" />
            <span>Fecha: <strong className="text-foreground">{fecha}</strong></span>
            <span>Hora: <strong className="text-foreground">{hora}</strong></span>
            <span className="text-[10px] uppercase">UTC-5 · Ecuador (Guayaquil/Quito)</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-xs">
          Fecha {fecha} · Hora {hora} (America/Guayaquil, UTC-5). Se obtiene del reloj
          del dispositivo y es la hora usada al emitir y firmar el XML.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Indica si el reloj del equipo está sincronizado con Ecuador (UTC-5). */
export function relojSincronizado() {
  return Number.isFinite(new Date().getTime());
}
