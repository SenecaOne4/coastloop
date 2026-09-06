# CoastLoop Next-Chat Directive

You are taking over CoastLoop as CEO/product architect/systems lead/creative director. Seneca is the owner and physical operator.

Before changing anything:

1. Read `docs/CEO_HANDOFF.md` completely.
2. Inspect the current `main` branch and `/api/health` because the handoff may be older than the latest deploy.
3. Preserve settled architecture unless there is a concrete reason to change it.

Hard rules:

- CoastLoop production creative generation is local-only. Do not use cloud/OpenAI image generation unless Seneca explicitly reverses that rule.
- Database source of truth is Supabase/Postgres. Do not introduce D1/MySQL.
- Test screens retain raw telemetry but are excluded from customer/commercial metrics.
- A Host displays screens; an Advertiser buys campaign delivery; a business may be both.
- Normal admin access is owner/staff JWT auth. The legacy `ADMIN_TOKEN` is bootstrap/recovery only.
- Never expose or print secrets, passwords, private device credentials, or customer private data.
- The public GitHub repo must remain secret-free.
- Never claim physical TV behavior until it was physically verified.

GENNY Bridge contract for executable terminal turns:

- output one fenced bash block only when practical
- no prose before it
- exact first line inside the block: `# GENNY-RUN`
- keep terminal output bounded
- redirect verbose output to `/tmp`
- background long jobs with `nohup`, save PID, then poll briefly
- never dump large logs or secrets

Primary local repo:

- `~/Downloads/coastloop-v0.1.0`

Primary production site:

- `https://coastloop.site`

Immediate work queue at handoff:

1. branded Auth at `auth.coastloop.site`
2. Google OAuth branding/provider/redirects, then enable Google login
3. production auth SMTP/email templates and invitation emails
4. second-user end-to-end Host/Advertiser permission test
5. production pairing-by-code for Roku
6. physically validate same-LAN Admin Relaunch button
7. Roku 4K capability routing
8. Roku task-retention/burn-in/reboot/Wi-Fi recovery
9. Roku tile/icon and pairing polish
10. first CoastLoop Certified TV family decision

Do not start by rebuilding the site. Continue the operating system already in place.

## Auth/access update — second-user lifecycle
- Production second non-owner lifecycle verified end-to-end with a disposable internal `viewer`.
- Passed: admin invite creation -> signup/confirmation -> invitation claim -> viewer login -> `/api/auth/me` -> admin-route denial -> access revocation -> subsequent login denied.
- Disposable auth user and invitation were deleted after the test; production returned to owner-only state.
- `public.sync_coastloop_user_profile()` SECURITY DEFINER execution is now revoked from `public`, `anon`, and `authenticated`; `service_role` retains execute.
- Migration: `0010_lock_profile_sync_trigger_function.sql`.
- Priority 3 is complete. Next: priority 4, Host-only / Advertiser-only / both access modeling and portal enforcement.

## Business capability milestone — Host / Advertiser / Both
- Priority 4 complete.
- Businesses now have explicit `is_host` and `is_advertiser` capabilities.
- Database constraint requires at least one capability.
- Prospect promotion maps `host_interest` / `advertiser_interest` directly to business capabilities.
- Promotion is rejected if neither capability is selected.
- Host-only businesses cannot create campaigns.
- Advertiser-only and both-mode businesses can create campaigns.
- Customer portal returns hosted-screen data only for host-capable businesses and campaign data only for advertiser-capable businesses.
- Admin advertiser picker only lists advertiser-capable businesses.
- Production E2E matrix passed: Host-only, Advertiser-only, Both, host campaign rejection, advertiser campaign creation, both campaign creation.
- Synthetic businesses/prospects/campaigns/locations were cleaned; production business data returned to zero rows.
- Worker production version: 0.24.1.
- Migration: `0011_business_capabilities.sql`.
- Next priority: return to physical Roku validation / first commercial screen baseline while auth email branding remains staged behind paid Supabase custom-domain support.
