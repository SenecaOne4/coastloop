# CoastLoop Launch State

## Production
- coastloop.site healthy
- Worker version 0.27.8
- Repository clean

## Stripe live billing ready
- Live Stripe secret installed in the Worker
- Live Stripe webhook signing secret installed
- Signed webhook verification enforced
- Monthly package: $100, version 2
- Annual package: $1,000
- Superseded $95 monthly package blocked from new checkout
- Advertiser agreement acceptance creates and sends the Stripe invoice
- `invoice.paid` advances the advertiser order and activates its draft campaign

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

2. North Beach hardware validation
   - Install/sideload current Roku build
   - Pair real venue screen
   - Confirm boot/config/playback/heartbeat/proof on venue network
   - Confirm recovery after network interruption

## Important limitation
Roku currently caches playlist metadata, not media binaries.
Do not claim full offline media playback.

## Next execution order
1. Configure auth.coastloop.site when Supabase custom domain is available.
2. Run North Beach live hardware validation.
4. Begin advertiser/host onboarding.


## Advertising checkout legal gate
- Stripe live billing is configured and healthy.
- Public products expose only the current offers: $100 monthly and $1,000 annual.
- Superseded $95 monthly checkout is blocked server-side.
- Advertising checkout currently stops before signature because the only advertising terms template is `counsel_review`.
- The stored template explicitly says not to lock or sign until the CoastLoop contracting entity is completed and South Carolina counsel approves.
- This is an intentional legal gate, not a Stripe or checkout infrastructure failure.
- Do not bypass or relabel counsel approval in code.
