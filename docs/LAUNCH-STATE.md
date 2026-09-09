# CoastLoop Launch State

## Production
- coastloop.site healthy
- Worker version 0.27.8
- Repository clean

## Customer flow ready
- Unified authentication and portal
- Host self-service request flow
- Advertiser annual/monthly order flow
- Electronic advertiser agreement
- Invoice preparation and send path
- Paid order advances campaign
- Paid campaign activates
- Customer creative upload
- Creative enters pending review
- Admin approve/reject workflow
- Unapproved advertiser media cannot enter commercial playback
- Advertiser/campaign ownership guards enforced
- Verified-delivery reporting present

## Player ready
- Roku 0.1 build 12
- Pairing by code
- Device registry
- Config/heartbeat/proof
- Last-known playlist metadata cache
- Cache bounded
- Test screens excluded from commercial metrics

## External launch blockers
1. Stripe
   - STRIPE_SECRET_KEY not connected
   - STRIPE_WEBHOOK_SECRET not connected
   - Live money collection must not be represented as active yet

2. Branded authentication domain
   - SUPABASE_AUTH_URL not configured
   - Google OAuth works, but consent currently exposes Supabase hostname
   - Requires Supabase paid/custom-domain setup, DNS, and Google callback update

3. North Beach hardware validation
   - Install/sideload current Roku build
   - Pair real venue screen
   - Confirm boot/config/playback/heartbeat/proof on venue network
   - Confirm recovery after network interruption

## Important limitation
Roku currently caches playlist metadata, not media binaries.
Do not claim full offline media playback.

## Next execution order
1. Connect Stripe when business/payment credentials are available.
2. Configure auth.coastloop.site when Supabase custom domain is available.
3. Run North Beach live hardware validation.
4. Begin advertiser/host onboarding.
