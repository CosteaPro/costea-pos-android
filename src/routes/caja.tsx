import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Calculator, Loader2, Lock, LockOpen, Printer, Save, History } from "lucide-react";
import { toast } from "sonner";
import { recalcularReportes } from "@/lib/reportes-cache.functions";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useRole } from "@/hooks/useRole";
import { useDayLock } from "@/hooks/useDayLock";
import { reopenBusinessDay } from "@/lib/caja.functions";
import { notifyCashClosure } from "@/lib/notifications.functions";
import { currency } from "@/lib/pos";
import { resetDailyOrderCounter } from "@/lib/document-numbering";

import {
  SHIFTS,
  computeTotals,
  ecBusinessDate,
  ecDateTime,
  printClosure,
  shiftLabel,
  type CashTotals,
  type PaidOrder,
} from "@/lib/caja";

export const Route = createFileRoute("/caja")({
  head: () => ({
    meta: [
      { title: "Cierre y cuadre de caja | Costea POS" },
      {
        name: "description",
        content:
          "Cierre de caja por turno con totales por forma de pago, tickets anulados, IVA 15% y cálculo de sobrante o faltante en dólares.",
      },
      { property: "og:title", content: "Cierre y cuadre de caja | Costea POS" },
      {
        property: "og:description",
        content: "Cuadre de caja diario para restaurantes en Ecuador: efectivo, tarjetas, transferencias y vales.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <CashClosureScreen />
    </AppShell>
  ),
});

const SHIFT_RANGE: Record<string, [string, string]> = {
  matutino: ["06:00", "14:00"],
  vespertino: ["14:00", "19:00"],
  nocturno: ["19:00", "23:59"],
  completo: ["00:00", "23:59"],
};

/** Convierte fecha + hora de Ecuador (UTC-5, sin horario de verano) a ISO. */
const ecIso = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`).toISOString();

type ClosureRow = {
  id: string;
  user_email: string;
  shift: string;
  business_date: string;
  period_start: string;
  period_end: string;
  opening_float: number;
  system_cash: number;
  system_card: number;
  system_transfer: number;
  system_voucher: number;
  system_other: number;
  counted_cash: number;
  counted_card: number;
  counted_transfer: number;
  counted_voucher: number;
  counted_other: number;
  tickets_count: number;
  voided_count: number;
  voided_total: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  iva_rate: number;
  expected_total: number;
  counted_total: number;
  difference: number;
  notes: string | null;
  created_at: string;
  closure_type: string;
  reopened_at: string | null;
  reopened_by_email: string | null;
};

function CashClosureScreen() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { can, isAdmin, loading: roleLoading } = useRole();
  const ivaRate = company?.iva_rate ?? 15;
  const sendCashClosureAlert = useServerFn(notifyCashClosure);

  const [date, setDate] = useState(ecBusinessDate());
  const [shift, setShift] = useState("completo");
  const [from, setFrom] = useState(SHIFT_RANGE.completo[0]);
  const [to, setTo] = useState(SHIFT_RANGE.completo[1]);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const [countedCard, setCountedCard] = useState("");
  const [countedTransfer, setCountedTransfer] = useState("");
  const [countedVoucher, setCountedVoucher] = useState("");
  const [countedOther, setCountedOther] = useState("");
  const [notes, setNotes] = useState("");
  const [totals, setTotals] = useState<CashTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ClosureRow[]>([]);
  const { locked, refresh: refreshLock } = useDayLock();
  
  const [confirmClose, setConfirmClose] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  
  const [adminPass, setAdminPass] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const applyShift = (value: string) => {
    setShift(value);
    const [a, b] = SHIFT_RANGE[value] ?? SHIFT_RANGE.completo;
    setFrom(a);
    setTo(b);
  };

  const loadTotals = useCallback(async () => {
    setLoading(true);
    const start = ecIso(date, from);
    const end = ecIso(date, to);
    const cols =
      "id, status, payment_method, total, subtotal, tax_amount, iva_rate, paid_at, created_at, doc_status, doc_number, folio, voided_at";

    const [ventas, anuladas] = await Promise.all([
      supabase.from("orders").select(cols).gte("created_at", start).lte("created_at", end),
      // Anuladas HOY, aunque el pedido se haya creado en días anteriores.
      supabase.from("orders").select(cols).gte("voided_at", start).lte("voided_at", end),
    ]);
    setLoading(false);
    const error = ventas.error ?? anuladas.error;
    if (error) {
      toast.error(error.message);
      return;
    }
    const map = new Map<string, PaidOrder>();
    for (const o of [...(ventas.data ?? []), ...(anuladas.data ?? [])] as PaidOrder[]) map.set(o.id, o);
    setTotals(computeTotals([...map.values()], ivaRate, { start, end }));
  }, [date, from, to, ivaRate]);


  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("cash_closures")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory((data ?? []) as ClosureRow[]);
  }, []);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const expected = useMemo(
    () => Math.round(((totals?.total ?? 0) + num(openingFloat)) * 100) / 100,
    [totals, openingFloat],
  );
  const countedTotal = useMemo(
    () =>
      Math.round(
        (num(countedCash) + num(countedCard) + num(countedTransfer) + num(countedVoucher) + num(countedOther)) *
          100,
      ) / 100,
    [countedCash, countedCard, countedTransfer, countedVoucher, countedOther],
  );
  const difference = Math.round((countedTotal - expected) * 100) / 100;

  const ticketPayload = () => ({
    negocio: company?.trade_name || company?.business_name || "Costea POS",
    ruc: company?.ruc || undefined,
    usuario: user?.email ?? "",
    turno: shiftLabel(shift),
    fecha: new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil" }).format(
      new Date(`${date}T12:00:00-05:00`),
    ),
    desde: from,
    hasta: to,
    fondo: num(openingFloat),
    sistema: {
      efectivo: totals?.cash ?? 0,
      tarjeta: totals?.card ?? 0,
      transferencia: totals?.transfer ?? 0,
      vales: totals?.voucher ?? 0,
      otros: totals?.other ?? 0,
    },
    contado: {
      efectivo: num(countedCash),
      tarjeta: num(countedCard),
      transferencia: num(countedTransfer),
      vales: num(countedVoucher),
      otros: num(countedOther),
    },
    tickets: totals?.tickets ?? 0,
    anulados: totals?.voidedCount ?? 0,
    anuladoTotal: totals?.voidedTotal ?? 0,
    anuladas: totals?.voided ?? [],

    subtotal: totals?.subtotal ?? 0,
    ivaRate,
    iva: totals?.tax ?? 0,
    total: totals?.total ?? 0,
    esperado: expected,
    contadoTotal: countedTotal,
    diferencia: difference,
    observaciones: notes || null,
    impresora: company?.printer_pos || undefined,
  });

  const save = async (mode: "cuadre" | "cierre") => {
    if (!totals) return;
    setSaving(true);
    const { error } = await supabase.from("cash_closures").insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? "",
      shift,
      business_date: date,
      closure_type: mode,
      period_start: ecIso(date, from),
      period_end: ecIso(date, to),
      opening_float: num(openingFloat),
      system_cash: totals.cash,
      system_card: totals.card,
      system_transfer: totals.transfer,
      system_voucher: totals.voucher,
      system_other: totals.other,
      counted_cash: num(countedCash),
      counted_card: num(countedCard),
      counted_transfer: num(countedTransfer),
      counted_voucher: num(countedVoucher),
      counted_other: num(countedOther),
      tickets_count: totals.tickets,
      voided_count: totals.voidedCount,
      voided_total: totals.voidedTotal,
      subtotal: totals.subtotal,
      tax_amount: totals.tax,
      total: totals.total,
      iva_rate: ivaRate,
      expected_total: expected,
      counted_total: countedTotal,
      difference,
      notes: notes || null,
    });
    setSaving(false);
    setConfirmClose(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (mode === "cierre") {
      // El contador de órdenes vuelve a 0: mañana arranca en 1 otra vez.
      await resetDailyOrderCounter().catch(() => undefined);
      // Mix y P&G del día quedan pre-calculados para abrir al instante.
      void recalcularReportes({ data: { fecha: date } }).catch(() => undefined);
      toast.success(
        "Cierre definitivo guardado. La caja de hoy queda bloqueada y el número de orden interno se reinicia en 1.",
      );
      sendCashClosureAlert({
        data: {
          businessDate: date,
          shift: shiftLabel(shift),
          total: totals?.total ?? 0,
          difference,
          tickets: totals?.tickets ?? 0,
        },
      }).catch(() => undefined);
      refreshLock();

    } else {
      toast.success("Cuadre de caja guardado. Puedes seguir cobrando normalmente.");
    }
    loadHistory();
  };

  const unlockDay = async () => {
    if (!adminPass) {
      toast.error("Ingresa tu contraseña de Super Administrador");
      return;
    }
    setUnlocking(true);
    try {
      await reopenBusinessDay({
        data: { password: adminPass, businessDate: ecBusinessDate() },
      });
      toast.success("Día reabierto. Ya se puede volver a operar.");
      setUnlockOpen(false);
      setAdminPass("");
      refreshLock();
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reabrir el día");
    } finally {
      setUnlocking(false);
    }
  };

  if (roleLoading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>;

  if (!can.cobrar)
    return (
      <div className="panel mx-auto max-w-md p-6 text-center">
        <h1 className="font-display text-lg font-semibold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Solo el Super Administrador y el Cajero autorizado pueden realizar el cierre de caja.
        </p>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Calculator className="size-5 text-primary" />
        <h1 className="font-display text-2xl font-bold">Cierre y cuadre de caja</h1>
        <span className="ml-auto text-xs text-muted-foreground">
          {user?.email} · {ecDateTime(new Date())} (Ecuador)
        </span>
      </div>

      {locked && (
        <div className="panel flex flex-wrap items-center gap-3 border-destructive/60 bg-destructive/10 p-4">
          <Lock className="size-5 text-destructive" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">Caja cerrada por hoy</p>
            <p className="text-muted-foreground">
              No se pueden registrar ni modificar ventas durante el resto del día. Mañana se habilita
              automáticamente.
            </p>
          </div>
          <Button
            className="ml-auto"
            variant="secondary"
            onClick={() => {
              setAdminPass("");
              setUnlockOpen(true);
            }}
          >
            <LockOpen className="size-4" /> Reabrir con autorización del Super Administrador
          </Button>
        </div>
      )}



      <section className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label>Fecha</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Turno</Label>
          <Select value={shift} onValueChange={applyShift}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHIFTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Desde</Label>
          <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Hasta</Label>
          <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Fondo de caja inicial (USD)</Label>
          <Input
            inputMode="decimal"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel space-y-3 p-4">
          <h2 className="font-display text-base font-semibold">Ventas del sistema</h2>
          {loading || !totals ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Calculando…</p>
          ) : (
            <div className="tabular space-y-1 text-sm">
              <Row label="Efectivo" value={totals.cash} />
              <Row label="Tarjetas" value={totals.card} />
              <Row label="Transferencias" value={totals.transfer} />
              <Row label="Recibos / Vales (crédito)" value={totals.voucher} />
              <Row label="Otros (plataformas)" value={totals.other} />
              <div className="my-2 border-t border-border" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tickets emitidos</span>
                <span>{totals.tickets}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tickets anulados</span>
                <span>{totals.voidedCount}</span>
              </div>
              <Row label="Valor total anulado" value={totals.voidedTotal} />
              <div className="my-2 border-t border-border" />
              <Row label="Subtotal ventas" value={totals.subtotal} />
              <Row label={`IVA ${ivaRate}%`} value={totals.tax} />
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>Total general</span>
                <span>{currency(totals.total)}</span>
              </div>
              <Row label="Fondo inicial" value={num(openingFloat)} />
              <div className="flex justify-between font-semibold text-primary">
                <span>Total esperado en caja</span>
                <span>{currency(expected)}</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel space-y-3 p-4">
          <h2 className="font-display text-base font-semibold">Conteo físico</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <MoneyField label="Efectivo contado" value={countedCash} onChange={setCountedCash} />
            <MoneyField label="Tarjetas (vouchers)" value={countedCard} onChange={setCountedCard} />
            <MoneyField label="Transferencias" value={countedTransfer} onChange={setCountedTransfer} />
            <MoneyField label="Vales / recibos" value={countedVoucher} onChange={setCountedVoucher} />
            <MoneyField label="Otros" value={countedOther} onChange={setCountedOther} />
          </div>
          <div className="tabular space-y-1 rounded-md bg-surface-2 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total contado</span>
              <span>{currency(countedTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total esperado</span>
              <span>{currency(expected)}</span>
            </div>
            <div
              className={`flex justify-between border-t border-border pt-1 font-semibold ${
                difference === 0 ? "" : difference > 0 ? "text-emerald-400" : "text-destructive"
              }`}
            >
              <span>{difference === 0 ? "Caja cuadrada" : difference > 0 ? "Sobrante" : "Faltante"}</span>
              <span>{currency(Math.abs(difference))}</span>
            </div>
          </div>
          {(totals?.voided.length ?? 0) > 0 && (
            <div className="tabular space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="font-semibold text-destructive">Facturas anuladas / dadas de baja</p>
              {totals!.voided.map((a, i) => (
                <div key={`${a.numero}-${i}`} className="flex justify-between">
                  <span className="text-muted-foreground">{a.numero}</span>
                  <span>{currency(a.total)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-destructive/30 pt-1 font-semibold text-destructive">
                <span>Total anulado</span>
                <span>{currency(totals?.voidedTotal ?? 0)}</span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Observaciones o justificación de diferencias</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save("cuadre")} disabled={saving || !totals}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar
              cuadre de caja
            </Button>
            <Button variant="secondary" onClick={() => printClosure(ticketPayload())} disabled={!totals}>
              <Printer className="size-4" /> Imprimir / PDF
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmClose(true)}
              disabled={saving || !totals || locked}
            >
              <Lock className="size-4" /> Cierre de caja definitivo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            El cuadre se puede repetir las veces que necesites y no detiene la operación. El cierre
            definitivo guarda el periodo de forma inmodificable, bloquea la caja durante el resto del día y
            reinicia el número de orden interno en 1 (la numeración de facturas del SRI no se altera).
          </p>
        </section>
      </div>

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar cierre de caja definitivo</DialogTitle>
            <DialogDescription>
              Se guardará el resumen del periodo de forma permanente e inmodificable. Durante el resto del
              día de hoy no se podrán registrar ni modificar ventas; solo el Super Administrador puede reabrir con
              su contraseña. Mañana la caja se habilita automáticamente y el número de orden interno vuelve
              a 1.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmClose(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => save("cierre")} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Cerrar caja
              definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir el día cerrado</DialogTitle>
            <DialogDescription>
              Autorización exclusiva del Super Administrador. Confirma tu propia contraseña para
              volver a operar hoy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tu contraseña</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setUnlockOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={unlockDay} disabled={unlocking}>
              {unlocking ? <Loader2 className="size-4 animate-spin" /> : <LockOpen className="size-4" />}{" "}
              Desbloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <History className="size-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Histórico de cierres</h2>
        </div>
        <div className="divide-y divide-border">
          {history.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="font-medium">{ecDateTime(h.created_at)}</span>
              <span className="text-muted-foreground">{shiftLabel(h.shift)}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  h.closure_type === "cierre"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-surface-2 text-muted-foreground"
                }`}
              >
                {h.closure_type === "cierre"
                  ? h.reopened_at
                    ? "Cierre reabierto"
                    : "Cierre definitivo"
                  : "Cuadre"}
              </span>
              <span className="truncate text-muted-foreground">{h.user_email}</span>
              <span className="tabular">Ventas {currency(Number(h.total))}</span>
              <span
                className={`tabular ${
                  Number(h.difference) === 0
                    ? "text-muted-foreground"
                    : Number(h.difference) > 0
                      ? "text-emerald-400"
                      : "text-destructive"
                }`}
              >
                {Number(h.difference) === 0
                  ? "Cuadrado"
                  : `${Number(h.difference) > 0 ? "Sobrante" : "Faltante"} ${currency(Math.abs(Number(h.difference)))}`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  printClosure({
                    negocio: company?.trade_name || company?.business_name || "Costea POS",
                    ruc: company?.ruc || undefined,
                    usuario: h.user_email,
                    turno: shiftLabel(h.shift),
                    fecha: h.business_date,
                    desde: ecDateTime(h.period_start),
                    hasta: ecDateTime(h.period_end),
                    fondo: Number(h.opening_float),
                    sistema: {
                      efectivo: Number(h.system_cash),
                      tarjeta: Number(h.system_card),
                      transferencia: Number(h.system_transfer),
                      vales: Number(h.system_voucher),
                      otros: Number(h.system_other),
                    },
                    contado: {
                      efectivo: Number(h.counted_cash),
                      tarjeta: Number(h.counted_card),
                      transferencia: Number(h.counted_transfer),
                      vales: Number(h.counted_voucher),
                      otros: Number(h.counted_other),
                    },
                    tickets: h.tickets_count,
                    anulados: h.voided_count,
                    anuladoTotal: Number(h.voided_total),
                    subtotal: Number(h.subtotal),
                    ivaRate: Number(h.iva_rate),
                    iva: Number(h.tax_amount),
                    total: Number(h.total),
                    esperado: Number(h.expected_total),
                    contadoTotal: Number(h.counted_total),
                    diferencia: Number(h.difference),
                    observaciones: h.notes,
                    impresora: company?.printer_pos || undefined,
                  })
                }
              >
                <Printer className="size-4" /> Reimprimir
              </Button>
            </div>
          ))}
          {history.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Todavía no hay cierres registrados.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{currency(value)}</span>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input inputMode="decimal" placeholder="0.00" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
