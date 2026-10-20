-- Atomic service-role helpers for CoastLoop Zone boundary draft/version lifecycle.

create or replace function public.create_zone_boundary_draft_atomic(
  p_organization_id uuid,
  p_zone_id uuid,
  p_boundary_geojson jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next integer;
  v_row public.zone_boundary_versions;
begin
  if jsonb_typeof(p_boundary_geojson) <> 'object'
     or p_boundary_geojson->>'type' not in ('Polygon','MultiPolygon')
     or jsonb_typeof(p_boundary_geojson->'coordinates') <> 'array'
  then
    raise exception 'invalid zone boundary GeoJSON';
  end if;

  perform 1
  from public.zones
  where id = p_zone_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'zone not found';
  end if;

  select coalesce(max(version), 0) + 1
    into v_next
  from public.zone_boundary_versions
  where zone_id = p_zone_id;

  insert into public.zone_boundary_versions (
    organization_id,
    zone_id,
    version,
    boundary_geojson,
    status
  )
  values (
    p_organization_id,
    p_zone_id,
    v_next,
    p_boundary_geojson,
    'draft'
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.activate_zone_boundary_version_atomic(
  p_organization_id uuid,
  p_zone_id uuid,
  p_boundary_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.zone_boundary_versions;
begin
  perform 1
  from public.zones
  where id = p_zone_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'zone not found';
  end if;

  select *
    into v_row
  from public.zone_boundary_versions
  where id = p_boundary_id
    and zone_id = p_zone_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'zone boundary not found';
  end if;

  if v_row.status <> 'draft' then
    raise exception 'only draft zone boundaries can be activated';
  end if;

  update public.zone_boundary_versions
  set
    status = 'superseded',
    effective_to = coalesce(effective_to, now())
  where organization_id = p_organization_id
    and zone_id = p_zone_id
    and status = 'active';

  update public.zone_boundary_versions
  set
    status = 'active',
    effective_from = coalesce(effective_from, now()),
    effective_to = null
  where id = p_boundary_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.create_zone_boundary_draft_atomic(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_zone_boundary_draft_atomic(uuid,uuid,jsonb)
  to service_role;

revoke all on function public.activate_zone_boundary_version_atomic(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.activate_zone_boundary_version_atomic(uuid,uuid,uuid)
  to service_role;
