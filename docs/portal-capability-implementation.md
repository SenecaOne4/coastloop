# CoastLoop Unified Portal Capability Plan

## Goal
One authenticated CoastLoop portal. A business may have Host, Advertiser, both, or neither. Capability activation is driven by completed/approved commercial agreements, not separate portals or account types.

## Infrastructure hygiene
- [x] Public homepage polling reduced from 15s to 5m
- [x] Admin polling reduced from 30s to 2m
- [x] Hidden-tab polling paused
- [x] Player heartbeat/refresh left unchanged

## Guardrails
- [x] One login/auth system
- [x] One `/portal`
- [x] Existing `businesses` identity remains authoritative
- [x] Existing Host/Advertiser concepts remain
- [x] Global platform TOS stays separate from capability agreements
- [x] Creative-worker lane remains untouched
- [x] Host activation tied to executed/approved venue agreement
- [x] Advertiser activation tied to accepted/approved advertising order
- [x] Portal API returns normalized capability state
- [x] Portal renders all four states correctly
- [x] Admin exposes capability status cleanly
- [x] Four-state E2E matrix passes

## Four-state matrix
- [x] Neither -> Host + Advertiser activation cards
- [x] Host only -> Host module + Advertiser activation card
- [x] Advertiser only -> Advertiser module + Host activation card
- [x] Host + Advertiser -> both modules, no special combined account

## Backend
- [x] Audit `businesses` Host/Advertiser flags
- [x] Audit Host agreement execution state
- [x] Audit advertiser order/acceptance state
- [x] Audit current activation mutation points
- [x] Define normalized states: inactive | pending | active | suspended
- [x] Add capability derivation helper
- [x] Make activation idempotent
- [x] Update `/api/portal/overview`
- [x] Preserve RLS and org isolation

## Portal
- [x] One business dashboard shell
- [x] Host active module
- [x] Advertiser active module
- [x] Host activation card
- [x] Advertiser activation card
- [x] Pending treatment
- [x] Both-active composition
- [x] Neither-active onboarding state
- [x] Login always lands on `/portal`

## Admin
- [x] Host capability badge
- [x] Advertiser capability badge
- [x] Pending visibility
- [x] Contract/order source visible
- [x] No casual unaudited capability toggles

## Tests
- [x] Neither
- [x] Host only
- [x] Advertiser only
- [x] Both
- [x] Advertiser -> Host agreement -> both
- [x] Host -> advertiser order -> both
- [x] Global TOS does not deactivate capabilities
- [x] Retry activation is idempotent

## STOP LINE
Stop when `/portal` correctly renders all four capability combinations from authoritative agreement/order state, Host and Advertiser activate independently through their commercial completion flows, pending states work, and the four-state E2E matrix passes.

Do not continue into creative-worker internals, Host compensation redesign, campaign delivery redesign, Roku/player redesign, billing architecture redesign, CRM redesign, camera metrics, or broad admin visual polish.
