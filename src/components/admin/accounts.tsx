import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currency } from "@/lib/pos";
import { ecBusinessDate } from "@/lib/caja";

const round2 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

type Receivable = {
  id: string;
  doc_number: string | null;
  created_at: string;
  total: number;
  credit_customer_name: string | null;
  credit_customer_id: string | null;
  credit_phone: string | null;
  credit_due_date: string | null;
  credit_status: string | null;
};

type Payable = {
  id: string;
  kind: "compra" | "gasto";
  party: string;
  document_number: string;
  date: string;
  due_date: string | null;
  total: number;
  paid: boolean;
};

const overdue = (due: string | null) => !!due && due < ecBusinessDate(new Date());

export function ReceivablesPanel() {
  const [rows, setRows] = useState<Receivable[]>([]);
  const [showPaid, setShowPaid] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, doc_number, created_at, total, credit_customer_name, credit_customer_id, credit_phone, credit_due_date, credit_status",
      )
      .in("payment_method", ["credito", "transferencia_credito"])
      .order("credit_due_date", { ascending: true })
      .limit(500);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Receivable[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (showPaid || r.credit_status !== "cobrado") &&
          (!search.trim() ||
            `${r.credit_customer_name ?? ""} ${r.credit_customer_id ?? ""} ${r.doc_number ?? ""}`
              .toLowerCase()
              .includes(search.trim().toLowerCase())),
      ),
    [rows, showPaid, search],
  );

  const pending = round2(
    rows.filter((r) => r.credit_status !== "cobrado").reduce((a, r) => a + Number(r.total || 0), 0),
  );
  const late = round2(
    rows
      .filter((r) => r.credit_status !== "cobrado" && overdue(r.credit_due_date))
      .reduce((a, r) => a + Number(r.total || 0), 0),
  );

  const markPaid = async (id: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ credit_status: "cobrado", credit_paid_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Crédito marcado como cobrado");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Por cobrar pendiente" value={pending} />
        <Card label="Vencido" value={late} tone="danger" />
        <Card label="Créditos registrados" value={rows.length} raw />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-[220px] flex-1">
          <Label>Buscar cliente o comprobante</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => setShowPaid((v) => !v)}>
          {showPaid ? "Ver solo pendientes" : "Incluir cobrados"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card p-3">
        <table className="tabular w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Emisión</th>
              <th>Comprobante</th>
              <th>Cliente</th>
              <th>Cédula / RUC</th>
              <th>Teléfono</th>
              <th>Vence</th>
              <th className="text-right">Total $</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const paid = r.credit_status === "cobrado";
              return (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2">{fmtDate(r.created_at)}</td>
                  <td>{r.doc_number ?? "—"}</td>
                  <td>{r.credit_customer_name ?? "—"}</td>
                  <td>{r.credit_customer_id ?? "—"}</td>
                  <td>{r.credit_phone ?? "—"}</td>
                  <td className={!paid && overdue(r.credit_due_date) ? "text-destructive" : ""}>
                    {fmtDate(r.credit_due_date)}
                  </td>
                  <td className="text-right font-semibold">{currency(Number(r.total))}</td>
                  <td>{paid ? "Cobrado" : overdue(r.credit_due_date) ? "Vencido" : "Pendiente"}</td>
                  <td className="text-right">
                    {!paid && (
                      <Button size="sm" variant="outline" onClick={() => markPaid(r.id)}>
                        <CheckCircle2 className="mr-1 size-4" /> Cobrar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted-foreground">
                  No hay ventas a crédito registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PayablesPanel() {
  const [rows, setRows] = useState<Payable[]>([]);
  const [showPaid, setShowPaid] = useState(false);

  const load = useCallback(async () => {
    const [purchases, expenses] = await Promise.all([
      supabase
        .from("purchases")
        .select("id, supplier_name, document_number, purchased_at, total, due_date, paid")
        .in("payment_method", ["credito", "transferencia_credito"])
        .limit(500),
      supabase
        .from("expenses")
        .select("id, supplier_name, document_number, business_date, total, due_date, paid")
        .in("payment_method", ["credito", "transferencia_credito"])
        .limit(500),
    ]);
    if (purchases.error) toast.error(purchases.error.message);
    if (expenses.error) toast.error(expenses.error.message);

    const list: Payable[] = [
      ...((purchases.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: String(p['id']),
        kind: "compra" as const,
        party: String(p['supplier_name'] ?? "—"),
        document_number: String(p['document_number'] ?? "—"),
        date: String(p['purchased_at'] ?? "").slice(0, 10),
        due_date: (p['due_date'] as string | null) ?? null,
        total: Number(p['total'] ?? 0),
        paid: Boolean(p['paid']),
      })),
      ...((expenses.data ?? []) as Array<Record<string, unknown>>).map((e) => ({
        id: String(e['id']),
        kind: "gasto" as const,
        party: String(e['supplier_name'] ?? "—"),
        document_number: String(e['document_number'] ?? "—"),
        date: String(e['business_date'] ?? "").slice(0, 10),
        due_date: (e['due_date'] as string | null) ?? null,
        total: Number(e['total'] ?? 0),
        paid: Boolean(e['paid']),
      })),
    ].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

    setRows(list);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = rows.filter((r) => showPaid || !r.paid);
  const pending = round2(rows.filter((r) => !r.paid).reduce((a, r) => a + r.total, 0));
  const late = round2(
    rows.filter((r) => !r.paid && overdue(r.due_date)).reduce((a, r) => a + r.total, 0),
  );

  const markPaid = async (row: Payable) => {
    const table = row.kind === "compra" ? "purchases" : "expenses";
    const { error } = await supabase
      .from(table)
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Documento marcado como pagado");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Por pagar pendiente" value={pending} />
        <Card label="Vencido" value={late} tone="danger" />
        <Card label="Documentos a crédito" value={rows.length} raw />
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setShowPaid((v) => !v)}>
          {showPaid ? "Ver solo pendientes" : "Incluir pagados"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card p-3">
        <table className="tabular w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Fecha</th>
              <th>Origen</th>
              <th>Proveedor</th>
              <th>Comprobante</th>
              <th>Vence</th>
              <th className="text-right">Total $</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="border-b border-border/60">
                <td className="py-2">{fmtDate(r.date)}</td>
                <td className="capitalize">{r.kind}</td>
                <td>{r.party}</td>
                <td>{r.document_number}</td>
                <td className={!r.paid && overdue(r.due_date) ? "text-destructive" : ""}>
                  {fmtDate(r.due_date)}
                </td>
                <td className="text-right font-semibold">{currency(r.total)}</td>
                <td>{r.paid ? "Pagado" : overdue(r.due_date) ? "Vencido" : "Pendiente"}</td>
                <td className="text-right">
                  {!r.paid && (
                    <Button size="sm" variant="outline" onClick={() => markPaid(r)}>
                      <CheckCircle2 className="mr-1 size-4" /> Pagar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  No hay compras ni gastos a crédito pendientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  tone,
  raw,
}: {
  label: string;
  value: number;
  tone?: "danger";
  raw?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`tabular font-display text-xl font-semibold ${tone === "danger" ? "text-destructive" : ""}`}
      >
        {raw ? value : currency(value)}
      </p>
    </div>
  );
}
