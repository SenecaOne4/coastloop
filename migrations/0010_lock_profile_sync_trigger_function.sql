revoke all on function public.sync_coastloop_user_profile()
  from public, anon, authenticated;

grant execute on function public.sync_coastloop_user_profile()
  to service_role;
