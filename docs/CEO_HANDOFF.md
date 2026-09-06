# CoastLoop CEO Handoff

Last updated: 2026-09-06

This document is the durable handoff for a new CEO/product-architect chat. It is intentionally safe for the public repository: it names secret locations and environment variables but never contains secret values, passwords, private LAN addresses, personal email addresses, or private device credentials.

## 1. CEO directive

Operate as CoastLoop's CEO, product architect, systems lead, and creative director. Seneca is the owner and real-world operator. Move the product forward proactively, but do not claim physical-world actions that have not been verified. Keep product, sales, hardware, software, telemetry, creative, and launch decisions tied to the business goal: a premium hyperlocal TV advertising network that is unusually easy to deploy and unusually credible to advertisers.

CoastLoop's thesis is:

> Local ads don't need to look local.

The product must make local advertising feel premium, measurable, operationally boring, and easy for hosts.

Primary customer concepts:

- **Host**: a venue/business displaying one or more CoastLoop screens.
- **Advertiser**: a business paying for campaign delivery.
- One business may be both a Host and an Advertiser.
- **CoastLoop staff**: internal operators such as owner/admin/sales/creative/viewer.

Do not collapse Hosts and Advertisers into one vague role. Their permissions and dashboards differ even if they share a business record.

## 2. Business/product direction

Preferred rollout model:

- Standardize on new, sealed, known-model smart TVs with warranty rather than random BYO hardware.
- Prefer native TV playback when practical so the TV is the player and no HDMI box is required.
- Keep the web player as a compatibility path.
- Build toward a small set of **CoastLoop Certified** TV families/sizes after burn-in testing.
- Hosts receive an easy, low-friction screen/install proposition.
- Advertisers buy recurring local inventory and receive credible proof-of-play reporting.
- CoastLoop's house creative is permanent reserved inventory and should always look like the network's best work.

The network advantage is not "cheap screens." It is premium creative + hyperlocal placement + device health + verified delivery.

## 3. Live stack

### Domain / edge

Production domain:

- `https://coastloop.site`
- `https://www.coastloop.site`

Cloudflare Worker:

- Worker name: `coastloop`
- Worker entry: `src/worker.js`
- Config: `wrangler.jsonc`
- Static asset directory: `public/`
- API/media routes run Worker first.

R2:

- Binding: `MEDIA`
- Bucket: `coastloop-media`

Current verified live API version at handoff:

- `0.19.0`

Recent verified deployment after the admin asset refresh:

- Cloudflare Version ID `ce4eb398-8ffc-490b-87d7-58b157230121`

Do not assume this remains the newest deployment forever; verify with `/api/health` and the next `wrangler deploy` output.

### Database / Auth

Supabase production project ref:

- `ilpcliemrtuuljbpinrb`

Database source of truth is Postgres/Supabase. Do not introduce D1 or MySQL.

Current auth host still falls back to the project hostname:

- `ilpcliemrtuuljbpinrb.supabase.co`

Production target:

- `auth.coastloop.site`

Google sign-in is prepared in application code but intentionally **disabled** until the Google OAuth provider, branded consent screen, redirect URLs, and branded auth host are configured correctly.

At handoff:

- first CoastLoop owner account has been created
- `BOOTSTRAP_REQUIRED=false`
- owner JWT login is verified
- owner role is `owner`
- password-change UI exists
- Users & Access admin surface exists
- Host/Advertiser invitation/account activation exists
- Google auth is still disabled

## 4. Repository / local filesystem

GitHub:

- Repository: `SenecaOne4/coastloop`
- Branch: `main`
- Visibility: public

Primary local checkout on Seneca's Mac:

- `~/Downloads/coastloop-v0.1.0`

Important paths:

- `src/worker.js` — Cloudflare API, player endpoints, admin endpoints, metrics, media serving
- `src/auth.js` — authentication, owner bootstrap, JWT access, invitations, user directory, Host/Advertiser portal authorization
- `public/index.html` — public site
- `public/admin.html` / `public/admin.js` — CoastLoop control plane
- `public/login.html` / `public/login.js` — owner/staff/customer login and invited-account activation
- `public/account.html` / `public/account.js` — account/password management
- `public/portal.html` / `public/portal.js` — Host/Advertiser customer portal
- `public/player.html` / `public/player.js` — browser player compatibility path
- `public/report.html` / `public/report.js` — advertiser delivery report
- `public/session.js` — browser auth session helper
- `roku/` — native Roku client
- `roku/build/coastloop-roku-dev.zip` — local Roku development package after build
- `scripts/build-roku.sh` — Roku package builder
- `migrations/` — durable database migrations
- `docs/CREATIVE_PIPELINE.md` — local-only creative production rules
- `docs/BRAND_CAMPAIGN_V4.md` — locked brand campaign direction
- `docs/CEO_HANDOFF.md` — this file

Local-only working state:

- `.coastloop/` is intentionally gitignored and may contain creative jobs/private operator notes.
- Never move secrets or private device credentials into the public repo.

## 5. Secret and credential locations

### Local development

Root file:

- `~/Downloads/coastloop-v0.1.0/.dev.vars`

Existing secret/connection names include:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `ADMIN_TOKEN`

Auth-related optional environment names supported/planned:

- `SUPABASE_AUTH_URL`
- `GOOGLE_AUTH_ENABLED`
- `AUTH_INVITE_EMAILS_ENABLED`

Rules:

- Never print secret values into chat or terminal output.
- Never commit `.dev.vars`.
- `ADMIN_TOKEN` is now a bootstrap/recovery mechanism, not the normal admin login.
- Owner/staff/customer logins should use Supabase Auth JWT sessions.
- Google OAuth client secret belongs in Supabase Auth provider configuration, not browser JavaScript and not the public repo.

### Cloudflare

Worker production secrets are managed with Wrangler/Cloudflare secrets. Core names mirror local environment variables:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `ADMIN_TOKEN`

When branded auth is activated, configure the appropriate production value for:

- `SUPABASE_AUTH_URL=https://auth.coastloop.site`

Do not expose the Supabase secret key to frontend code.

### Supabase

Sensitive Auth provider credentials live in Supabase Dashboard / Auth provider configuration.

Future branded Google auth work should include:

1. Configure Supabase custom domain `auth.coastloop.site` if the project plan supports the custom-domain add-on.
2. Point the required CNAME/TXT records in Cloudflare as instructed by Supabase.
3. Activate the custom domain only after callback URLs are staged.
4. Create/configure the Google OAuth application with CoastLoop branding, logo, privacy policy, terms, authorized origins, and both old/new callback URLs during transition.
5. Add Google client ID/secret to Supabase Auth.
6. Set Site URL and redirect allow-list for `https://coastloop.site` and CoastLoop auth callback routes.
7. Enable `GOOGLE_AUTH_ENABLED=true` only after end-to-end testing.
8. Configure branded SMTP/email templates before enabling automatic invitation emails.

The reason for the custom auth domain is trust: users should see CoastLoop, not a random Supabase project hostname, during sign-in.

## 6. Data model and access model

Core operational tables include:

- `organizations`
- `organization_members`
- `prospects`
- `businesses`
- `zones`
- `locations`
- `campaigns`
- `media_assets`
- `playlists`
- `playlist_items`
- `screens`
- `screen_playlist_assignments`
- `playback_daily`
- `creative_jobs`

Auth/access tables added in production:

- `user_profiles`
- `business_members`
- `user_invitations`

Durable migration:

- `migrations/0006_user_access_foundation.sql`

Internal CoastLoop roles:

- `owner`
- `admin`
- `sales`
- `creative`
- `viewer`

Business membership roles:

- `owner`
- `manager`
- `viewer`

Current design:

- internal users receive organization-level roles
- Host/Advertiser users receive membership on one or more business records
- invitation acceptance claims the corresponding membership
- one user may belong to multiple businesses
- one business may host screens, run ad campaigns, or both

RLS is enabled on the auth-access tables. The Cloudflare Worker performs privileged backend operations with the server secret. Never weaken RLS merely to make frontend development easier.

## 7. Authentication state and routes

Normal auth routes are implemented under `/api/auth/*`.

Important surfaces:

- `/login` / `/login.html`
- `/account` / `/account.html`
- `/portal` / `/portal.html`
- `/admin` / `/admin.html`

The production edge currently returns a `307` for `/admin.html` to `/admin`; use `curl -L` when verifying the actual rendered admin content.

At handoff, owner login is the expected admin path. The old Admin Token UI exists only as a recovery/bootstrap escape hatch.

Admin user management supports:

- list activated users
- show internal role
- show business memberships
- invite/grant internal access
- invite/grant Host/Advertiser business access
- edit access
- revoke pending invitations
- copy activation links when outbound invitation email is not yet enabled

Customer portal supports the beginnings of:

- Host business context
- hosted location/screen visibility
- online/offline state
- plays today / last verified playback
- Advertiser campaigns
- verified plays
- delivered airtime
- screen count
- last verified delivery

Do not expose internal test-screen data in commercial/customer metrics.

## 8. Player, telemetry and proof of play

The player lifecycle is intentionally separated into:

- boot / device identity
- pairing
- config / playlist
- heartbeat
- proof of playback

Admin health meaning:

- **ONLINE** means the CoastLoop player has sent a recent heartbeat, not merely that the TV has power.
- If a user exits CoastLoop to the TV home screen, heartbeats stop and the screen eventually becomes offline.

Verified play meaning:

- Native Roku proof is not emitted merely because media was requested.
- Playback timing begins after Roku reports actual `playing` state.
- Proof is recorded only after a real delivered playback path.
- Backend aggregation uses `public.record_playback_atomic(...)`.

`playback_daily` stores aggregate proof by screen/media/campaign/date and delivered seconds.

### Test-screen isolation

`screens.is_test` marks internal/demo/test devices.

Policy:

- retain their raw telemetry/playback data
- show their per-screen data internally
- exclude them from commercial totals and advertiser-facing campaign reports

At handoff, the existing launch/dev devices have been classified as TEST, leaving commercial metrics at a clean zero baseline until the first real customer installation.

Never silently delete launch telemetry just to make a dashboard number cleaner.

## 9. House inventory

Canonical house playlist:

- name: `CoastLoop House Loop`

Policy:

- no assignment, missing playlist, or empty playlist falls back to House Loop
- every non-house active playlist receives a reserved CoastLoop house item
- clients cannot remove CoastLoop's permanent house slot

Current production house creative uses the approved V3 assets. There is a 4K master and a 1080 compatibility derivative. Do not delete the 1080 derivative until native 4K capability is conclusively handled across certified hardware.

## 10. Native Roku state

Native Roku is the leading hardware path.

Current client files:

- `roku/manifest`
- `roku/source/main.brs`
- `roku/components/MainScene.xml`
- `roku/components/MainScene.brs`
- `roku/components/CoastLoopNetworkTask.xml`
- `roku/components/CoastLoopNetworkTask.brs`

Build:

```bash
./scripts/build-roku.sh
```

Development package:

- `roku/build/coastloop-roku-dev.zip`

Current known code generations:

- `roku-0.1.3` proved real physical 15-second playback on the lab TCL after byte-range streaming was fixed.
- `roku-0.1.4` is built to report LAN IP automatically for same-LAN administrative control; do not assume every test TV is running it until app-version telemetry confirms it.

Media serving supports HTTP byte ranges (`206`, `Content-Range`, `Accept-Ranges`) because Roku native video required it.

### Roku control caveat

Admin has a **Relaunch** control for Roku using its local ECP endpoint.

Important limitation:

- Cloudflare cannot directly reach a private LAN address.
- The current button is a same-LAN browser control.
- Direct ECP launch from a Mac on the same LAN has been verified.
- The browser admin button itself must be physically validated under modern mixed-content/private-network restrictions; do not claim remote-across-town control until a proper cloud command channel exists.

Future proper remote-control model should be a cloud command queue polled by the player (relaunch/refresh/diagnostics/etc.), rather than pretending the Cloudflare Worker can call private LAN addresses.

## 11. Roku pairing work still required

Manual pairing performed during hardware validation was not acceptable as final UX.

Launch-quality pairing target:

1. TV starts unpaired.
2. TV shows a short pairing code.
3. Operator enters the code in Admin/mobile.
4. Backend resolves the screen by `pairing_code`.
5. Operator assigns business/location/name/playlist.
6. TV polls config and becomes paired automatically.

Do not regress to manually editing the database or auto-pairing lab screens as the production workflow.

## 12. Roku launch blockers / burn-in backlog

Before calling hardware production-ready:

- finish true pairing-by-code flow
- verify actual 4K capability using the appropriate Roku APIs rather than relying only on `GetDisplaySize()`
- improve pairing screen visual sharpness using native/local assets
- add proper CoastLoop Roku home tile/icon
- test Home/back accidental exit recovery
- burn in for hours, then overnight
- test TV reboot and app persistence
- test Wi-Fi loss/recovery
- fix retained network tasks (`m.tasks.Push(task)`) so long-running app does not leak task objects
- add retries/backoff without proof duplication
- determine deployment/distribution/private-channel production strategy
- establish provisioning checklist for new TVs
- verify commercial-use warranty/duty-cycle implications before declaring a certified model family

## 13. Creative pipeline — hard rule

**CoastLoop creative generation is local-only unless Seneca explicitly reverses this.**

Do not use OpenAI cloud image generation for CoastLoop creative.

Local generator:

- app: `~/local_generator`
- launcher: `~/local_generator/launch.sh`
- browser UI: `http://127.0.0.1:7867/`
- CLI: `~/.local/bin/localgen`

Typical CLI characteristics:

- prompt is positional
- flags include `--w`, `--h`, `--steps`, `--guidance`, `--seed`, `--render-root`
- 1920×1088 / 28-step strong renders can take roughly 20+ minutes on the current machine

Production workflow:

1. local generator for visual source material
2. exact typography/logo treatment in browser/Chrome composition
3. ffmpeg for motion/delivery encoding
4. create 4K master first where appropriate
5. retain 1080 compatibility until hardware support is verified

Do not prompt-chase weak creative indefinitely. Use the strongest approved local frame/source and build disciplined layout/motion around it.

Locked brand campaign language includes:

- `Your business.`
- `On screens that`
- `    get seen.`
- `Local ads don't`
- `need to look`
- `    local.`
- `Beautiful creative.`
- `Real proof of play.`
- `COASTLOOP`
- `Local · Beautiful · Measurable`
- `coastloop.site`

Logo direction: tiny premium lift only — richer contrast, slightly warmer gold, subtle depth; do not redesign the geometry or apply heavy bevel/gimmicks.

## 14. Deployment / verification runbook

From the local repo:

```bash
cd ~/Downloads/coastloop-v0.1.0
npm install
npx wrangler deploy
```

Health check:

```bash
curl -fsS https://coastloop.site/api/health
```

When deploying through GENNY Bridge, background longer commands and keep returns bounded:

```bash
nohup npx wrangler deploy >/tmp/coastloop-deploy.log 2>&1 </dev/null &
echo $! >/tmp/coastloop-deploy.pid
```

Then poll only the short status/tail rather than streaming Wrangler output indefinitely.

Before declaring a deployment successful, verify:

- Worker Version ID printed
- `/api/health` returns intended version
- any new API route returns expected authorization behavior
- cache-busted static asset contains the expected UI feature
- physical behavior is not claimed until physically observed when required

Static asset gotcha discovered during auth work:

- a Worker deploy can succeed while a stale public asset is still being served
- verify the actual asset with cache busting and hashes when needed

## 15. GENNY Bridge execution contract

Seneca uses a local Bridge that executes terminal blocks.

For executable Bridge turns:

- send **one fenced bash block only** when practical
- no prose before the block
- literal first line inside the fenced block must be exactly:

```text
# GENNY-RUN
```

Do not render that trigger as a Markdown heading outside the code fence.

Keep output aggressively bounded. Large terminal returns can kill the Bridge/MCP.

Preferred patterns:

- redirect verbose output to `/tmp/...log`
- use `nohup` for predictable long-running operations
- save a PID file
- poll with `kill -0`, `grep`, `tail -n 10`, short Python summaries
- never `cat` large logs
- never print secrets
- one operational step at a time when a physical user action is required

## 16. Git / database discipline

- Git branch: `main`
- meaningful successful changes should be committed and pushed
- repository is public: no secrets, passwords, private LAN/device credentials, private customer data, or personal contact data in committed docs
- database schema changes must have durable migrations in `migrations/`
- production DDL should use Supabase migration tooling, not ad-hoc changes without recording them

Current durable migration list includes:

- `0001_init.sql`
- `0002_remove_obsolete_gateway_rpc_layer.sql`
- `0003_atomic_playback.sql`
- `0004_test_screen_metric_exclusion.sql`
- `0005_screen_lan_control.sql`
- `0006_user_access_foundation.sql`

Production Supabase migration history contains the matching auth migration under the name `user_access_foundation`.

## 17. Current launch/admin status

As of handoff:

- public site is live
- admin control plane is live
- public lead funnel and field-sales pipeline exist
- campaign creation and advertiser proof reports exist
- playlist/media management exists
- physical Roku playback has been validated
- byte-range streaming works
- heartbeat online/offline visibility works
- verified playback telemetry works
- test-device isolation works
- same-LAN Roku relaunch path exists
- owner login exists and is verified
- owner password can be changed from Account
- Users & Access directory exists
- Host/Advertiser invitations and business access model exist
- customer portal foundation exists
- Google login is prepared but disabled
- branded auth domain is not yet activated

## 18. Immediate CEO priority order

Do these in roughly this order unless Seneca redirects:

1. Finish branded auth: `auth.coastloop.site`, Google OAuth branding/provider, redirect URLs, then enable Google sign-in.
2. Configure production auth email/SMTP/templates, then enable invitation emails.
3. Test a second non-owner account end to end: invite -> activate -> portal -> password change -> revoke access.
4. Test a business that is Host-only, Advertiser-only, and both.
5. Finish true Roku pairing-by-code and reset a lab screen to prove it from zero.
6. Validate admin Relaunch button physically in-browser on same LAN; if browser security blocks it, replace the architecture rather than masking the failure.
7. Determine real Roku 4K capability and serve the 4K master when supported.
8. Fix Roku network-task retention and execute burn-in/reboot/Wi-Fi recovery tests.
9. Add Roku tile/icon and launch-quality pairing visuals.
10. Lock the first certified TV model family only after commercial warranty/duty-cycle review.
11. Link first real screen to a real location and preserve the clean commercial metric baseline.
12. Continue customer portal/report polish, billing/contracts, and then Stripe only when the actual sales workflow is stable.

## 19. Definition of "verified"

CoastLoop should be strict about this word.

- **Verified deployment**: live Worker/API/assets checked after deploy.
- **Verified online**: recent player heartbeat.
- **Verified play**: player confirms delivered playback and backend records proof.
- **Verified physical behavior**: Seneca or an instrumented physical test actually observed it.

Do not convert "code exists" into "hardware works" or "request sent" into "TV relaunched."

## 20. First instruction for a new chat

Read this file first, then inspect the live repo/current state before making architectural changes. Continue as CEO rather than re-litigating already-settled decisions. Preserve the local-only creative rule, the GENNY trigger contract, the test-screen commercial-metric isolation, and the distinction between internal CoastLoop users, Hosts, and Advertisers.
