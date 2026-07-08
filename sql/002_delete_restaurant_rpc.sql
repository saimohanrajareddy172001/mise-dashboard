-- ============================================================
-- MISE — delete_my_restaurant RPC
-- Author: 2026-05-13
--
-- Owner-only restaurant deletion. ON DELETE CASCADE on every
-- child table (invoice_files, invoice_headers, invoice_lines,
-- pos_sales, restaurant_vendors, restaurant_invites,
-- restaurant_settings, user_restaurants, recipes_estimated,
-- recipe_calibrations, vendor_aliases) handles the cleanup.
--
-- Idempotent. Safe to re-run.
-- ============================================================

create or replace function public.delete_my_restaurant(p_restaurant_id uuid)
returns uuid
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
    raise exception 'Only owners can delete a restaurant (your role: %)', v_role;
  end if;

  -- Defensive: legacy profiles.restaurant_id is not declared ON DELETE CASCADE.
  update public.profiles
     set restaurant_id = null
   where restaurant_id = p_restaurant_id;

  delete from public.restaurants where id = p_restaurant_id;

  return p_restaurant_id;
end;
$$;

grant execute on function public.delete_my_restaurant(uuid) to authenticated;

comment on function public.delete_my_restaurant(uuid) is
  'Owner-only: deletes a restaurant and cascades through every child table. Used by the Settings → Danger Zone UI.';
