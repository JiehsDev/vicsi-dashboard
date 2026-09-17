-- 008_assessment_pairing_and_tokens.sql
--
-- Pairing codes and assessment tokens. Both tables store ONLY a secure hash of the
-- actual secret (code_hash / token_hash, sha256 hex computed server-side in Node
-- before ever reaching Postgres) - the plaintext code/token is never written to any
-- column, log, or migration file, mirroring 001_profiles.sql's own pin_hash
-- discipline exactly ("bcrypt hash of the 4-digit VR PIN. NEVER store the PIN in
-- plaintext").
--
-- Neither table gets a SELECT policy for authenticated/anon anywhere in this file -
-- see 011_assessment_rls.sql, which is deliberately the ONLY place RLS is touched
-- for the assessment_* tables, so every access rule for this whole feature is
-- reviewable in one file. Until 011 runs, these two tables have RLS enabled with
-- zero policies, which PostgREST treats as "no client role may read or write them
-- at all" - the safe default.
--
-- Run in the Supabase SQL editor AFTER 007. Safe to re-run. Purely additive.

begin;

create table if not exists public.assessment_pairing_codes (
  id              uuid primary key default gen_random_uuid(),
  code_hash       text not null unique,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  class_id        uuid not null references public.classes (id) on delete cascade,
  assignment_id   uuid not null references public.assessment_assignments (id) on delete cascade,
  scenario_id     text not null references public.scenarios (scenario_id) on delete restrict,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  consumed_at     timestamptz,
  revoked_at      timestamptz,
  attempt_count   integer not null default 0
);

comment on table public.assessment_pairing_codes is
  'Short-lived, single-use pairing codes. Only code_hash is stored - never the plaintext code. See src/app/api/v1/pairing-codes/route.ts.';
comment on column public.assessment_pairing_codes.code_hash is
  'sha256 hex of the plaintext code, computed in Node before insert. NEVER store the plaintext code.';

create index if not exists assessment_pairing_codes_student_id_idx on public.assessment_pairing_codes (student_id);
create index if not exists assessment_pairing_codes_assignment_id_idx on public.assessment_pairing_codes (assignment_id);
-- Partial index: only unconsumed, unrevoked, unexpired codes are ever looked up by
-- exchange - keeps that lookup fast without indexing the (unbounded, ever-growing)
-- history of already-used/expired codes.
create index if not exists assessment_pairing_codes_active_lookup_idx
  on public.assessment_pairing_codes (code_hash)
  where consumed_at is null and revoked_at is null;

create table if not exists public.assessment_tokens (
  id              uuid primary key default gen_random_uuid(),
  token_hash      text not null unique,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  class_id        uuid not null references public.classes (id) on delete cascade,
  assignment_id   uuid not null references public.assessment_assignments (id) on delete cascade,
  scenario_id     text not null references public.scenarios (scenario_id) on delete restrict,
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  last_used_at    timestamptz
);

comment on table public.assessment_tokens is
  'Short-lived, single-purpose bearer tokens minted from a consumed pairing code. Only token_hash is stored. Accompanies every assessment-session submission from Unity. See src/app/api/v1/assessment-sessions/route.ts.';
comment on column public.assessment_tokens.token_hash is
  'sha256 hex of the opaque token, computed in Node before insert. NEVER store the plaintext token.';

create index if not exists assessment_tokens_student_id_idx on public.assessment_tokens (student_id);
create index if not exists assessment_tokens_active_lookup_idx
  on public.assessment_tokens (token_hash)
  where revoked_at is null;

alter table public.assessment_pairing_codes enable row level security;
alter table public.assessment_tokens enable row level security;
-- No policies added here on purpose - see the class comment above. 011 adds the
-- narrow, service-role-only RPC surface these two tables are meant to be accessed
-- through; nothing ever gets a direct table-level SELECT/INSERT/UPDATE/DELETE grant.

commit;
