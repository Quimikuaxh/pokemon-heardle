-- Rate-limit de la Edge Function `heardle` (ARQUITECTURA DEC-57, DEC-13).
-- Proyecto compartido (claude-test en public, daily-pwt en pwt): la tabla vive en el esquema propio `heardle`,
-- que no esta publicado en la API; la unica entrada es la funcion de public, ejecutable solo por service_role.
-- Idempotente.

create schema if not exists heardle;
revoke all on schema heardle from public;

create table if not exists heardle.rate_limits (
  bucket text not null,
  key text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (bucket, key)
);
alter table heardle.rate_limits enable row level security;
revoke all on heardle.rate_limits from public;

-- checks: [{ "bucket": text, "key": text, "limit": int }]. Cuenta cada una en orden con ventana fija de 60 s
-- y devuelve los segundos de espera de la primera que supera su limite (las anteriores quedan contadas), o 0.
create or replace function public.heardle_rate_limit_hit(checks jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c jsonb;
  w heardle.rate_limits;
  now_ts timestamptz := clock_timestamp();
begin
  -- Limpieza ocasional de ventanas caducadas, sin cron.
  if random() < 0.01 then
    delete from heardle.rate_limits where window_start < now_ts - interval '2 minutes';
  end if;
  for c in select value from jsonb_array_elements(checks) loop
    insert into heardle.rate_limits as r (bucket, key, window_start, hits)
    values (c ->> 'bucket', c ->> 'key', now_ts, 1)
    on conflict (bucket, key) do update set
      window_start = case when r.window_start + interval '60 seconds' <= now_ts then now_ts else r.window_start end,
      hits = case when r.window_start + interval '60 seconds' <= now_ts then 1 else r.hits + 1 end
    returning * into w;
    if w.hits > (c ->> 'limit')::integer then
      return greatest(1, ceil(extract(epoch from (w.window_start + interval '60 seconds' - now_ts)))::integer);
    end if;
  end loop;
  return 0;
end;
$$;

revoke execute on function public.heardle_rate_limit_hit(jsonb) from public, anon, authenticated;
grant execute on function public.heardle_rate_limit_hit(jsonb) to service_role;
