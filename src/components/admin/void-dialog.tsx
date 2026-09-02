import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { verificarClaveAdministrativa } from "@/lib/anulacion.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmación de anulación interna: motivo obligatorio y clave del
 * administrador (se valida siempre contra el servidor central).
 */
export function VoidDialog({
  open,
  title,
  subject,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subject: string;
  onOpenChange: (v: boolean) => void;
  onConfirm: (motivo: string) => Promise<void>;
}) {
  const verificar = useServerFn(verificarClaveAdministrativa);
  const [motivo, setMotivo] = useState("");
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cerrar = (v: boolean) => {
    if (enviando) return;
    if (!v) {
      setMotivo("");
      setClave("");
    }
    onOpenChange(v);
  };

  const confirmar = async () => {
    if (motivo.trim().length < 5) return toast.error("Escriba el motivo (mínimo 5 caracteres)");
    if (!clave) return toast.error("Ingrese su clave de administrador");
    setEnviando(true);
    try {
      await verificar({ data: { clave } });
      await onConfirm(motivo.trim());
      toast.success("Documento anulado internamente");
      cerrar(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anular");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {subject} · La anulación es interna: no se envía al SRI y el número de secuencia no se
            reutiliza. Queda registrado quién anuló, cuándo y por qué.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Motivo de la anulación</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: error en los datos del cliente"
            />
          </div>
          <div>
            <Label>Clave de administrador</Label>
            <Input
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={enviando}>
            {enviando ? "Anulando…" : "Anular definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
