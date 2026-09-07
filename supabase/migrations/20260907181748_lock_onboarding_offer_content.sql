alter table public.agreement_templates
add column if not exists display_title text,
add column if not exists rendered_content text,
add column if not exists rendered_content_type text not null default 'text/html'
  check (rendered_content_type in ('text/html','text/plain')),
add column if not exists rendered_sha256 text
  check (rendered_sha256 is null or rendered_sha256 ~ '^[0-9a-f]{64}$');

alter table public.agreement_templates
add constraint agreement_templates_locked_content_check
check (
  status <> 'locked'
  or (
    locked_at is not null
    and rendered_content is not null
    and length(btrim(rendered_content)) > 0
    and rendered_sha256 is not null
    and rendered_sha256 = encode(
      extensions.digest(convert_to(rendered_content, 'UTF8'), 'sha256'),
      'hex'
    )
  )
);

create or replace function public.lock_final_agreement_template()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('locked','retired') and (
       new.template_family is distinct from old.template_family
    or new.template_version is distinct from old.template_version
    or new.display_title is distinct from old.display_title
    or new.source_storage_key is distinct from old.source_storage_key
    or new.source_sha256 is distinct from old.source_sha256
    or new.rendered_content is distinct from old.rendered_content
    or new.rendered_content_type is distinct from old.rendered_content_type
    or new.rendered_sha256 is distinct from old.rendered_sha256
    or new.locked_at is distinct from old.locked_at
  ) then
    raise exception 'locked agreement template content is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_final_agreement_template()
  from public, anon, authenticated;
grant execute on function public.lock_final_agreement_template()
  to service_role;

create trigger agreement_templates_lock_content
before update on public.agreement_templates
for each row execute function public.lock_final_agreement_template();

create or replace function public.lock_versioned_advertising_package()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('active','retired') and (
       new.package_key is distinct from old.package_key
    or new.version is distinct from old.version
    or new.name is distinct from old.name
    or new.market is distinct from old.market
    or new.placement_scope is distinct from old.placement_scope
    or new.price_cents is distinct from old.price_cents
    or new.currency is distinct from old.currency
    or new.term_days is distinct from old.term_days
    or new.ad_length_seconds is distinct from old.ad_length_seconds
    or new.frequency_label is distinct from old.frequency_label
    or new.loop_share is distinct from old.loop_share
    or new.screen_count is distinct from old.screen_count
    or new.projected_plays is distinct from old.projected_plays
    or new.projection_period_days is distinct from old.projection_period_days
    or new.activated_at is distinct from old.activated_at
  ) then
    raise exception 'active advertising package version is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_versioned_advertising_package()
  from public, anon, authenticated;
grant execute on function public.lock_versioned_advertising_package()
  to service_role;

create trigger advertising_packages_lock_version
before update on public.advertising_packages
for each row execute function public.lock_versioned_advertising_package();
