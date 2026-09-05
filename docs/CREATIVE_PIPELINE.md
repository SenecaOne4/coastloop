# CoastLoop Creative Pipeline

## Non-negotiable production rule

CoastLoop production creative is rendered LOCALLY on Seneca's Mac.

Do not use cloud image generation for CoastLoop production assets unless Seneca explicitly requests it.

Cloud/image-chat generation may be used only for loose ideation or reference concepts. It is never the default production path.

## Local toolchain

Image source generation:
- CLI: ~/.local/bin/localgen
- App: ~/local_generator
- Render root: ~/Downloads/local_generator/renders
- Current local model stack includes Z-Image-Turbo MLX

Deterministic layout / typography:
- HTML/CSS rendered through local Google Chrome headless
- Do not ask an image model to render final typography, logos, URLs, or precise copy

Video / finishing:
- ffmpeg
- H.264 yuv420p for broad display compatibility
- preserve high-resolution local masters

## Quality standard

CoastLoop creative is a competitive advantage.

Do not optimize for the fastest acceptable render.
Optimize for:
- exceptional sharpness
- luxury commercial art direction
- clean typography
- controlled lighting
- premium materials and microdetail
- deliberate motion
- strong readability across a room
- no visible AI artifacts
- no grainy prototype assets
- no generic enlarged-business-card aesthetic

Long local renders are acceptable when quality materially improves.

## Resolution policy

Create and preserve:
1. 4K master: 3840x2160 where practical
2. 1080p delivery derivative: 1920x1080
3. poster/storyboard/review frames as needed

CoastLoop player supports adaptive delivery:
- 4K-capable screens receive the 4K house master
- other screens receive the optimized 1080p derivative

## House inventory policy

CoastLoop's own ad is permanent network inventory.

It is NOT filler and is not removable by advertisers.

House creative should be the most visually impressive content on the network because it demonstrates what CoastLoop can build for advertisers.

If a screen has:
- no assigned playlist
- an empty playlist
- expired/suspended inventory
- another configuration gap

the CoastLoop House Loop becomes the fallback.

A CoastLoop house slot is also reserved inside normal advertiser playlists.

## Current brand direction

Premium, restrained, cinematic local media.

Core thought:
"Local ads don't need to look local."

Current flagship slogan:
"Your business.
On screens that
    get seen."

The line break is intentional. Preserve the breathing/read:
- Your business.
- On screens that
- indented: get seen.

Typography should be slightly lighter than heavy bold with enough tracking to breathe.

Avoid redundant CoastLoop/URL treatments within the same frame.

## Approval workflow

1. Generate source imagery locally.
2. Build deterministic 4K boards locally.
3. Create storyboard/review image.
4. Seneca/Jenny visually review when appropriate.
5. Render 4K motion master locally.
6. Produce delivery derivative.
7. Verify codec/resolution/duration.
8. Upload to CoastLoop.
9. Verify edge asset.
10. Verify actual player-config delivery path.
11. Replace production content only after validation.

Never silently substitute cloud-generated production artwork for this pipeline.
