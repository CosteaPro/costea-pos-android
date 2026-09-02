import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, HardDriveDownload, ListRestart, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  BACKUP_TABLES,
  exportBackupZip,
  readBackupZip,
  restoreImages,
} from "@/lib/backup";
import { importBackupTable, resyncSequences } from "@/lib/backup.functions";

export const Route = createFileRoute("/admin/respaldo")({
  head: () => ({
    meta: [
      { title: "Respaldo y migración de datos | Módulo administrativo" },
      {
        name: "description",
        content:
          "Exporta e importa todos los datos del establecimiento: comprobantes, maestros, movimientos, imágenes y configuración.",
      },
      { property: "og:title", content: "Respaldo y migración de datos" },
      {
        property: "og:description",
        content: "Paquete comprimido con toda tu información, listo para migrar de versión.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BackupPage,
});

function BackupPage() {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [continuar, setContinuar] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportar = async () => {
    setBusy(true);
    setLog([]);
    try {
      const manifest = await exportBackupZip(setStep);
      const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
      setLog([
        `Registros exportados: ${total}`,
        `Comprobantes XML: ${manifest.xml_files}`,
        `Imágenes: ${manifest.images}`,
      ]);
      toast.success("Respaldo generado y descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el respaldo");
    } finally {
      setBusy(false);
      setStep("");
    }
  };

  const importar = async (file: File) => {
    setBusy(true);
    setLog([]);
    const resumen: string[] = [];
    try {
      setStep("Leyendo el paquete…");
      const { tables, images } = await readBackupZip(file);

      for (const table of BACKUP_TABLES) {
        const rows = tables[table] ?? [];
        if (!rows.length) continue;
        setStep(`Importando ${table} (${rows.length})…`);
        let inserted = 0;
        let skipped = 0;
        for (let i = 0; i < rows.length; i += 200) {
          const res = await importBackupTable({
            data: { table, rows: rows.slice(i, i + 200) },
          });
          inserted += res.inserted;
          skipped += res.skipped;
        }
        resumen.push(`${table}: ${inserted} nuevos, ${skipped} ya existían`);
      }

      if (images.length) {
        setStep(`Restaurando ${images.length} imágenes…`);
        const ok = await restoreImages(images);
        resumen.push(`imágenes: ${ok} restauradas`);
      }

      if (continuar) {
        setStep("Reanudando la numeración…");
        await resyncSequences();
        resumen.push("Numeración secuencial reanudada desde el último registro importado.");
      }

      setLog(resumen);
      toast.success(
        "Importación completada. Recuerda cargar tu firma electrónica y gestionar los accesos de usuarios.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo importar el respaldo");
    } finally {
      setBusy(false);
      setStep("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Respaldo y migración de datos
        </h1>
        <p className="text-sm text-muted-foreground">
          Toda la información es tuya: descárgala completa o restáurala en una versión nueva de
          Costea.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Download className="size-5" /> Exportación completa
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Comprobantes: facturas, notas de venta, XML autorizados y estados.</li>
            <li>
              Maestros: clientes, proveedores, ítems con unidades, conversiones y costos,
              categorías, unidades de medida e imágenes.
            </li>
            <li>Movimientos: compras, ventas, transferencias, bajas y consumos.</li>
            <li>Configuración del establecimiento.</li>
          </ul>
          <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">
            ⚠️ Excluido por seguridad: firma electrónica (.p12/.pfx), su contraseña y las
            contraseñas de usuarios. Se configuran manualmente en la versión nueva.
          </p>
          <Button onClick={exportar} disabled={busy}>
            <HardDriveDownload className="mr-2 size-4" />
            {busy ? "Procesando…" : "Descargar respaldo (.zip)"}
          </Button>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Upload className="size-5" /> Importación en versión nueva
          </h2>
          <p className="text-sm text-muted-foreground">
            Reconoce automáticamente la estructura, datos, configuraciones e imágenes. Los registros
            existentes no se duplican ni se sobrescriben.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[hsl(var(--primary))]"
              checked={continuar}
              onChange={(e) => setContinuar(e.target.checked)}
            />
            <ListRestart className="size-4 text-muted-foreground" />
            Continuar la numeración desde el último registro importado
          </label>
          <div>
            <Label>Paquete de respaldo (.zip)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              disabled={busy}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (
                  window.confirm(
                    "⚠️ Se importarán todos los datos del paquete. Los registros existentes se conservan intactos.\n\n¿Deseas continuar?",
                  )
                ) {
                  importar(f);
                } else if (fileRef.current) {
                  fileRef.current.value = "";
                }
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Al terminar debes cargar tu firma electrónica en Configuración y gestionar los accesos
            de usuarios.
          </p>
        </section>
      </div>

      {(step || log.length > 0) && (
        <section className="rounded-lg border border-border bg-secondary/30 p-4 text-sm">
          {step && <p className="font-medium">{step}</p>}
          {log.length > 0 && (
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {log.map((l) => (
                <li key={l}>• {l}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
