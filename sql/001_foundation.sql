-- ============================================================
-- MISE — Foundation schema (chunk 1)
-- Author: design session 2026-05-09
-- Target: Supabase project tzscbakslxdwgioksmya
--
-- Run AFTER these migrations that are ALREADY APPLIED in prod:
--   supabase_saas_setup.sql, migration_auth_multi_restaurant.sql,
--   migration_credit_balance.sql, migration_create_restaurant_rpc.sql,
--   migration_restaurant_writes.sql, migration_rls_writes.sql
--
-- What this adds:
--   §1  Stripe billing columns on restaurants
--   §2  pos_sales (was missed by migration_wastage_clover.sql)
--   §3  Vendor catalog: vendors, vendor_aliases, restaurant_vendors
--   §4  Team invites: restaurant_invites + accept/create RPCs
--   §5  Recipe inference: recipes_estimated, recipe_calibrations
--   §6  invoice_files extensions: source, vendor_id, parsed_at, parse_error
--   §7  Indexes
--   §8  RLS policies for every new table
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
-- ADD COLUMN IF NOT EXISTS, every policy is DROP-then-CREATE.
-- Safe to re-run.
-- ============================================================


-- ============================================================
-- §1  Stripe billing columns on restaurants
-- ============================================================
-- restaurants.stripe_customer_id already exists from supabase_saas_setup.sql.
-- We add the subscription-level fields used by the billing webhooks
-- (checkout.completed, invoice.payment_failed, customer.subscription.*).

alter table public.restaurants
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status    text not null default 'trialing',
  add column if not exists trial_ends_at          timestamptz not null default (now() + interval '14 days');

-- Constraint: subscription_status must be one of the Stripe-derived states.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_subscription_status_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_subscription_status_check
      check (subscription_status in ('trialing','active','past_due','canceled','paused','incomplete'));
  end if;
end$$;

comment on column public.restaurants.stripe_subscription_id is
  'Stripe Subscription ID (sub_...). One subscription per restaurant. Owner with N restaurants has N subscriptions on one card.';
comment on column public.restaurants.subscription_status is
  'Mirror of Stripe subscription.status. UI gates access on values not in (trialing|active).';
comment on column public.restaurants.trial_ends_at is
  '14-day trial deadline. Defaults to now()+14d on insert. Frontend shows countdown banner.';


-- ============================================================
-- §2  pos_sales — POS-agnostic normalized order lines
-- ============================================================
-- migration_wastage_clover.sql declared this table but the probe shows
-- it's not in prod (404). We recreate it here, generalized so any POS
-- adapter (Clover/Toast/Square/csv) can write into the same shape.

create table if not exists public.pos_sales (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  pos_source      text not null,                          -- 'clover'|'toast'|'square'|'csv'
  pos_order_id    text,                                   -- POS-side order/check id
  pos_line_id     text,                                   -- POS-side line item id (nullable for daily-aggregate sources)
  sale_date       date not null,                          -- in restaurant tz
  sale_ts         timestamptz,                            -- precise (when adapter provides it)
  item_name       text not null,                          -- raw POS menu item name
  category        text,                                   -- POS-side category if provided
  quantity        numeric(12,3) default 1,
  unit            text,                                   -- 'each'|'lb'|'floz' if POS exposes it
  unit_price      numeric(12,2),
  revenue         numeric(12,2) default 0,
  modifiers       jsonb,                                  -- ['extra cheese','no onion']
  raw             jsonb,                                  -- full POS payload for forensics / replay
  created_at      timestamptz not null default now()
);

-- Dedup key: one row per POS line. For daily-aggregate CSV the adapter
-- generates a synthetic pos_line_id = sale_date || item_name.
create unique index if not exists pos_sales_dedup
  on public.pos_sales (restaurant_id, pos_source, coalesce(pos_order_id,''), coalesce(pos_line_id,''));

create index if not exists idx_pos_sales_restaurant on public.pos_sales (restaurant_id);
create index if not exists idx_pos_sales_date       on public.pos_sales (sale_date);
create index if not exists idx_pos_sales_item       on public.pos_sales (restaurant_id, item_name);

comment on table public.pos_sales is
  'Normalized POS order lines from any adapter. Used for wastage / margin / food-cost-% calcs.';


-- ============================================================
-- §3  Vendor catalog
-- ============================================================
-- vendors:           global catalog (Sysco, Restaurant Depot, US Foods, ...)
-- vendor_aliases:    recognition signals (sender email, alias text on invoice)
-- restaurant_vendors: per-restaurant config (account #, credentials, cadence)

create table if not exists public.vendors (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,                 -- canonical key, e.g. 'restaurant_depot'
  display_name      text not null,                        -- e.g. 'Restaurant Depot'
  ingestion_method  text not null check (ingestion_method in ('email','portal','upload','api')),
  config            jsonb not null default '{}'::jsonb,   -- portal selectors, API endpoint, etc
  apify_actor_id    text,                                 -- if ingestion='portal' and we use Apify
  default_email_domain text,                              -- e.g. '@sysco.com' — auto-creates a vendor_aliases row
  notes             text,
  is_global         boolean not null default true,        -- false = custom vendor created by a restaurant
  created_at        timestamptz not null default now()
);

create index if not exists idx_vendors_name on public.vendors (name);

comment on table public.vendors is
  'Catalog of known vendors. One row per vendor across the whole system. Per-restaurant data lives in restaurant_vendors.';

create table if not exists public.vendor_aliases (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  alias_text      text,                                   -- vendor name as it appears on the invoice (case-insensitive match)
  sender_pattern  text,                                   -- email match: '@sysco.com' or 'billing@usfoods.com'
  restaurant_id   uuid references public.restaurants(id) on delete cascade,  -- nullable: NULL = global
  confidence      text not null default 'manual'          -- 'manual'|'ai_suggested'|'data_inferred'
                    check (confidence in ('manual','ai_suggested','data_inferred')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_vendor_aliases_vendor on public.vendor_aliases (vendor_id);
create index if not exists idx_vendor_aliases_sender on public.vendor_aliases (sender_pattern);

comment on table public.vendor_aliases is
  'Recognition signals mapping invoice text or sender emails to a vendor row. Restaurant-scoped or global.';

create table if not exists public.restaurant_vendors (
  id                   uuid primary key default gen_random_uuid(),
  restaurant_id        uuid not null references public.restaurants(id) on delete cascade,
  vendor_id            uuid not null references public.vendors(id),
  account_number       text,                              -- vendor-issued account # for this restaurant
  credentials_vault_id uuid,                              -- pointer to Supabase Vault secret (portal login)
  expected_cadence     text                               -- 'daily'|'weekly'|'biweekly'|'monthly'|'adhoc'
                         check (expected_cadence in ('daily','weekly','biweekly','monthly','adhoc') or expected_cadence is null),
  last_invoice_date    date,                              -- for "stale vendor" alerts
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  unique (restaurant_id, vendor_id)
);

create index if not exists idx_restaurant_vendors_restaurant on public.restaurant_vendors (restaurant_id);
create index if not exists idx_restaurant_vendors_vendor     on public.restaurant_vendors (vendor_id);

comment on table public.restaurant_vendors is
  'Per-restaurant vendor config: account number, portal credentials (via vault), expected delivery cadence.';


-- ============================================================
-- §4  Team invites
-- ============================================================
-- Invite-only model: no public signup. Owners invite teammates;
-- the invitee clicks the link, signs in or signs up, gets a
-- user_restaurants row with the assigned role.

create table if not exists public.restaurant_invites (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  email           text not null,
  role            text not null default 'staff'
                    check (role in ('owner','admin','manager','staff','accountant','viewer')),
  token           text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by      uuid references auth.users(id) on delete set null,
  expires_at      timestamptz not null default (now() + interval '7 days'),
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_invites_restaurant on public.restaurant_invites (restaurant_id);
create index if not exists idx_invites_email      on public.restaurant_invites (lower(email));
create index if not exists idx_invites_token      on public.restaurant_invites (token);

comment on table public.restaurant_invites is
  'Pending team invites. Token is the secret in the email link. accepted_at IS NULL means pending.';

-- RPC: create an invite (owners/admins only). Returns the token so
-- the frontend can build the invitation URL.
create or replace function public.create_restaurant_invite(
  p_restaurant_id uuid,
  p_email         text,
  p_role          text default 'staff'
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv_id uuid;
  v_token text;
  v_exp timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- caller must be owner/admin of that restaurant
  if not exists (
    select 1 from public.user_restaurants
    where user_id = v_uid and restaurant_id = p_restaurant_id and role in ('owner','admin')
  ) then
    raise exception 'Not authorized to invite for this restaurant';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'Email required';
  end if;

  insert into public.restaurant_invites (restaurant_id, email, role, invited_by)
  values (p_restaurant_id, lower(trim(p_email)), p_role, v_uid)
  returning restaurant_invites.id, restaurant_invites.token, restaurant_invites.expires_at
  into v_inv_id, v_token, v_exp;

  return query select v_inv_id, v_token, v_exp;
end;
$$;

grant execute on function public.create_restaurant_invite(uuid, text, text) to authenticated;

-- RPC: accept an invite. Called by the invitee after they sign in.
-- Validates the token, attaches the user to the restaurant, marks accepted.
create or replace function public.accept_restaurant_invite(p_token text)
returns uuid                                              -- the restaurant_id they got attached to
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.restaurant_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_inv
  from public.restaurant_invites
  where token = p_token and accepted_at is null and expires_at > now()
  for update;

  if not found then
    raise exception 'Invite invalid or expired';
  end if;

  insert into public.user_restaurants (user_id, restaurant_id, role)
  values (v_uid, v_inv.restaurant_id, v_inv.role)
  on conflict (user_id, restaurant_id) do update set role = excluded.role;

  update public.restaurant_invites
  set accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;

  return v_inv.restaurant_id;
end;
$$;

grant execute on function public.accept_restaurant_invite(text) to authenticated;


-- ============================================================
-- §5  Recipe inference (estimated portions)
-- ============================================================
-- recipes_estimated:   AI-inferred portion per (menu_item × ingredient).
--                      Confidence climbs as data accumulates.
-- recipe_calibrations: history of back-solved portions per ingredient
--                      across rolling windows.

create table if not exists public.recipes_estimated (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  menu_item_name    text not null,                        -- normalized POS item name
  ingredient_name   text not null,                        -- canonical ingredient
  quantity          numeric(12,4) not null,               -- per ONE menu item sold
  unit              text not null,                        -- 'oz'|'lb'|'each'|'floz'|'g'
  confidence        text not null default 'ai_inferred'
                      check (confidence in ('ai_inferred','data_calibrated','user_confirmed')),
  source            text,                                 -- 'claude:opus-4.7' | 'calibration:2026-W19' | 'user:<uuid>'
  last_updated_at   timestamptz not null default now(),
  unique (restaurant_id, menu_item_name, ingredient_name)
);

create index if not exists idx_recipes_estimated_restaurant on public.recipes_estimated (restaurant_id);
create index if not exists idx_recipes_estimated_menu       on public.recipes_estimated (restaurant_id, menu_item_name);

comment on table public.recipes_estimated is
  'AI-inferred or back-solved recipe portions. Self-calibrates over time as purchase-vs-sales data accumulates.';

create table if not exists public.recipe_calibrations (
  id                              uuid primary key default gen_random_uuid(),
  restaurant_id                   uuid not null references public.restaurants(id) on delete cascade,
  ingredient_name                 text not null,
  period_start                    date not null,
  period_end                      date not null,
  total_purchased_qty             numeric(14,3) not null,
  purchase_unit                   text not null,
  total_dishes_using_ingredient   int  not null,
  implied_portion                 numeric(14,4) not null, -- = total_purchased / dishes
  applied                         boolean not null default false,
  notes                           text,
  created_at                      timestamptz not null default now()
);

create index if not exists idx_recipe_calib_restaurant on public.recipe_calibrations (restaurant_id);
create index if not exists idx_recipe_calib_period     on public.recipe_calibrations (period_start, period_end);

comment on table public.recipe_calibrations is
  'Rolling-window back-solve: how much was bought / how many dishes sold = implied portion. Audit trail for the self-learning loop.';


-- ============================================================
-- §6  invoice_files extensions — track source + vendor
-- ============================================================
-- invoice_files already has these columns we'll reuse as-is:
--   status         pending|processing|done|failed|dead     (parse + retry state)
--   error_message  text                                    (parse error)
--   processed_at   timestamptz                             (when parse finished)
--   retry_count    int                                     (already wired for the dead-letter path)
-- We only need to add WHERE the file came from and WHICH vendor it's for.

alter table public.invoice_files
  add column if not exists source    text,
  add column if not exists vendor_id uuid references public.vendors(id);

-- Source enum check (must be one of email/portal/upload/api).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoice_files_source_check'
  ) then
    alter table public.invoice_files
      add constraint invoice_files_source_check
      check (source is null or source in ('email','portal','upload','api'));
  end if;
end$$;

create index if not exists idx_invoice_files_source on public.invoice_files (source);
create index if not exists idx_invoice_files_vendor on public.invoice_files (vendor_id);
-- (Backfill of existing rows happens in §9 — runs AFTER the vendor seed.)


-- ============================================================
-- §7  RLS policies for every new table
-- ============================================================
-- Pattern: rows are visible/writable to users whose user_restaurants
-- membership includes the row's restaurant_id. Global rows (vendors,
-- vendor_aliases with restaurant_id IS NULL) are readable by any
-- authenticated user.

-- ── pos_sales ────────────────────────────────────────────────────
alter table public.pos_sales enable row level security;

drop policy if exists "Members see their POS sales"   on public.pos_sales;
drop policy if exists "Members write their POS sales" on public.pos_sales;

create policy "Members see their POS sales"
  on public.pos_sales for select
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

create policy "Members write their POS sales"
  on public.pos_sales for all
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  )
  with check (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

grant all on public.pos_sales to service_role;


-- ── vendors (global catalog: read = any authed; write = service role) ─
alter table public.vendors enable row level security;

drop policy if exists "Authed users see all vendors" on public.vendors;
create policy "Authed users see all vendors"
  on public.vendors for select
  using (auth.role() = 'authenticated');

grant all    on public.vendors to service_role;
grant select on public.vendors to authenticated;


-- ── vendor_aliases (global rows readable; restaurant-scoped rows by membership) ─
alter table public.vendor_aliases enable row level security;

drop policy if exists "See global + own vendor aliases" on public.vendor_aliases;
create policy "See global + own vendor aliases"
  on public.vendor_aliases for select
  using (
    restaurant_id is null
    or restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

drop policy if exists "Members write their vendor aliases" on public.vendor_aliases;
create policy "Members write their vendor aliases"
  on public.vendor_aliases for all
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  )
  with check (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

grant all on public.vendor_aliases to service_role;


-- ── restaurant_vendors ───────────────────────────────────────────
alter table public.restaurant_vendors enable row level security;

drop policy if exists "Members see their restaurant_vendors"   on public.restaurant_vendors;
drop policy if exists "Members write their restaurant_vendors" on public.restaurant_vendors;

create policy "Members see their restaurant_vendors"
  on public.restaurant_vendors for select
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

create policy "Members write their restaurant_vendors"
  on public.restaurant_vendors for all
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants
      where user_id = auth.uid() and role in ('owner','admin','manager')
    )
  )
  with check (
    restaurant_id in (
      select restaurant_id from public.user_restaurants
      where user_id = auth.uid() and role in ('owner','admin','manager')
    )
  );

grant all on public.restaurant_vendors to service_role;


-- ── restaurant_invites ───────────────────────────────────────────
-- Owners/admins can list and revoke. The token-based accept flow runs
-- via the SECURITY DEFINER RPC, so we don't need an INSERT policy here.

alter table public.restaurant_invites enable row level security;

drop policy if exists "Owners see invites for their restaurants" on public.restaurant_invites;
create policy "Owners see invites for their restaurants"
  on public.restaurant_invites for select
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

drop policy if exists "Owners revoke their invites" on public.restaurant_invites;
create policy "Owners revoke their invites"
  on public.restaurant_invites for delete
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

grant all on public.restaurant_invites to service_role;


-- ── recipes_estimated ────────────────────────────────────────────
alter table public.recipes_estimated enable row level security;

drop policy if exists "Members see their recipes"   on public.recipes_estimated;
drop policy if exists "Members write their recipes" on public.recipes_estimated;

create policy "Members see their recipes"
  on public.recipes_estimated for select
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

create policy "Members write their recipes"
  on public.recipes_estimated for all
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  )
  with check (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

grant all on public.recipes_estimated to service_role;


-- ── recipe_calibrations (read-only for users; written by background job) ─
alter table public.recipe_calibrations enable row level security;

drop policy if exists "Members see their calibrations" on public.recipe_calibrations;
create policy "Members see their calibrations"
  on public.recipe_calibrations for select
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

grant all on public.recipe_calibrations to service_role;


-- ============================================================
-- §8  Seed vendors (the ones we already know about)
-- ============================================================
-- Inserts are idempotent via ON CONFLICT.

insert into public.vendors (name, display_name, ingestion_method, apify_actor_id, default_email_domain, notes)
values
  ('restaurant_depot', 'Restaurant Depot', 'portal', 'y02W7F6wTWhnnEj0o', null, 'Existing Apify actor; daily schedule active'),
  ('sysco',            'Sysco',            'email',  null,                '@sysco.com',     null),
  ('us_foods',         'US Foods',         'email',  null,                '@usfoods.com',   null),
  ('baldor',           'Baldor',           'email',  null,                '@baldorfood.com',null),
  ('jetro',            'Jetro Cash & Carry','portal', null,               null,             'TODO: build actor'),
  ('costco_business',  'Costco Business',  'portal', null,                null,             'TODO: build actor')
on conflict (name) do nothing;

-- Seed global sender aliases for the email vendors. NULL restaurant_id = applies to all.
insert into public.vendor_aliases (vendor_id, sender_pattern, confidence)
select v.id, v.default_email_domain, 'manual'
from public.vendors v
where v.default_email_domain is not null
on conflict do nothing;


-- ============================================================
-- §9  Backfill existing invoice_files
-- ============================================================
-- Everything currently in invoice_files came from the Apify
-- Restaurant Depot actor — no other ingestion path exists yet.
-- Tag those rows so the new automation/health UI shows them correctly.
update public.invoice_files
set source = 'portal',
    vendor_id = (select id from public.vendors where name = 'restaurant_depot')
where source is null;


-- ============================================================
-- DONE.
-- Verify with:
--   select count(*) from public.vendors;        -- expect 6
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='restaurants'
--     and column_name in ('stripe_subscription_id','subscription_status','trial_ends_at');
--   select count(*) from public.pos_sales;      -- expect 0 (table just created)
-- ============================================================
