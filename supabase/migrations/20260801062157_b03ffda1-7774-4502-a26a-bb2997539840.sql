ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'disponible';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guests integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS released_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS orders_table_open_idx ON public.orders (table_id) WHERE released_at IS NULL;