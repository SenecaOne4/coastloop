# Business Desk (LEDGER) — MVP-presentable checklist (Nov 20, 2026, Overlord override)

## Standing procedure (wired in, binding on this desk)
- **FLOODY IS THE CONSULT (Seneca's order, Nov 21, 2026):** when something this desk is doing does not work, consult the Floody chat (`83cfaa17-9dd2-4441-88d2-d83e1c70fefb`) BEFORE burning more time on it. Failing repeatedly without consulting is itself the execution failure. Applies to delivery-proof work first: if a finished piece's properties don't read as CLASS 1 says they should, the question + evidence goes to the Admiral early — no theory-iterating at the desk. Applies equally to desk tooling/build failures.
- **Timing law (Overlord, Nov 21):** deadlines at bot speed — deliver in minutes or name the blocker in minutes.
- **Working-tool rule (Seneca, Nov 21):** when a working tool already exists on the machine, use it; extend what works before proving what might.
- **Watch doctrine (Nov 21):** LEDGER is the named watch for hero segment 3 + finish/delivery; delivery proof = segments joined via finish script + Real-ESRGAN x4plus upscale path + 3840×2160 finish + real file/size/frames move (CLASS 1 facts).

## Phase 2 — Broker Desk
- [x] Broker kit (this folder, broker-kit/): offer, economics, Desk journey, never-visible list, talk track, FAQ — MVP-PRESENTABLE (draft-watermarked pending pricing decision)
- [x] Broker one-pager HTML (house style) — PRESENTABLE
- [x] Backend verified live (Nov 11 §16–§18): invite+14d expiry, Resend delivered, payouts view, owed math, campaign self-activation, guarded transitions, notifications — NO BUILD NEEDED for MVP
- [ ] Desk polish backlog (post-MVP): Promotions-tab warning inside the invite flow copy ("check Promotions, add us to contacts") — small copy change in existing invite email; broker-facing payout cadence statement once Seneca approves a cadence (recommend: payouts created on collection, paid weekly Fridays — DECISION for management, not set here)
- [ ] First real broker invite — BLOCKED on Seneca's yes (no outreach under override)

## Phase 3 — Admin
- [x] Admin MVP prototype (admin-prototype/admin-mvp.html): screens+status, pair form, ledger view, token panel — PRESENTABLE, real house-TCL data
- [x] Wiring map (ADMIN-MVP.md): 4 slices, existing backend per slice, blockers named
- [x] **Slices 1+3 BUILT Nov 20 (management confirmed the wiring map):** `admin-slices/build_admin_views.py` — a read-only generator (SELECT-only via d1_query.py, same pattern as playback_ledger.py) emitting `screens-rollup.html`, `ledger-view.html`, `admin-data.json` from LIVE D1. First run Nov 20 13:24 EST: 10 screen rows (7 active, 3 unpaired, 1 playing now), 69.89 verified hours / 14,002 plays all-time across screens, 9,056 proof receipts; house TCL (dev) 11.04h all-time, 8.16h today, in a 6h21m unbroken run at generation time. Nothing live changed — views only.
- [ ] Slice builds remaining: 4 token rotation (unlock; go via Overlord) → 2 pair/retire live actions (needs slice 4)
- [ ] Retire 2 stray test screen rows — first live use of slice 2, after token fix; until then it remains a D1 action, NOT done by this desk unilaterally
- [ ] Polish backlog: 21-section de-duplication, Users & access move, dead links

## Venue materials
- [x] Venue kit (venue-kit/VENUE-KIT.md): host offer, install, pay-on-verified-hours, FAQ — PRESENTABLE (draft-watermarked)
- [x] Host one-pager HTML — PRESENTABLE
- [x] Venue install checklist already exists and is proven (~/workspace/coastloop-d1/venue-install-checklist.md, house TCL complete Nov 20 07:02)

## Pricing decision — LANDED Nov 20, 19:33 EST (Seneca via Overlord)
- [x] Structure A APPROVED with velvet-carpet terms: **first year $1,000/yr for new clients; standard $2,999/yr** ($1,500 tier superseded; renewal lock superseded)
- [x] Kits UN-WATERMARKED; decided terms set in Broker Kit + Venue Kit + both one-pagers
- [x] Public price block produced (PUBLIC-PRICE-BLOCK.md) — $1,000 always labelled first-year, $2,999 always on the same surface; NOT yet live on the site (deploy on management's go)
- [x] Paper reconciled (DECISION section at top of the pricing paper) with 5 one-line flags: monthly HELD at live $100/mo; flagship composition collision (re-base before quoting); add-on HELD; host pay HELD; velvet-carpet bound unstated
- [x] Flagship re-base OPTIONS prepared (Nov 20, Overlord tasking — options only, no pick): 4 compositions above the $2,999 standard ($4,499 Full Stack / $4,199 Core / $5,799 Max / à-la-carte), margins at the paper's cost model incl. worst case, plus the velvet-inside-the-bundle sub-question — in the paper's FLAGSHIP RE-BASE section, batching into the Overlord's decision list
- [x] Interim legal line applied everywhere under this desk — CORRECTED Nov 20, 19:36 (Lux umbrella reversed): "CoastLoop Media is a trade name of myprelistingreport.com LLC." (both kits, both one-pagers, admin prototype, price block both versions; the Lux line applied at 19:37 was superseded and fully replaced)

## Still standing (override confirms)
- Payment rail: Seneca's decision — untouched (Cash App remains the rail; Stripe merchant name unchanged)
- No outreach to brokers/venues without his yes; nothing live moves

## GitHub status (Nov 20, 12:41 override)
- Repo exists: https://github.com/SenecaOne4/coastloop (head still Oct 20 commit 2a2a18e — stale, as the Nov 13 audit said)
- Desk-owned files (8 files, 56KB: pricing paper + this MVP set) — **PUSHED Nov 20, 13:22 EST on the re-fire (Overlord ruling): commit `63e02cb313d0241533ca0ec5f963e8038739bde6` on main, verified by commit list + file read-back.** History: attempt 1 interrupted by a service restart (verified NOT landed), attempt 2 timed out on the approval card, re-fire approved on sight per Seneca's standing repo-card instruction; the CLI client timed out at 280s but the commit landed server-side — verified, not assumed. Note: the copy of this checklist inside that commit still carries the pre-push status text; this local copy is the current one.
- Full `coastloop-d1` backend codebase (99MB, 176 files) does NOT fit the connector snapshot path (16MB / UTF-8-only limits; contains .zip/.gz binaries) and contains **5 secret/token files** (.cl_admin_token, .cl_creative_worker_token, .cl_genny_client_secret, shim JWT secrets) that must never be pushed. `gh` CLI is not logged in on this VM. Path forward: secrets sweep + .gitignore, then a git push from an authenticated environment (Mac repo or gh auth) — flagged to management as a guidance/infra gap, not silently stalled.

## ETAs (from Nov 20, desk working time)
- Broker kit + venue kit: DONE today
- Admin prototype: DONE today
- Admin slices 1+3 (read-only builds): 1 working session once management confirms the wiring map
- Token rotation + pair/retire live: 1 session after that, deploy-gated on management's go
- Broker Desk: live today; polish items 1 short session
