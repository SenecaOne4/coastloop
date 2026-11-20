# Admin MVP — wiring map (Nov 20, 2026)
Prototype: `admin-mvp.html` (this folder). It prototypes ONLY the operational slice — the existing admin (8 workspaces / 21 sections, Nov 10 audit) stays; this is the focused operations surface to build inside it, in this order:

| Slice | Backend that already exists | What must be built | Blocker |
|---|---|---|---|
| 1. Screens list + status | `screens` table, player check-in (~30s), `screen_playlist_assignments` | Status roll-up view (paired/stale/test separated), last-seen age, build version, sleep-proof flag per screen (from venue checklist) | None — read-only build |
| 2. Pair / retire | Pair codes already issue server-side (proven Nov 19: code YBPFYV, expiry set); retire = status change, keep history | One-action pair form (code → active + playlist attach); retire button with confirm; **retire the 2 known stray test rows** as the first live use | Pair endpoint needs a VALID admin credential — blocked on token rotation (slice 4) or owner JWT session |
| 3. Verified-hours ledger view | `playback_ledger.py` EXISTS and is proven (house TCL: 1.81h era / 4.69h all-time, receipts cross-match) | Read-only web view of the ledger per screen + per campaign; export for host-pay and advertiser reporting | None — the script is the spec |
| 4. Token management | Legacy ADMIN_TOKEN auth on admin routes; broker routes correctly reject it | Rotation flow: generate/store/invalidate/confirm + status display (age, last-used, never the value). **This is the unlock for slice 2 going live without D1 surgery.** | Needs Seneca-present? No — but it changes live admin access, so it waits for management's go under the override (build-ready, deploy-gated) |

**Deliberately out of MVP:** de-duplicating the 21 sections, moving Users & access, dead-link cleanup — polish backlog, listed in the Phase 3 checklist, not blockers to presentable.
