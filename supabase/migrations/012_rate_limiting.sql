-- 012_rate_limiting.sql
--
-- Persistent, shared-store rate limiting. The original implementation used an
-- in-memory Map inside the Next.js process (src/lib/rateLimit.ts's first
-- version) - fine for local `next dev`, unsafe in any serverless or
-- multi-instance deployment, where each instance/invocation would get its own
-- independent budget. This migration moves the counter into Postgres, the one
-- store every deployment target of this project already has.
--
-- Fixed-window counter: bucket_key identifies WHAT is being limited (e.g.
-- "pairing-create:<studentId>", "pairing-exchange-ip:<hmac>"), window_start is
-- that bucket's current time-bucket floor. One atomic
-- `insert ... on conflict do update ... returning` both increments and reads
-- the count with no read-then-write race, so concurrent requests from the
-- same caller can't both slip through mid-window.
--
-- Run in the Supabase SQL editor AFTER 011. Safe to re-run. Purely additive.

begin;

create table if not exists public.rate_limit_counters (
  bucket_key    text not null,
  window_start  timestamptz not null,
  hit_count     integer not null default 0,
  primary key (bucket_key, window_start)
);

comment on table public.rate_limit_counters is
  'Shared, persistent rate-limit counters (see check_rate_limit()). Rows are short-lived - the function opportunistically deletes windows older than 1 day on each call, so this table never accumulates unbounded history. Never stores raw IP addresses - callers must hash any IP-derived bucket_key themselves before calling.';

create index if not exists rate_limit_counters_window_start_idx on public.rate_limit_counters (window_start);

alter table public.rate_limit_counters enable row level security;
-- No client policies - identical posture to assessment_pairing_codes/assessment_tokens
-- (008): only service_role (bypasses RLS) or the check_rate_limit() RPC below
-- ever touches this table.

-- ============================================================================
-- check_rate_limit(bucket_key, limit, window_seconds)
--
-- Returns (allowed, retry_after_seconds) for ONE hit against bucket_key,
-- recording the hit as part of the same atomic statement regardless of the
-- outcome (a rejected caller retrying immediately doesn't get a free extra
-- attempt, and doesn't reset anyone else's window either).
-- ============================================================================
create or replace function public.check_rate_limit(
  p_bucket_key      text,
  p_limit           integer,
  p_window_seconds  integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_bucket_key is null or length(p_bucket_key) = 0 or length(p_bucket_key) > 200 then
    raise exception 'VALIDATION_ERROR: bucket_key must be 1-200 characters';
  end if;
  if p_limit is null or p_limit <= 0 or p_limit > 100000 then
    raise exception 'VALIDATION_ERROR: limit must be between 1 and 100000';
  end if;
  if p_window_seconds is null or p_window_seconds <= 0 or p_window_seconds > 86400 then
    raise exception 'VALIDATION_ERROR: window_seconds must be between 1 and 86400';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_counters (bucket_key, window_start, hit_count)
  values (p_bucket_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set hit_count = public.rate_limit_counters.hit_count + 1
  returning public.rate_limit_counters.hit_count into v_count;

  -- Opportunistic cleanup - ~1 in 200 calls sweeps windows more than a day
  -- old, instead of a separate cron job. Cheap and bounded: an index scan on
  -- window_start, not a full table scan, and it never blocks the caller's
  -- own result.
  if random() < 0.005 then
    delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  end if;

  if v_count > p_limit then
    return query select false, greatest(1, p_window_seconds - floor(extract(epoch from now() - v_window_start))::integer);
  else
    return query select true, 0;
  end if;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

commit;
