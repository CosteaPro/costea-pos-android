import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PURCHASE_UNITS } from "@/lib/units";

/**
 * Listado maestro de unidades de compra.
 * Cualquier unidad nueva que cree el usuario queda disponible para otros ítems.
 */
export function useMeasurementUnits() {
  const [units, setUnits] = useState<string[]>(DEFAULT_PURCHASE_UNITS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("measurement_units")
      .select("name, active")
      .eq("active", true)
      .order("name");
    if (data?.length) setUnits(data.map((u) => u.name));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Registra una unidad nueva en el maestro (idempotente). */
  const addUnit = useCallback(
    async (raw: string) => {
      const name = raw.trim().toLowerCase();
      if (!name) return null;
      if (!units.includes(name)) {
        await supabase.from("measurement_units").insert({ name, kind: "compra" });
        setUnits((prev) => [...prev, name].sort());
      }
      return name;
    },
    [units],
  );

  return { units, loading, addUnit, reload: load };
}
