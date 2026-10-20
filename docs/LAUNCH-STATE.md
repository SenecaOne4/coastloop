# CoastLoop Launch State

Updated: 2026-09-21

## Production
- `coastloop.site` healthy.
- Worker version `0.27.8`.
- Current production deployment is 100% version `8cbebeb0-6e57-4377-aaa3-f681655c3eef`.
- Monthly public display price hotfix passed a 5% canary and was promoted to 100%.
- Public package/API pricing agrees with the website.
- Working repository is intentionally dirty with accumulated launch work; do not deploy the working tree wholesale.

## Stripe live billing
- Live Stripe secret is installed in the production Worker.
- Live Stripe webhook signing secret is installed.
- Signed webhook verification is enforced.
- Production billing config reports Stripe and webhook configured.
- Current billing model is hosted invoice.
- No billing invoices currently exist.
- Advertising agreement acceptance creates the campaign/order billing path and sends the Stripe invoice.
- `invoice.paid` advances the advertiser order and activates its draft campaign.
- Do not run a live acceptance/payment test casually; it creates real production billing artifacts.

## Advertising packages
- Current monthly offer: `coastloop-monthly` version 3, $100 / 30 days.
- Current annual offer: `coastloop-annual` version 2, $1,000 / 365 days.
- Both current offers use `coverage_mode=zones`.
- Both are entitled to the North Myrtle Beach zone.
- Package zone membership is snapshotted immutably into advertiser orders.
- Superseded active package versions are blocked from new checkout server-side.
- Public coverage currently reports one zone and zero locations/screens, which is intentional until a host location is signed and commissioned.
- Static `/advertise` pricing now shows $100 monthly and $1,000 annual.

## Advertiser checkout validation
- Prepared checkout against monthly version 3 passed.
- Checkout session returned `can_accept=true`.
- Prepared order correctly snapshotted:
  - `coverage_mode=zones`
  - North Myrtle Beach zone entitlement
  - $100 monthly price
- No campaign, invoice, acceptance, or payment was created during the smoke test.
- Smoke order was canceled and its token revoked after validation.
- Old expired annual version 1 test order was normalized to `expired`; its token is also `expired`.
- No live billing invoice exists from either test.

## Legal templates
- Advertising order terms template is `locked`.
- Venue partner template remains `counsel_review`.
- Real host agreement execution must not proceed until the venue template is approved/locked by counsel.
- Do not bypass or relabel counsel approval in code.

## Geography / first host
- Market: Grand Strand.
- Active zone: North Myrtle Beach.
- Cinzia Spa at North Beach exists as a host prospect/location.
- Cinzia `host_status=negotiating`.
- Cinzia currently has `zone_id=null`.
- This is deliberate so a negotiating location is not exposed as sellable public inventory.
- Reattach Cinzia to the North Myrtle Beach zone only after the venue agreement is actually signed/authorized.

## Roku public channel
- Public Roku channel ID: `882866`.
- Submitted app version: `0.1.16`.
- Version access code: `6NHC6H`.
- Roku state: `Publishing`.
- Scheduled publishing: Sep 23, 2026 at 10:00 AM PT.
- Static analysis passed.
- Do not modify the submitted Roku package, listing, monetization, or release metadata before publication; Roku warned that changes cancel the scheduled release.

## Roku player validation
- Physical TCL Roku pilot is paired and active.
- Pilot screen ID: `33f7f129-4804-4703-aa69-bc16a7525cdd`.
- App version: `roku-0.1.16`.
- Pilot remains `is_test=true`, `deployment_class=pilot`, with no production certification/location.
- Boot/identity, pairing, config, heartbeat, playback, proof persistence, and live playlist reassignment passed.
- House -> Lab -> House live schedule reassignment passed.
- Five-hour burn-in passed with approximately 95.4% verified-play coverage.
- Standby off/on recovery passed.
- True AC reboot returned Roku to Home; automatic CoastLoop relaunch after cold boot did not occur.
- Manual relaunch after cold boot preserved pairing/config and resumed verified playback.
- Treat cold-power-loss relaunch as an installation/operations requirement unless a supported Roku auto-launch/device-management path is established.
- Do not mark the pilot as commercial production hardware.

## Commercial hardware gate
A non-test commercial screen requires:
- `deployment_class=production`
- nonempty `certification_note`
- real `location_id`
- active authorized host location
- successful venue-network validation

Do not attach or relabel a lab/pilot screen as the Cinzia production screen.

## Public network state
- Network state is `commissioning`.
- Public commercial locations: 0.
- Public commercial screens: 0.
- Public active campaigns: 0.
- Test/lab Roku activity is correctly excluded from commercial public metrics.

## Authentication
- Unified authentication and portal are operational.
- Existing authenticated production sessions work.
- Branded Supabase auth domain `auth.coastloop.site` is live over HTTPS.
- Production `/api/auth/config` reports `google_enabled=true` and `auth_host=auth.coastloop.site`.
- CoastLoop Google sign-in starts with a 302 to the branded auth domain.
- The branded auth domain then redirects to Google with callback `https://auth.coastloop.site/auth/v1/callback`.
- CoastLoop post-auth redirect returns to `https://coastloop.site/auth-callback`.
- Branded Google OAuth routing is therefore configured and externally reachable.
- We have not intentionally completed a fresh production Google login/account creation during this launch audit.

## Current launch gates
1. Preserve the Roku public submission until scheduled publication.
2. Obtain counsel approval and lock the venue partner agreement template.
3. Execute the real Cinzia venue agreement.
4. Reattach the signed Cinzia location to the North Myrtle Beach zone.
5. Install/pair the actual Cinzia Roku at the venue.
6. Validate boot/config/playback/heartbeat/proof and network-interruption recovery on the venue network.
7. Certify that physical screen as production hardware only after validation.
8. Run a deliberate real advertiser billing transaction only when intentionally authorized.
9. Begin live advertiser/host fulfillment against commissioned inventory.

## Deployment safety
- Do not run a normal `wrangler deploy` from the current dirty working tree.
- The Sep 21 public-price fix was deployed by reconstructing the exact active Worker source and changing only the required static price asset.
- Previous production Worker version `6a677c95-179e-4a6f-8665-6eb8a835da61` remains a known rollback point.
