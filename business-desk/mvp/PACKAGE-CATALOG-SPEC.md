# Package Catalog Spec — decided pricing, ready to apply on GO (LEDGER, Nov 21, 2026)
**Status: SPEC ONLY — no live data changed. Applies the Nov 20 decision (velvet first year $1,000; standard $2,999) to the `advertising_packages` catalog the moment management gives the deploy go. Written against the LIVE schema and rows, read Nov 21 (SELECT-only).**

## Live state this spec starts from (verified Nov 21, 2026)
| package_key | version | price | term | coverage | status |
|---|---|---|---|---|---|
| coastloop-annual | v1 | $1,000 | 365d | network | **active** (superseded twin — see step 0) |
| coastloop-annual | v2 | $1,000 | 365d | zones | active (current public offer) |
| coastloop-monthly | v1 | $95 | 30d | network | active (legacy) |
| coastloop-monthly | v2 | $100 | 30d | network | active (legacy) |
| coastloop-monthly | v3 | $100 | 30d | zones | active (current public offer) |
| founding-network / founding-single / local-three | v1 | $499/$149/$299 | 30d | — | retired, sold_out (do not resurrect) |

All live rows: `loop_share`, `screen_count`, `projected_plays` NULL. Metadata pattern: `{"billing": "...", "reporting": "verified delivery", "creative_included": true}`.

## The changes (in order)

**Step 0 — clean the twin.** Retire `coastloop-annual` v1 (id `fa4b8eca-be60-4f8d-8e48-294861bd1eed`, status → retired, retired_at set). Two active versions of one key is how a stranger gets quoted the wrong twin. (Monthly v1/v2 twins are the same defect class — flagged, NOT touched by this spec; monthly is HELD.)

**Step 1 — velvet first-year package.** INSERT new version of existing key:
- `package_key`: `coastloop-annual`, `version`: **3**
- `name`: `CoastLoop Advertising - Annual (First Year)`
- `price_cents`: **100000**, `term_days`: 365, `ad_length_seconds`: 15
- `market`: `Grand Strand`, `coverage_mode`: `zones`, `status`: draft → active at step 3
- `metadata`: `{"billing": "annual", "reporting": "verified delivery", "creative_included": true, "velvet_first_year": true, "renewal_package_key": "coastloop-standard", "renewal_price_cents": 299900}`
- `loop_share` / `screen_count` / `projected_plays`: **NULL — deliberately.** No delivery quantity is promised anywhere in the decided offer; populating projections would break the price block's honesty rules.
- Zone links: copy `advertising_package_zones` rows from annual v2 (id `5d6a75df-767c-4f52-8b5b-40527680fc24`) to the new package id, `delivery_weight` unchanged.

**Step 2 — standard package.** INSERT new key:
- `package_key`: `coastloop-standard`, `version`: **1**
- `name`: `CoastLoop Advertising - Annual (Standard)`
- `price_cents`: **299900**, `term_days`: 365, `ad_length_seconds`: 15
- `market`: `Grand Strand`, `coverage_mode`: `zones`
- `metadata`: `{"billing": "annual", "reporting": "verified delivery", "creative_included": true, "standard_rate": true}`
- Delivery fields NULL, same rule as step 1. Zone links copied from annual v2 as above.
- Availability: `available` (it is the standing rate; the velvet package is the entry offer).

**Step 3 — flip.** Retire annual v2 (status → retired, retired_at set); set annual v3 status → active. Public API must then serve exactly: annual v3 ($1,000, first-year) + standard v1 ($2,999) + monthly v3 ($100, held).

**Step 4 — verify (read-back, not assumption).** `GET /api/public/packages` + a SELECT of the three live rows; confirm prices, terms, NULL delivery fields, and that no retired founding key reappears. Report the read-back, not the intent.

## What this spec does NOT do (named, not hidden)
- **Monthly: untouched** — HELD at live $100/mo per the flag; the restructure was not adopted.
- **Renewal enforcement:** the step-up truth lives in the velvet package's metadata (`renewal_package_key` → coastloop-standard). Whether subscription code *acts* on that pointer at term end is a backend behaviour this spec does not assume — verifying/implementing it is a named follow-up for the seat that owns the Worker, before the first velvet term ever ends (365 days of runway, zero urgency, zero excuse).
- **No flagship, no add-on packages** — flagship is do-not-quote pending the Overlord batch; the add-on is proposed-not-decided. Neither enters the catalog.
- **Host pay:** no catalog surface — host terms live in the venue track, unchanged.
