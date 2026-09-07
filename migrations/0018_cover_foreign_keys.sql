create index if not exists billing_invoices_created_by_idx
  on public.billing_invoices(created_by);

create index if not exists billing_transactions_advertiser_business_idx
  on public.billing_transactions(advertiser_business_id);

create index if not exists billing_transactions_created_by_idx
  on public.billing_transactions(created_by);

create index if not exists broker_payouts_created_by_idx
  on public.broker_payouts(created_by);

create index if not exists businesses_source_prospect_idx
  on public.businesses(source_prospect_id);

create index if not exists campaigns_advertiser_business_idx
  on public.campaigns(advertiser_business_id);

create index if not exists creative_jobs_advertiser_business_idx
  on public.creative_jobs(advertiser_business_id);

create index if not exists creative_jobs_output_asset_idx
  on public.creative_jobs(output_asset_id);

create index if not exists creative_jobs_requested_by_idx
  on public.creative_jobs(requested_by);

create index if not exists host_payouts_created_by_idx
  on public.host_payouts(created_by);

create index if not exists host_payouts_location_idx
  on public.host_payouts(location_id);

create index if not exists locations_business_idx
  on public.locations(business_id);

create index if not exists locations_zone_idx
  on public.locations(zone_id);

create index if not exists media_assets_advertiser_business_idx
  on public.media_assets(advertiser_business_id);

create index if not exists media_assets_created_by_idx
  on public.media_assets(created_by);

create index if not exists playback_daily_media_asset_idx
  on public.playback_daily(media_asset_id);

create index if not exists playback_daily_screen_idx
  on public.playback_daily(screen_id);

create index if not exists playlist_items_campaign_idx
  on public.playlist_items(campaign_id);

create index if not exists playlist_items_media_asset_idx
  on public.playlist_items(media_asset_id);

create index if not exists playlist_items_organization_idx
  on public.playlist_items(organization_id);

create index if not exists playlists_created_by_idx
  on public.playlists(created_by);

create index if not exists playlists_organization_idx
  on public.playlists(organization_id);

create index if not exists prospects_assigned_to_idx
  on public.prospects(assigned_to);

create index if not exists screen_playlist_assignments_organization_idx
  on public.screen_playlist_assignments(organization_id);

create index if not exists screen_playlist_assignments_playlist_idx
  on public.screen_playlist_assignments(playlist_id);

create index if not exists screens_location_idx
  on public.screens(location_id);

create index if not exists user_invitations_accepted_by_idx
  on public.user_invitations(accepted_by);

create index if not exists user_invitations_business_idx
  on public.user_invitations(business_id);

create index if not exists user_invitations_invited_by_idx
  on public.user_invitations(invited_by);

create index if not exists user_invitations_organization_idx
  on public.user_invitations(organization_id);
