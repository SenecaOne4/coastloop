# CoastLoop Local Creative Worker

Local-only bridge between CoastLoop's durable creative_jobs queue and the Mac localgen renderer.

Rules:
- CoastLoop API owns queue/state/review.
- localgen owns rendering only.
- No direct Supabase credentials.
- Machine credential stays local.
- Mac may be offline indefinitely.
- Never overwrite prior creative revisions.
