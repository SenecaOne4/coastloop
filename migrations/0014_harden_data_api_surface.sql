-- CoastLoop privileged application data is accessed through the Cloudflare Worker.
-- Remove direct browser/Data API CRUD privileges from application tables.
-- service_role retains its server-side privileges.

revoke all on table public.business_members from anon, authenticated;
revoke all on table public.businesses from anon, authenticated;
revoke all on table public.campaigns from anon, authenticated;
revoke all on table public.creative_jobs from anon, authenticated;
revoke all on table public.locations from anon, authenticated;
revoke all on table public.media_assets from anon, authenticated;
revoke all on table public.organization_members from anon, authenticated;
revoke all on table public.organizations from anon, authenticated;
revoke all on table public.playback_daily from anon, authenticated;
revoke all on table public.playback_proof_receipts from anon, authenticated;
revoke all on table public.playlist_items from anon, authenticated;
revoke all on table public.playlists from anon, authenticated;
revoke all on table public.prospects from anon, authenticated;
revoke all on table public.screen_playlist_assignments from anon, authenticated;
revoke all on table public.screens from anon, authenticated;
revoke all on table public.user_invitations from anon, authenticated;
revoke all on table public.user_profiles from anon, authenticated;
revoke all on table public.zones from anon, authenticated;
