create index advertiser_order_zones_boundary_idx
  on public.advertiser_order_zones(zone_id, boundary_version)
  where boundary_version is not null;
