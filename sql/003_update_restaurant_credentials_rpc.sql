-- MISE — update_my_restaurant_credentials RPC
-- Author: 2026-06-24
--
-- Owner-only writer for vendor-portal credentials on the restaurants
-- row (currently Restaurant Depot). The restaurants table has RLS but
-- no UPDATE policy by design — all writes go through SECURITY DEFINER
-- RPCs so the role check lives in one place.
--
-- Convention:
--   null parameter → leave the column unchanged
--   ''   parameter → clear the column (set to NULL)
--   any other value → set the column
--
-- Idempotent. Safe to re-run.
-- ============================================================

create or replace function public.update_my_restaurant_credentials(
  p_restaurant_id uuid,
  p_rd_email text,
  p_rd_password text,
  p_rd_store_number text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role
    from public.user_restaurants
   where user_id = v_uid and restaurant_id = p_restaurant_id;

  if v_role is null then
    raise exception 'Not a member of this restaurant';
  end if;

  if v_role <> 'owner' then
    raise exception 'Only owners can update credentials (your role: %)', v_role;
  end if;

  update public.restaurants
     set rd_email        = case when p_rd_email        is null then rd_email        else nullif(p_rd_email, '')        end,
         rd_password     = case when p_rd_password     is null then rd_password     else nullif(p_rd_password, '')     end,
         rd_store_number = case when p_rd_store_number is null then rd_store_number else nullif(p_rd_store_number, '') end,
         updated_at      = now()
   where id = p_restaurant_id;
end;
$$;

grant execute on function public.update_my_restaurant_credentials(uuid, text, text, text) to authenticated;

comment on function public.update_my_restaurant_credentials(uuid, text, text, text) is
  'Owner-only: writes vendor-portal credentials (Restaurant Depot today) to the restaurants row. Null = no change, empty = clear.';
