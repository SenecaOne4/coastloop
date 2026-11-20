#!/usr/bin/env python3
"""CoastLoop Admin Slices 1+3 generator (Business Desk, Nov 20, 2026).

Slice 1: Screens roll-up. Slice 3: Verified-hours ledger view.
READ-ONLY: issues SELECTs against the live D1 database via the existing
d1_query.py helper (same pattern as playback_ledger.py). Writes only
local HTML/JSON view files. Nothing live is changed.

Usage: python3 build_admin_views.py [output_dir]
Outputs: screens-rollup.html, ledger-view.html, admin-data.json
"""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
D1_DIR = Path.home() / "workspace" / "coastloop-d1"
DB = "1f428722-4b66-4d52-998d-11d2ee29975a"
HOUSE_SCREEN = "e14784ee-6b2d-40ba-a670-e462d171c877"  # Home first roku — dev


def q(sql):
    out = subprocess.run(
        ["python3", "d1_query.py", DB, sql],
        capture_output=True, text=True, cwd=str(D1_DIR),
    )
    d = json.loads(out.stdout)
    return d["result"][0]["results"]


def parse_ts(s):
    if not s:
        return None
    s = s.strip()
    s = s.replace(" ", "T", 1) if "T" not in s else s
    s = s.replace("+00", "+00:00").replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s).astimezone(timezone.utc)
    except ValueError:
        return None


def age_label(ts, now):
    if ts is None:
        return "never", "bad"
    mins = (now - ts).total_seconds() / 60
    if mins < 2:
        return "playing now", "ok"
    if mins < 60:
        return f"{int(mins)}m ago", "ok"
    if mins < 60 * 24:
        return f"{mins/60:.1f}h ago", "warn"
    return f"{mins/1440:.0f}d ago", "bad"


CSS = """
*{box-sizing:border-box}body{margin:0;background:#0b0b0e;color:#ece7da;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:14px 22px;border-bottom:1px solid #26262e;background:#101014;display:flex;justify-content:space-between}
.logo{font-weight:700;letter-spacing:.18em;color:#c9a227}.pill{font-size:12px;border:1px solid #c9a227;color:#c9a227;border-radius:99px;padding:3px 10px}
main{max-width:1080px;margin:0 auto;padding:22px}h2{font-size:16px;letter-spacing:.12em;text-transform:uppercase;color:#c9a227;margin:26px 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.card{background:#141419;border:1px solid #26262e;border-radius:10px;padding:16px}
.num{font-size:28px;font-weight:700}.lbl{font-size:12px;color:#9b9587;letter-spacing:.08em;text-transform:uppercase}
table{width:100%;border-collapse:collapse;background:#141419;border:1px solid #26262e}
td,th{padding:9px 11px;border-bottom:1px solid #22222a;text-align:left;font-size:14px}
th{color:#9b9587;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
.ok{color:#57d38c}.warn{color:#e8b93e}.bad{color:#e86a5e}.muted{color:#9b9587}.note{font-size:13px;color:#9b9587;line-height:1.5}
"""


def main():
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE
    now = datetime.now(timezone.utc)
    screens = q("SELECT id,name,status,is_test,deployment_class,app_version,"
                "device_model,last_seen_at,paired_at FROM screens "
                "ORDER BY is_test, last_seen_at DESC")
    totals = {r["screen_id"]: r for r in q(
        "SELECT screen_id, SUM(play_count) AS plays, "
        "ROUND(SUM(seconds_played)/3600.0,2) AS hours, MAX(last_played_at) AS last_play "
        "FROM playback_daily GROUP BY screen_id")}
    assigns = {r["screen_id"]: r["playlist"] for r in q(
        "SELECT a.screen_id, p.name AS playlist FROM screen_playlist_assignments a "
        "LEFT JOIN playlists p ON p.id=a.playlist_id")}
    receipts = q("SELECT COUNT(*) AS n FROM playback_proof_receipts")[0]["n"]

    for s in screens:
        t = totals.get(s["id"], {})
        s["plays"] = t.get("plays") or 0
        s["hours"] = t.get("hours") or 0
        s["playlist"] = assigns.get(s["id"], "—")
        s["seen_label"], s["seen_class"] = age_label(parse_ts(s["last_seen_at"]), now)

    active = [s for s in screens if s["status"] == "active"]
    unpaired = [s for s in screens if s["status"] == "unpaired"]
    playing = [s for s in screens if s["seen_label"] == "playing now"]
    total_hours = round(sum(s["hours"] for s in screens), 2)
    total_plays = sum(s["plays"] for s in screens)

    data = {"generated_at": now.isoformat(), "receipts_total": receipts,
            "totals": {"hours": total_hours, "plays": total_plays},
            "screens": screens}
    (out_dir / "admin-data.json").write_text(json.dumps(data, indent=1))

    def row(s):
        test = ' <span class="warn">[test]</span>' if s["is_test"] else ""
        return (f"<tr><td><b>{s['name'] or '—'}</b>{test}<br>"
                f"<span class='muted'>{s['app_version'] or ''} · {s['device_model'] or ''} · "
                f"{s['deployment_class']}</span></td>"
                f"<td>{s['status']}</td><td>{s['playlist']}</td>"
                f"<td class='{s['seen_class']}'>{s['seen_label']}</td>"
                f"<td>{s['hours']} h / {s['plays']} plays</td></tr>")

    screens_html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>CoastLoop Admin — Screens Roll-up (Slice 1)</title><style>{CSS}</style></head><body>
<header><div class="logo">COASTLOOP ADMIN — SCREENS</div><span class="pill">SLICE 1 · READ-ONLY · LIVE DATA</span></header>
<main><p class="note">Generated {now.strftime('%Y-%m-%d %H:%M UTC')} by build_admin_views.py from live D1 (SELECT only). Test/legacy rows are labelled, never hidden and never mixed silently with paired screens.</p>
<div class="grid">
<div class="card"><div class="num">{len(playing)}</div><div class="lbl">Playing now</div></div>
<div class="card"><div class="num">{len(active)}</div><div class="lbl">Paired / active</div></div>
<div class="card"><div class="num">{len(unpaired)}</div><div class="lbl">Unpaired rows</div></div>
<div class="card"><div class="num">{len(screens)}</div><div class="lbl">Total screen rows</div></div>
</div>
<h2>All screens</h2>
<table><tr><th>Screen</th><th>Status</th><th>Playlist</th><th>Last seen</th><th>Verified playback</th></tr>
{''.join(row(s) for s in screens)}
</table>
<p class="note">Retire actions (Slice 2) stay gated on token rotation (Slice 4, go routed through the Overlord). Unpaired rows last seen Nov 17 / Nov 20 are the boot-test rows from the pairing era — they retire with Slice 2, history kept.</p>
</main></body></html>"""
    (out_dir / "screens-rollup.html").write_text(screens_html)

    house = next((s for s in screens if s["id"] == HOUSE_SCREEN), None)
    ledger_rows = "".join(
        f"<tr><td><b>{s['name'] or s['id'][:8]}</b></td><td>{s['hours']} h</td>"
        f"<td>{s['plays']}</td><td>{s['last_play'] if False else (totals.get(s['id'], {}).get('last_play') or '—')}</td></tr>"
        for s in sorted(screens, key=lambda x: -x["hours"]))
    ledger_html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>CoastLoop Admin — Verified-Hours Ledger (Slice 3)</title><style>{CSS}</style></head><body>
<header><div class="logo">COASTLOOP ADMIN — VERIFIED-HOURS LEDGER</div><span class="pill">SLICE 3 · READ-ONLY · LIVE DATA</span></header>
<main><p class="note">Generated {now.strftime('%Y-%m-%d %H:%M UTC')}. Verified hours = SUM(seconds_played) from playback_daily, the billing-grade number (playback_ledger.py method). Proof receipts on file: <b>{receipts}</b>. This ledger is the host-pay basis (&ge;8 verified hrs/day) and the flagship/add-on reporting product.</p>
<div class="grid">
<div class="card"><div class="num">{total_hours} h</div><div class="lbl">Verified hours, all screens, all time</div></div>
<div class="card"><div class="num">{total_plays}</div><div class="lbl">Verified plays, all time</div></div>
<div class="card"><div class="num">{house['hours'] if house else '—'} h</div><div class="lbl">House TCL (dev) — all time</div></div>
</div>
<h2>Per-screen ledger</h2>
<table><tr><th>Screen</th><th>Verified hours</th><th>Plays</th><th>Last play</th></tr>
{ledger_rows}
</table>
<p class="note">Run/gap analysis (continuous runs, sleep alarms at &gt;15 min gaps) is produced by playback_ledger.py per screen; the house screen's current run and alarm history render in the production view from the same receipt stream.</p>
</main></body></html>"""
    (out_dir / "ledger-view.html").write_text(ledger_html)
    print(f"screens={len(screens)} active={len(active)} unpaired={len(unpaired)} "
          f"playing_now={len(playing)} hours={total_hours} plays={total_plays} receipts={receipts}")


if __name__ == "__main__":
    main()
