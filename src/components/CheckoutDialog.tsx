import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Receipt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSignatureStatus } from "@/lib/signature.functions";

import { supabase } from "@/integrations/supabase/client";
import { useSalesChannels } from "@/hooks/useSalesChannels";
import { consultarContribuyente } from "@/lib/sri-contribuyente";
import { EcuadorClock, relojSincronizado } from "@/components/EcuadorClock";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  currency,
  splitTax,
  PAYMENT_METHODS,
  esPagoCredito,
  type CompanySettings,
  type DocType,
} from "@/lib/pos";
import { amountInWords, buildAccessKey, docNumber, isValidCedula, isValidRuc } from "@/lib/sri";
import { esCajaLocal, leerConfigCajaLocal, puenteCaja } from "@/lib/caja-local";
import {
  commitDocumentSequence,
  peekDocumentSequence,
} from "@/lib/document-numbering.functions";
import { formatOrderNumber, takeDailyOrderNumber } from "@/lib/document-numbering";


export type CheckoutResult = {
  doc_type: DocType;
  payment_method: string;
  sales_channel: string;
  customer_id_type: string | null;
  customer_id_number: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  access_key: string | null;
  doc_number: string | null;
  amount_in_words: string | null;
  iva_rate: number;
  tax_amount: number;
  subtotal: number;
  total: number;
  received_amount: number | null;
  change_amount: number | null;
  /** Datos del crédito al cliente (solo cuando la forma de pago es "credito"). */
  credit_customer_name: string | null;
  credit_customer_id: string | null;
  credit_phone: string | null;
  credit_due_date: string | null;
  credit_status: string | null;
  /** Instante capturado exclusivamente del reloj del dispositivo al confirmar. */
  issued_at_device: string;
  related_doc_number: string | null;
  related_access_key: string | null;
};

/** Extrae un texto legible de cualquier error (Error, PostgrestError, Response, objeto plano). */
function readMessage(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o["message"], o["error_description"], o["error"], o["details"], o["hint"]]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    if (parts.length > 0) return parts.join(" · ");
    if (typeof o["statusText"] === "string" && o["statusText"]) return String(o["statusText"]);
    try {
      return JSON.stringify(e);
    } catch {
      return "Error desconocido";
    }
  }
  return String(e);
}

export function CheckoutDialog({
  open,
  onOpenChange,
  total: totalBruto,
  company,
  salesChannel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  company: CompanySettings | null;
  salesChannel: string;
  onConfirm: (result: CheckoutResult) => Promise<void> | void;
}) {
  const checkSignature = useServerFn(getSignatureStatus);
  const consultarSecuencia = useServerFn(peekDocumentSequence);
  const commitSequence = useServerFn(commitDocumentSequence);
  // Después de guardar la venta se avanza Configuración en 1. Nunca antes.
  const avanzarConfiguracion = async (sequential: number) => {
    if (esCajaLocal()) return;
    // El número SIEMPRE avanza tras emitir: un reintento y aviso claro si falla,
    // porque repetir un secuencial hace que el SRI rechace la factura.
    for (let intento = 0; intento < 2; intento++) {
      try {
        await commitSequence({ data: { sequential } });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    toast.error(
      `No se pudo avanzar la numeración a ${sequential + 1}. Actualízala en Configuración antes de emitir otra factura.`,
    );
  };

  const [docType, setDocType] = useState<DocType>("nota_venta");
  const [payment, setPayment] = useState("efectivo");
  const [channel, setChannel] = useState(salesChannel);
  const { channels: salesChannels } = useSalesChannels();
  const [idType, setIdType] = useState("cedula");
  const [idNumber, setIdNumber] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [received, setReceived] = useState("");
  const [creditName, setCreditName] = useState("");
  const [creditId, setCreditId] = useState("");
  const [creditPhone, setCreditPhone] = useState("");
  const [creditDue, setCreditDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [consultandoSri, setConsultandoSri] = useState(false);
  const [relatedDocNumber, setRelatedDocNumber] = useState("");
  const [relatedAccessKey, setRelatedAccessKey] = useState("");

  const ivaRate = company?.iva_rate ?? 15;
  const receivedNum = Number(received.replace(",", ".")) || 0;
  // El total efectivo es base + IVA redondeado (regla SRI): es el mismo valor que
  // se muestra, se cobra, se guarda y se envía en el XML.
  const { base, tax, total } = useMemo(() => splitTax(totalBruto, ivaRate), [totalBruto, ivaRate]);
  const change = Math.round((receivedNum - total) * 100) / 100;

  /** Identificación normalizada: solo dígitos, salvo pasaporte (alfanumérico). */
  const cleanId = () =>
    idType === "pasaporte"
      ? idNumber.trim().toUpperCase()
      : idNumber.replace(/\D/g, "");

  const validCustomer = () => {
    if (!name.trim()) return "Ingresa el nombre o razón social del cliente";
    const digits = idNumber.replace(/\D/g, "");
    if (idType === "cedula" && !isValidCedula(digits)) return "Cédula inválida (10 dígitos)";
    if (idType === "ruc" && !isValidRuc(digits))
      return "RUC inválido: deben ser 13 dígitos numéricos (provincia 01-24 y establecimiento distinto de 000)";
    if (idType === "consumidor_final" && digits !== "9999999999999")
      return "Para consumidor final usa 9999999999999";
    if (idType === "pasaporte" && idNumber.trim().length < 5) return "Pasaporte inválido";
    return null;
  };


  /** Trae del SRI el nombre, la dirección y el teléfono del contribuyente. */
  const consultarSri = async (digits: string) => {
    if (digits.length !== 10 && digits.length !== 13) return;
    setConsultandoSri(true);
    const datos = await consultarContribuyente(digits);
    setConsultandoSri(false);
    if (!datos) {
      toast.info("El SRI no devolvió datos: escribe el nombre del cliente a mano");
      return;
    }
    setName(datos.razonSocial);
    if (datos.direccion) setAddress(datos.direccion);
    if (datos.telefono) setPhone(datos.telefono);
    setIdType(datos.tipoIdentificacion);
    toast.success(`SRI: ${datos.razonSocial}`);
  };

  /** Carga automática del cliente registrado al escribir su identificación. */
  const lookupCustomer = async (value: string) => {
    const digits = value.replace(/\s/g, "");
    if (digits.length < 10) return;
    const caja = puenteCaja();
    if (caja?.buscarCliente) {
      const local = await caja.buscarCliente(digits);
      if (local) {
        setName(String(local["name"] ?? local["razonSocial"] ?? ""));
        setAddress(String(local["address"] ?? local["direccion"] ?? ""));
        setEmail(String(local["email"] ?? ""));
        setPhone(String(local["phone"] ?? local["telefono"] ?? ""));
        setIdType(String(local["id_type"] ?? local["tipoIdentificacion"] ?? idType));
        toast.info(`Cliente registrado: ${String(local["name"] ?? local["razonSocial"] ?? "")}`);
        return;
      }
      await consultarSri(digits.replace(/\D/g, ""));
      return;
    }
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("id_number", digits)
      .maybeSingle();
    if (!data) {
      await consultarSri(digits.replace(/\D/g, ""));
      return;
    }
    setName(data.name);
    setAddress(data.address ?? "");
    setEmail(data.email ?? "");
    setPhone(data.phone ?? "");
    setIdType(data.id_type ?? idType);
    toast.info(`Cliente registrado: ${data.name}`);
  };

  /** Revisa los requisitos legales antes de emitir una factura electrónica. */
  const validateFacturaSetup = async (): Promise<string | null> => {
    if (!company) return "No se pudo cargar la configuración de la empresa. Recarga la página.";
    if (!company.business_name?.trim())
      return "Falta la razón social en Configuración → Datos del contribuyente.";
    if (!company.ruc || !isValidRuc(company.ruc))
      return "El RUC de la empresa es inválido o está vacío (13 dígitos terminados en 001).";
    if (!company.address?.trim())
      return "Falta la dirección matriz en Configuración → Datos del contribuyente.";
    if (!company.establishment || !company.emission_point)
      return "Falta el establecimiento o punto de emisión en Configuración → Numeración autorizada SRI.";

    if (esCajaLocal()) {
      const local = await leerConfigCajaLocal();
      if (!local?.firmaArchivo)
        return "Falta cargar el archivo de firma electrónica .p12 en la configuración local de esta caja.";
      return null;
    }

    let firma: { hasFile: boolean; hasPassword: boolean };
    try {
      firma = await checkSignature();
    } catch (e) {
      return `No se pudo verificar la firma electrónica: ${e instanceof Error ? e.message : "error desconocido"}`;
    }
    if (!firma.hasFile)
      return "Falta cargar el archivo de firma electrónica .p12 en Configuración → Firma electrónica.";
    if (!firma.hasPassword)
      return "Falta la contraseña de la firma electrónica .p12 en Configuración → Firma electrónica.";
    return null;
  };


  const describeError = (e: unknown) => {
    const msg = readMessage(e);
    if (/Failed to fetch|NetworkError|network/i.test(msg))
      return "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
    if (/Unauthorized|401|JWT/i.test(msg))
      return "Tu sesión expiró. Vuelve a iniciar sesión para cobrar.";
    if (/Solo caja|row-level security/i.test(msg))
      return "Tu usuario no tiene permiso para cobrar. Pide al administrador el rol de Cajero.";
    if (/secuencial/i.test(msg))
      return `No se pudo reservar el número de comprobante: ${msg}. Revisa la numeración en Configuración.`;
    return msg || "No se pudo cobrar. Inténtalo nuevamente.";
  };

  /** Datos del crédito al cliente que se guardan junto al comprobante. */
  const creditPayload = () =>
    esPagoCredito(payment)
      ? {
          credit_customer_name: creditName.trim(),
          credit_customer_id: creditId.replace(/\s/g, ""),
          credit_phone: creditPhone.trim() || null,
          credit_due_date: creditDue || null,
          credit_status: "pendiente",
        }
      : {
          credit_customer_name: null,
          credit_customer_id: null,
          credit_phone: null,
          credit_due_date: null,
          credit_status: null,
        };

  /** Valida los campos obligatorios del crédito al cliente. */
  const validCredit = () => {
    if (!esPagoCredito(payment)) return null;
    if (!creditName.trim()) return "Ingresa el nombre completo del cliente a crédito";
    const digits = creditId.replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 13)
      return "Ingresa la cédula (10 dígitos) o RUC (13 dígitos) del cliente a crédito";
    if (!creditDue) return "Ingresa la fecha de vencimiento del crédito";
    return null;
  };

  /** Deja el formulario en blanco para la siguiente venta. */
  const resetCustomerFields = () => {
    setPayment("efectivo");
    setIdType("cedula");
    setIdNumber("");
    setName("");
    setAddress("");
    setEmail("");
    setPhone("");
    setReceived("");
    setCreditName("");
    setCreditId("");
    setCreditPhone("");
    setCreditDue("");
    setRelatedDocNumber("");
    setRelatedAccessKey("");
  };

  const submit = async () => {
    setBusy(true);
    try {
      const issuedAtDevice = new Date();
      if (!Number.isFinite(issuedAtDevice.getTime())) {
        toast.error("La fecha y hora del dispositivo no son válidas. Corrígelas antes de emitir.");
        return;
      }
      const creditErr = validCredit();
      if (creditErr) {
        toast.error(creditErr);
        return;
      }
      if (docType !== "nota_venta") {
        // En navegador factura el servidor; la caja instalada firma y numera localmente aun sin internet.
        if (!esCajaLocal() && typeof navigator !== "undefined" && !navigator.onLine) {
          toast.error("Sin conexión — esperando para facturar");
          return;
        }
        if (!relojSincronizado()) {
          toast.error(
            "La fecha y hora del equipo no coinciden con Ecuador (UTC-5). Corrígelas antes de emitir la factura electrónica.",
          );
          return;
        }
        const setupErr = await validateFacturaSetup();
        if (setupErr) {
          toast.error(setupErr);
          return;
        }

        const err = validCustomer();
        if (err) {
          toast.error(err);
          return;
        }
        // Se lee Configuración en este instante: ese es el único número válido.
        let row: { establishment: string; emission_point: string; sequential: number };
        try {
          const local = puenteCaja();
          if (local) {
            const estado = await local.secuencia();
            row = {
              establishment: estado.establishment || company?.establishment || "001",
              emission_point: estado.emissionPoint || company?.emission_point || "001",
              sequential: estado.nextSequential,
            };
          } else {
            const remoto = await consultarSecuencia({});
            row = {
              establishment: remoto.establishment || company?.establishment || "001",
              emission_point: remoto.emission_point || company?.emission_point || "001",
              sequential: remoto.next_sequential,
            };
          }
        } catch {
          toast.error("No se pudo leer la numeración de Configuración. Revisa tu conexión e inténtalo de nuevo.");
          return;
        }
        const seq = row.sequential;

        const key = buildAccessKey({
          date: issuedAtDevice,
          ruc: company!.ruc,
          environment: company!.environment || "1",
          establishment: row.establishment,
          emissionPoint: row.emission_point,
          sequential: seq,
          emissionType: company!.emission_type || "1",
          docCode: "01",
        });

        const idFinal = cleanId();

        // Guarda o actualiza la ficha del cliente frecuente (LOPDP: solo datos necesarios).
        const cliente = {
          id_type: idType,
          id_number: idFinal,
          name: name.trim(),
          address: address.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          privacy_accepted: true,
        };
        const caja = puenteCaja();
        if (caja) await caja.guardarCliente?.(cliente);
        else {
          const { error: custErr } = await supabase
            .from("customers")
            .upsert(cliente, { onConflict: "company_id,id_number" });
          if (custErr) throw custErr;
        }

        await onConfirm({
          doc_type: docType,
          payment_method: payment,
          sales_channel: channel,
          customer_id_type: idType,
          customer_id_number: idFinal,

          customer_name: name.trim(),
          customer_address: address.trim() || null,
          customer_email: email.trim() || null,
          customer_phone: phone.trim() || null,
          access_key: key,
          doc_number: docNumber(row.establishment, row.emission_point, seq),
          amount_in_words: amountInWords(total),
          iva_rate: ivaRate,
          tax_amount: tax,
          subtotal: base,
          total,
          received_amount: receivedNum > 0 ? receivedNum : total,
          change_amount: receivedNum > 0 ? Math.max(0, change) : 0,
          ...creditPayload(),
          issued_at_device: issuedAtDevice.toISOString(),
          related_doc_number: docType === "factura" ? null : relatedDocNumber.trim(),
          related_access_key: docType === "factura" ? null : relatedAccessKey.replace(/\D/g, ""),
        });
        await avanzarConfiguracion(seq);

      } else {
        // ORDEN: contador diario propio. Jamás toca la numeración de facturas.
        const numeroOrden = await takeDailyOrderNumber();
        await onConfirm({
          doc_type: "nota_venta",
          payment_method: payment,
          sales_channel: channel,
          customer_id_type: idType === "consumidor_final" ? null : idType,
          customer_id_number: cleanId() || null,
          customer_name: name.trim() || null,
          customer_address: null,
          customer_email: null,
          customer_phone: null,
          access_key: null,
          doc_number: formatOrderNumber(numeroOrden),
          amount_in_words: amountInWords(total),
          iva_rate: ivaRate,
          tax_amount: tax,
          subtotal: base,
          total,
          received_amount: receivedNum > 0 ? receivedNum : total,
          change_amount: receivedNum > 0 ? Math.max(0, change) : 0,
          ...creditPayload(),
          issued_at_device: issuedAtDevice.toISOString(),
          related_doc_number: null,
          related_access_key: null,
        });

      }

      resetCustomerFields();
      onOpenChange(false);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(false);
    }
  };


  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetCustomerFields();
        onOpenChange(v);
      }}
    >
      <DialogContent className="checkout-panel max-h-[92vh] overflow-y-auto sm:max-w-lg bg-white text-black">
        <DialogHeader>
          <DialogTitle className="font-display">Cobrar {currency(total)}</DialogTitle>
          <DialogDescription>Elige la modalidad del comprobante y la forma de pago.</DialogDescription>
        </DialogHeader>

        <EcuadorClock className="w-full justify-center" />


        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                value: "factura" as DocType,
                title: "Factura electrónica SRI",
                desc: "Documento tributario con clave de acceso",
                icon: FileText,
              },
              {
                value: "nota_venta" as DocType,
                title: "Orden",
                desc: "Cuenta diaria interna · reinicia cada día",

                icon: Receipt,
              },
            ]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDocType(opt.value)}
              className={`checkout-doc rounded-lg border p-3 text-left transition-colors ${
                docType === opt.value ? "checkout-doc-active" : "border-neutral-300 bg-white hover:border-primary/60"
              }`}
            >
              <opt.icon className="size-5" />
              <p className="mt-2 text-sm font-semibold">{opt.title}</p>
              <p className="text-xs">{opt.desc}</p>
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Forma de pago</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Canal de venta</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {salesChannels.map((c) => (
                  <SelectItem key={c.id} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {docType !== "nota_venta" && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Datos del cliente
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Tipo de identificación</Label>
                <Select
                  value={idType}
                  onValueChange={(v) => {
                    setIdType(v);
                    if (v === "consumidor_final") {
                      setIdNumber("9999999999999");
                      setName("CONSUMIDOR FINAL");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cedula">Cédula</SelectItem>
                    <SelectItem value="ruc">RUC</SelectItem>
                    <SelectItem value="pasaporte">Pasaporte</SelectItem>
                    <SelectItem value="consumidor_final">Consumidor final</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="idnum">Identificación</Label>
                <div className="flex gap-2">
                  <Input
                    id="idnum"
                    value={idNumber}
                    onChange={(e) => {
                      const v = e.target.value;
                      setIdNumber(v);
                      const d = v.replace(/\D/g, "");
                      if (idType !== "pasaporte" && (d.length === 10 || d.length === 13)) lookupCustomer(v);
                    }}
                    onBlur={(e) => lookupCustomer(e.target.value)}
                    inputMode="numeric"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={consultandoSri}
                    onClick={() => consultarSri(idNumber.replace(/\D/g, ""))}
                    title="Consultar los datos en el SRI"
                  >
                    {consultandoSri ? <Loader2 className="size-4 animate-spin" /> : "SRI"}
                  </Button>
                </div>
                {consultandoSri && (
                  <p className="text-xs text-muted-foreground">Consultando datos en el SRI…</p>
                )}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cname">Razón social / nombre</Label>
                <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="caddr">Dirección</Label>
                <Input id="caddr" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cmail">Correo</Label>
                <Input id="cmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cphone">Teléfono</Label>
                <Input id="cphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {esPagoCredito(payment) && (
          <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Crédito al cliente · queda registrado en Cuentas por cobrar
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="crname">Nombre completo del cliente *</Label>
                <Input
                  id="crname"
                  value={creditName}
                  onChange={(e) => setCreditName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="crid">Cédula / RUC *</Label>
                <Input
                  id="crid"
                  inputMode="numeric"
                  value={creditId}
                  onChange={(e) => setCreditId(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="crphone">Teléfono (opcional)</Label>
                <Input
                  id="crphone"
                  value={creditPhone}
                  onChange={(e) => setCreditPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="crdue">Fecha de vencimiento del crédito *</Label>
                <Input
                  id="crdue"
                  type="date"
                  value={creditDue}
                  onChange={(e) => setCreditDue(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {payment === "efectivo" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="recibido">Monto entregado por el cliente</Label>
              <Input
                id="recibido"
                inputMode="decimal"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Vuelto / cambio</Label>
              <div
                className={`tabular flex h-9 items-center rounded-md border border-border px-3 text-sm font-semibold ${
                  receivedNum > 0 && change < 0 ? "text-destructive" : ""
                }`}
              >
                {receivedNum > 0
                  ? change >= 0
                    ? currency(change)
                    : `Faltan ${currency(Math.abs(change))}`
                  : "—"}
              </div>
            </div>
          </div>
        )}

        <div className="checkout-totals tabular space-y-1 rounded-md border border-neutral-300 bg-neutral-50 p-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotal sin IVA</span>
            <span>{currency(base)}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA {ivaRate}%</span>
            <span>{currency(tax)}</span>
          </div>
          <div className="checkout-total-row flex justify-between border-t border-neutral-300 pt-1 text-base font-extrabold">
            <span>Total</span>
            <span>{currency(total)}</span>
          </div>
        </div>

        <Button onClick={submit} disabled={busy} className="w-full">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {docType === "nota_venta" ? "Registrar orden y cobrar" : "Guardar comprobante y cobrar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
