# Business Desk — MVP-presentable checklist (Nov 20, 2026, Overlord override)

## Phase 2 — Broker Desk
- [x] Broker kit (this folder, broker-kit/): offer, economics, Desk journey, never-visible list, talk track, FAQ — MVP-PRESENTABLE (draft-watermarked pending pricing decision)
- [x] Broker one-pager HTML (house style) — PRESENTABLE
- [x] Backend verified live (Nov 11 §16–§18): invite+14d expiry, Resend delivered, payouts view, owed math, campaign self-activation, guarded transitions, notifications — NO BUILD NEEDED for MVP
- [ ] Desk polish backlog (post-MVP): Promotions-tab warning inside the invite flow copy ("check Promotions, add us to contacts") — small copy change in existing invite email; broker-facing payout cadence statement once Seneca approves a cadence (recommend: payouts created on collection, paid weekly Fridays — DECISION for management, not set here)
- [ ] First real broker invite — BLOCKED on Seneca's yes (no outreach under override)

## Phase 3 — Admin
- [x] Admin MVP prototype (admin-prototype/admin-mvp.html): screens+status, pair form, ledger view, token panel — PRESENTABLE, real house-TCL data
- [x] Wiring map (ADMIN-MVP.md): 4 slices, existing backend per slice, blockers named
- [ ] Slice builds in order: 1 screens roll-up (read-only, no blocker) → 3 ledger web view (script exists) → 4 token rotation (unlock) → 2 pair/retire live actions (needs slice 4)
- [ ] Retire 2 stray test screen rows — first live use of slice 2, after token fix; until then it remains a D1 action, NOT done by this desk unilaterally
- [ ] Polish backlog: 21-section de-duplication, Users & access move, dead links

## Venue materials
- [x] Venue kit (venue-kit/VENUE-KIT.md): host offer, install, pay-on-verified-hours, FAQ — PRESENTABLE (draft-watermarked)
- [x] Host one-pager HTML — PRESENTABLE
- [x] Venue install checklist already exists and is proven (~/workspace/coastloop-d1/venue-install-checklist.md, house TCL complete Nov 20 07:02)

## Still standing (override confirms)
- Pricing Structure A + flagship: Seneca's decision, already asked — NOT re-asked, NOT set live
- Payment rail: Seneca's decision — untouched
- No outreach to brokers/venues without his yes

## GitHub status (Nov 20, 12:41 override)
- Repo exists: https://github.com/SenecaOne4/coastloop (head still Oct 20 commit 2a2a18e — stale, as the Nov 13 audit said)
- Desk-owned files (8 files, 56KB: pricing paper + this MVP set) — push ATTEMPTED via GitHub connector: attempt 1 interrupted by a service restart (verified NOT landed), attempt 2 **timed out waiting on the approval card — NOT pushed. Needs an approval to retry.**
- Full `coastloop-d1` backend codebase (99MB, 176 files) does NOT fit the connector snapshot path (16MB / UTF-8-only limits; contains .zip/.gz binaries) and contains **5 secret/token files** (.cl_admin_token, .cl_creative_worker_token, .cl_genny_client_secret, shim JWT secrets) that must never be pushed. `gh` CLI is not logged in on this VM. Path forward: secrets sweep + .gitignore, then a git push from an authenticated environment (Mac repo or gh auth) — flagged to management as a guidance/infra gap, not silently stalled.

## ETAs (from Nov 20, desk working time)
- Broker kit + venue kit: DONE today
- Admin prototype: DONE today
- Admin slices 1+3 (read-only builds): 1 working session once management confirms the wiring map
- Token rotation + pair/retire live: 1 session after that, deploy-gated on management's go
- Broker Desk: live today; polish items 1 short session
