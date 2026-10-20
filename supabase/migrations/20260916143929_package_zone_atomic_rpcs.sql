-- Atomic package geography administration.
-- Package Zone membership is editable only while the package version is draft.

create or replace function public.replace_advertising_package_zones_atomic(
  p_organization_id uuid,
  p_package_id uuid,
  p_zones jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_coverage_mode text;
  v_item jsonb;
  v_zone_id uuid;
  v_weight numeric;
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_zones, '[]'::jsonb)) <> 'array' then
    raise exception 'zones must be an array';
  end if;

  select status, coverage_mode
    into v_status, v_coverage_mode
  from public.advertising_packages
  where id = p_package_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'advertising package not found';
  end if;

  if v_status <> 'draft' then
    raise exception 'package zone membership is immutable once package is not draft';
  end if;

  if v_coverage_mode <> 'zones' then
    raise exception 'package coverage_mode must be zones';
  end if;

  delete from public.advertising_package_zones
  where package_id = p_package_id;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_zones, '[]'::jsonb))
  loop
    if jsonb_typeof(v_item) <> 'object'
       or nullif(trim(v_item->>'zone_id'), '') is null then
      raise exception 'each package zone requires zone_id';
    end if;

    v_zone_id := (v_item->>'zone_id')::uuid;
    v_weight := coalesce(nullif(v_item->>'delivery_weight', '')::numeric, 1);

    if v_weight <= 0 then
      raise exception 'delivery_weight must be greater than zero';
    end if;

    if not exists (
      select 1
      from public.zones
      where id = v_zone_id
        and organization_id = p_organization_id
        and status = 'active'
    ) then
      raise exception 'zone % is not an active zone in this organization', v_zone_id;
    end if;

    insert into public.advertising_package_zones (
      package_id,
      zone_id,
      delivery_weight,
      metadata
    )
    values (
      p_package_id,
      v_zone_id,
      v_weight,
      case
        when jsonb_typeof(v_item->'metadata') = 'object' then v_item->'metadata'
        else '{}'::jsonb
      end
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'package_id', p_package_id,
    'coverage_mode', v_coverage_mode,
    'zone_count', v_count
  );
end;
$$;

create or replace function public.activate_advertising_package_atomic(
  p_organization_id uuid,
  p_package_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_package public.advertising_packages%rowtype;
begin
  select *
    into v_package
  from public.advertising_packages
  where id = p_package_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'advertising package not found';
  end if;

  if v_package.status <> 'draft' then
    raise exception 'only a draft package can be activated';
  end if;

  update public.advertising_packages
  set status = 'active',
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
  where id = p_package_id;

  return jsonb_build_object(
    'package_id', p_package_id,
    'package_key', v_package.package_key,
    'version', v_package.version,
    'status', 'active',
    'coverage_mode', v_package.coverage_mode
  );
end;
$$;

revoke all on function public.replace_advertising_package_zones_atomic(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.activate_advertising_package_atomic(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.replace_advertising_package_zones_atomic(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.activate_advertising_package_atomic(uuid, uuid)
  to service_role;
