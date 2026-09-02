import { useCallback, useEffect, useState } from "react";
import { Bluetooth, Check, Loader2, RefreshCw, Share2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buscarImpresoraBle,
  compartirTicket,
  esMovil,
  getImpresoraBluetooth,
  getMetodoMovil,
  imprimirConApp,
  imprimirPorBle,
  setImpresoraBluetooth,
  setMetodoMovil,
  soportaBluetooth,
  ticketPruebaEscPos,
  ticketPruebaTexto,
  type MetodoMovil,
} from "@/lib/bluetooth-print";
import {
  conectarImpresora,
  estadoBluetooth,
  getEventos,
  getImpresoraNativa,
  imprimirNativo,
  limpiarEventos,
  listarEmparejadas,
  pedirPermisos,
  reconectarImpresora,
  soportaBluetoothNativo,
  type EventoImpresion,
  type ImpresoraNativa,
} from "@/lib/native-print";

/** Configuración de impresión térmica desde el celular. */
export function MobilePrintCard({ negocio }: { negocio?: string | null }) {
  const [metodo, setMetodo] = useState<MetodoMovil | null>(null);
  const [nombre, setNombre] = useState("");
  const [movil, setMovil] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nativo, setNativo] = useState(false);
  const [emparejadas, setEmparejadas] = useState<ImpresoraNativa[]>([]);
  const [elegida, setElegida] = useState<ImpresoraNativa | null>(null);
  const [estado, setEstado] = useState<string>("Verificando Bluetooth…");
  const [eventos, setEventos] = useState<EventoImpresion[]>([]);

  const refrescarEstado = useCallback(async () => {
    const info = await estadoBluetooth();
    setEstado(info.detalle);
    setEventos(getEventos());
  }, []);

  const cargarEmparejadas = useCallback(async () => {
    setOcupado("lista");
    try {
      setEmparejadas(await listarEmparejadas());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer la lista de dispositivos.");
    } finally {
      setOcupado(null);
      void refrescarEstado();
    }
  }, [refrescarEstado]);

  useEffect(() => {
    setMetodo(getMetodoMovil());
    setNombre(getImpresoraBluetooth());
    setMovil(esMovil());
    const enApp = soportaBluetoothNativo();
    setNativo(enApp);
    if (enApp) {
      setElegida(getImpresoraNativa());
      void refrescarEstado();
      void reconectarImpresora();
      void cargarEmparejadas();
    }
  }, [cargarEmparejadas, refrescarEstado]);

  const permisos = async () => {
    setOcupado("permisos");
    try {
      await pedirPermisos();
      toast.success("Bluetooth listo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron activar los permisos.");
    } finally {
      setOcupado(null);
      void refrescarEstado();
    }
  };

  const conectar = async (d: ImpresoraNativa) => {
    setOcupado(d.address);
    try {
      await conectarImpresora(d);
      setElegida(d);
      await imprimirNativo(ticketPruebaEscPos(negocio ?? ""));
      toast.success(`Impresora lista: ${d.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar con la impresora.");
    } finally {
      setOcupado(null);
      void refrescarEstado();
    }
  };

  const probarNativo = async () => {
    setOcupado("prueba");
    const inicio = Date.now();
    try {
      await imprimirNativo(ticketPruebaEscPos(negocio ?? ""));
      toast.success(`Prueba enviada en ${Date.now() - inicio} ms.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La impresora no respondió. Revisa que esté encendida.");
    } finally {
      setOcupado(null);
      void refrescarEstado();
    }
  };

  const borrarBitacora = () => {
    limpiarEventos();
    setEventos([]);
  };



  const elegir = (m: MetodoMovil) => {
    setMetodoMovil(m);
    setMetodo(m);
    toast.success(
      m === "rawbt"
        ? "Listo: los tickets se enviarán a tu app de impresión."
        : m === "ble"
          ? "Listo: los tickets saldrán por Bluetooth directo."
          : "Listo: los tickets se abrirán con el menú de compartir.",
    );
  };

  const guardarNombre = (valor: string) => {
    setNombre(valor);
    setImpresoraBluetooth(valor);
  };

  const probarApp = () => {
    elegir("rawbt");
    const ok = imprimirConApp(ticketPruebaTexto(negocio ?? ""));
    if (!ok) toast.error("El celular no pudo abrir la app de impresión.");
  };

  const buscarBluetooth = async () => {
    setOcupado("ble");
    try {
      const encontrada = await buscarImpresoraBle();
      if (encontrada) guardarNombre(encontrada);
      await imprimirPorBle(ticketPruebaEscPos(negocio ?? ""));
      elegir("ble");
      toast.success(`Impresora conectada: ${encontrada || nombre || "Bluetooth"}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo conectar con la impresora.";
      toast.error(msg.includes("cancel") ? "Búsqueda cancelada." : msg);
    } finally {
      setOcupado(null);
    }
  };

  const compartir = async () => {
    setOcupado("compartir");
    try {
      const ok = await compartirTicket(ticketPruebaTexto(negocio ?? ""), "prueba-ticket.txt");
      if (ok) elegir("compartir");
      else toast.error("Este celular no permite compartir el ticket.");
    } finally {
      setOcupado(null);
    }
  };

  const activo = (m: MetodoMovil) => (metodo === m ? "border-primary bg-primary/10" : "");

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-2 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Smartphone className="size-4 text-primary" /> Impresión en celular (Bluetooth)
      </p>

      {nativo ? (
        <div className="space-y-3 rounded-md border border-primary/30 bg-background p-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bluetooth className="size-4 text-primary" /> Impresora de la app nativa
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Busca la impresora desde Android y conecta directamente por Bluetooth clásico. No necesitas una app intermedia.
            </p>
          </div>

          <div className="rounded-md border border-border p-2">
            <p className="text-xs text-foreground"><strong>Estado:</strong> {estado}</p>
            <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => void permisos()} disabled={ocupado === "permisos"}>
              {ocupado === "permisos" ? <Loader2 className="size-4 animate-spin" /> : <Bluetooth className="size-4" />}
              Activar Bluetooth y permisos
            </Button>
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={() => void cargarEmparejadas()} disabled={ocupado === "lista"}>
            {ocupado === "lista" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Buscar dispositivos Bluetooth
          </Button>


          {emparejadas.length > 0 ? (
            <div className="space-y-2" aria-label="Dispositivos Bluetooth encontrados">
              <p className="text-xs font-semibold text-foreground">Dispositivos encontrados</p>
              {emparejadas.map((dispositivo) => {
                const seleccionada = elegida?.address === dispositivo.address;
                return (
                  <div key={dispositivo.address} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border p-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{dispositivo.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{dispositivo.address}</p>
                    </div>
                    <Button type="button" size="sm" variant={seleccionada ? "secondary" : "default"} onClick={() => void conectar(dispositivo)} disabled={ocupado === dispositivo.address}>
                      {ocupado === dispositivo.address ? <Loader2 className="size-4 animate-spin" /> : seleccionada ? <Check className="size-4" /> : <Bluetooth className="size-4" />}
                      {seleccionada ? "Conectada" : "Conectar"}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No se encontraron dispositivos. Enciende y empareja la 4B-2033PA-EA17 en Ajustes → Bluetooth, con PIN 0000, y vuelve a buscar.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Nombre de la impresora nativa" value={elegida?.name ?? ""} placeholder="4B-2033PA-EA17" readOnly />
            <Button type="button" variant="outline" onClick={() => void probarNativo()} disabled={!elegida || ocupado === "prueba"}>
              {ocupado === "prueba" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Probar impresión
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">La app guardará esta impresora para reconectarse automáticamente al abrirse.</p>

          {eventos.length > 0 && (
            <details className="rounded-md border border-border p-2">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">Diagnóstico ({eventos.length})</summary>
              <div className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-[10px] text-muted-foreground">
                {eventos.map((evento, index) => (
                  <p key={`${evento.hora}-${index}`} className={evento.ok ? "text-success" : "text-destructive"}>
                    {evento.hora} · {evento.ok ? "OK" : "ERROR"} · {evento.detalle}
                  </p>
                ))}
              </div>
              <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 px-1 text-xs" onClick={borrarBitacora}>Limpiar diagnóstico</Button>
            </details>
          )}
        </div>

      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            El navegador del celular no puede tomar por sí solo una impresora Bluetooth clásica ya emparejada.
            Elige uno de estos tres caminos; el que elijas se usará para todos tus tickets.
          </p>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className={`h-auto w-full justify-start whitespace-normal py-3 text-left ${activo("rawbt")}`}
          onClick={probarApp}
        >
          <span>
            <span className="block text-sm font-semibold">1 · Enviar a mi app de impresión (recomendado)</span>
            <span className="block text-xs text-muted-foreground">
              Usa la app que ya imprime bien (RawBT u otra compatible ESC/POS). Toca para probar.
            </span>
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={ocupado === "ble" || !soportaBluetooth()}
          className={`h-auto w-full justify-start whitespace-normal py-3 text-left ${activo("ble")}`}
          onClick={buscarBluetooth}
        >
          <span className="flex items-start gap-2">
            {ocupado === "ble" ? (
              <Loader2 className="mt-0.5 size-4 animate-spin" />
            ) : (
              <Bluetooth className="mt-0.5 size-4" />
            )}
            <span>
              <span className="block text-sm font-semibold">2 · Buscar impresora Bluetooth</span>
              <span className="block text-xs text-muted-foreground">
                {soportaBluetooth()
                  ? "Solo aparecerá si la impresora trabaja en modo BLE. Imprime una prueba al conectar."
                  : "Este navegador no permite Bluetooth. Usa Chrome en Android."}
              </span>
            </span>
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={ocupado === "compartir"}
          className={`h-auto w-full justify-start whitespace-normal py-3 text-left ${activo("compartir")}`}
          onClick={compartir}
        >
          <span className="flex items-start gap-2">
            {ocupado === "compartir" ? (
              <Loader2 className="mt-0.5 size-4 animate-spin" />
            ) : (
              <Share2 className="mt-0.5 size-4" />
            )}
            <span>
              <span className="block text-sm font-semibold">3 · Compartir / Abrir con…</span>
              <span className="block text-xs text-muted-foreground">
                Entrega el ticket al menú del celular para elegir cualquier app de impresión.
              </span>
            </span>
          </span>
        </Button>
       </div>
       </>
      )}

      {!nativo && <div className="space-y-1">
        <Label className="text-xs">Nombre exacto de la impresora</Label>
        <Input
          value={nombre}
          placeholder="4B-2033PA-EA17"
          onChange={(e) => guardarNombre(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Se guarda como tu impresora preferida y se muestra al conectar.
        </p>
       </div>}

       {!nativo && metodo && (
        <p className="text-xs text-foreground">
          Método activo:{" "}
          <strong>
            {metodo === "rawbt"
              ? "App de impresión"
              : metodo === "ble"
                ? "Bluetooth directo"
                : "Compartir"}
          </strong>{" "}
          ·{" "}
          <button type="button" className="underline" onClick={() => { setMetodoMovil(null); setMetodo(null); }}>
            quitar
          </button>
        </p>
       )}

       {!nativo && <div className="rounded bg-background p-2 text-xs text-muted-foreground">
         <p className="font-semibold text-foreground">Si la impresora aún no está emparejada</p>
         <p>Ajustes del celular → Bluetooth → 4B-2033PA-EA17 → PIN 0000 (modo Sencillo). Luego vuelve aquí.</p>
         {!movil && <p className="mt-1">Estás en computadora: esta sección aplica al usar el sistema desde el celular.</p>}
       </div>}
     </div>
  );
}
