import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { detectPrintBridge, getPrintBridgeUrl, setPrintBridgeUrl } from "@/lib/silent-print";

/**
 * Puente de impresión local: permite enviar el ticket directo a la impresora
 * POS-80 sin vista previa ni cuadro de impresión del navegador.
 */
export function PrintBridgeField() {
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => setUrl(getPrintBridgeUrl()), []);

  const guardar = () => {
    setPrintBridgeUrl(url);
    toast.success(url.trim() ? "Puente de impresión guardado en este equipo" : "Puente de impresión desactivado");
  };

  const detectar = async () => {
    setDetecting(true);
    const found = await detectPrintBridge();
    setDetecting(false);
    if (found) {
      setUrl(found);
      toast.success("Agente de impresión detectado y guardado");
    } else {
      toast.error("No se encontró el agente. Ejecute iniciar-agente.bat en este equipo.");
    }
  };

  const probar = async () => {
    const target = url.trim();
    if (!target) return toast.error("Ingresa la dirección del puente de impresión");
    setTesting(true);
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: "<html><body style='font-family:Arial;width:72mm'><h3>Costea POS</h3><p>Prueba de impresión directa</p></body></html>",
          job: "Prueba Costea POS",
          width: "80mm",
        }),
      });
      if (res.ok) toast.success("El puente respondió correctamente");
      else toast.error(`El puente respondió ${res.status}`);
    } catch {
      toast.error("No se pudo contactar el puente de impresión");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-2 p-3">
      <Label htmlFor="print-bridge" className="text-xs font-semibold text-foreground">
        Puente de impresión local (impresión directa sin diálogo)
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="print-bridge"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:9110/print"
          inputMode="url"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={guardar}>
            Guardar
          </Button>
          <Button type="button" variant="outline" onClick={detectar} disabled={detecting}>
            <Radar className="size-4" /> Detectar
          </Button>
          <Button type="button" variant="outline" onClick={probar} disabled={testing}>
            Probar
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Se guarda solo en este equipo. El agente recibe un POST con
        <span className="font-mono"> {"{ html, job, printer, width }"} </span>
        y lo envía a la impresora indicada en Cocina, Parrilla o Punto de Venta. Si no hay puente disponible,
        el ticket se imprime igual desde un marco oculto.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild type="button" variant="outline" size="sm">
          <a href="/agente-impresion/costea-print-agent.js" download>
            <Download className="size-4" /> Descargar agente (.js)
          </a>
        </Button>
        <Button asChild type="button" variant="outline" size="sm">
          <a href="/agente-impresion/iniciar-agente.bat" download>
            <Download className="size-4" /> Descargar iniciar-agente.bat
          </a>
        </Button>
      </div>
      <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
        <li>Instale Node.js en el equipo de caja o cocina (nodejs.org).</li>
        <li>Guarde los dos archivos en una carpeta, por ejemplo C:\CosteaPOS.</li>
        <li>
          Comparta la impresora POS-80 en Windows y use ese nombre compartido en “Impresora Punto de Venta”,
          “Cocina” o “Parrilla”.
        </li>
        <li>Ejecute iniciar-agente.bat y pulse “Detectar”. Desde ahí todo se imprime sin ninguna ventana.</li>
      </ol>
    </div>
  );
}
