-- Email verification for sign-up (apps/client/web/app/api/signup, verify-email).
--
-- Each sign-up attempt waits here until its emailed code is entered; only then
-- is the `users` row created (and every pending row for that address
-- deleted), so an unverified sign-up never claims an address. Rows older than
-- a day are deleted by the app.
-- Apply BEFORE deploying the web app that uses it (Supabase dashboard → SQL
-- editor, or `supabase db push`).
create table if not exists public.pending_signups (
  signup_id       uuid primary key,      -- also held in the browser's pending-signup cookie
  email           text not null,
  name            text not null,
  password_hash   text not null,         -- bcrypt; copied into users.password on success
  code_hash       text not null,         -- HMAC of the 6-digit code, never the code itself
  code_expires_at timestamptz not null,
  attempts        integer not null default 0,  -- wrong guesses at the current code
  codes_sent      integer not null default 1,
  last_sent_at    timestamptz not null,
  created_at      timestamptz not null default now()
);

create index if not exists pending_signups_email_idx on public.pending_signups (email);
create index if not exists pending_signups_created_at_idx on public.pending_signups (created_at);

-- RLS on with no policies: invisible to the publishable key. The API routes
-- use the secret key, which bypasses RLS.
alter table public.pending_signups enable row level security;

-- Sign-in and sign-up now look accounts up by lower-cased email, so lower-case
-- existing addresses. Where several accounts differ only by case (the old
-- sign-up compared case-sensitively), one per address can have it: the one
-- already lower-case, else the oldest. List any left over with
--   select lower(trim(email)), array_agg(id) from public.users
--   group by 1 having count(*) > 1;
update public.users u
set email = lower(trim(u.email))
where u.email <> lower(trim(u.email))
  and u.id = (
    select o.id from public.users o
    where lower(trim(o.email)) = lower(trim(u.email))
    order by (o.email = lower(trim(o.email))) desc, o.created_at asc nulls last, o.id
    limit 1
  );
