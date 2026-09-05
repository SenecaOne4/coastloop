# CoastLoop V0.1.0

A tiny Cloudflare-native digital-signage control plane and player.

## V0 scope

- Display self-registers and shows a pairing code.
- Admin names/locates display and assigns a playlist.
- Upload image/video media to R2.
- Build ordered playlists.
- Player polls for playlist changes, caches media locally, and continues playback if the network drops.
- Heartbeat shows screen online/offline state.
- Player records basic proof-of-play events.

## Architecture

- Cloudflare Worker: API
- Cloudflare D1: screen/media/playlist metadata + proof-of-play
- Cloudflare R2: image/video objects
- Workers Static Assets: admin/player web UIs
- Player: Chromium-compatible browser in kiosk mode on a small Linux/Android device

Your Mac is a development/creative machine, not a production dependency.

## First local boot

1. Install dependencies:

   npm install

2. Create `.dev.vars`:

   cp .dev.vars.example .dev.vars

3. Create your Cloudflare resources:

   npx wrangler login
   npx wrangler d1 create coastloop-db
   npx wrangler r2 bucket create coastloop-media

4. Copy the D1 database UUID returned by Wrangler into `wrangler.jsonc` in place of the temporary all-zero UUID (`00000000-0000-0000-0000-000000000000`).

5. Apply the migration locally:

   npm run db:local

6. Start it:

   npm run dev

Open the local URL printed by Wrangler. Use `/admin.html` for admin and `/player.html` for the screen.

## Deploy

Apply the remote migration:

   npm run db:remote

Set a production admin secret:

   npx wrangler secret put ADMIN_TOKEN

Deploy:

   npm run deploy

After deploy, connect a custom domain in Cloudflare when the final brand/domain is selected.

## V0.2 next

- Campaign start/end scheduling
- Zones and multi-screen assignments
- Creative/ad/customer records
- Aggregated proof-of-play reporting instead of raw events
- Player remote screenshot and watchdog
- House-content slots (weather/local events/host promos)
- Local generator bridge: creative request -> local generation -> approval -> R2 -> playlist
