create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;

create table if not exists private.cron_secret (
  id boolean primary key default true check (id),
  secret text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into private.cron_secret (id) values (true) on conflict (id) do nothing;

revoke all on private.cron_secret from anon, authenticated;
grant all on private.cron_secret to service_role;

select cron.unschedule('precalculo-reportes') where exists (
  select 1 from cron.job where jobname = 'precalculo-reportes'
);

select cron.schedule(
  'precalculo-reportes',
  '15 5 * * *',
  $$
  select net.http_post(
    url := 'https://costea-pos-master.lovable.app/api/public/cron/precalculo-reportes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select secret from private.cron_secret limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);