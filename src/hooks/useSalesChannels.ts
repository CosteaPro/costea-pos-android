import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SALES_CHANNELS, type ProductChannelPrice, type SalesChannel } from "@/lib/pos";

/** Canales de venta configurados por el usuario (con respaldo a los de fábrica). */
const FALLBACK: SalesChannel[] = SALES_CHANNELS.map((c, i) => ({
  id: c.value,
  value: c.value,
  label: c.label,
  sort_order: i,
  active: true,
}));

export function useSalesChannels() {
  const [channels, setChannels] = useState<SalesChannel[]>(FALLBACK);
  const [prices, setPrices] = useState<ProductChannelPrice[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from("sales_channels").select("*").eq("active", true).order("sort_order"),
      supabase.from("product_channel_prices").select("product_id, channel_value, price, id"),
    ]);
    if (c.data && c.data.length > 0) setChannels(c.data as SalesChannel[]);
    setPrices((p.data as ProductChannelPrice[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { channels, prices, loading, reload, setPrices, setChannels };
}
