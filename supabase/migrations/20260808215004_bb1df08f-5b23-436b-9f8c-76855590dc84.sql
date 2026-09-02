ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_uid text,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'nube';

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_uid_key
  ON public.orders (client_uid) WHERE client_uid IS NOT NULL;