#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="$HOME/Downloads/coastloop-creatives"

echo 'CAMPAIGN_STAGE=ADVERTISER'
node scripts/local-creative.mjs \
  --brand "COASTLOOP" \
  --skip-llm true \
  --out "$OUT" \
  --headline "BE SEEN LOCALLY." \
  --subhead "Premium ads on screens inside the businesses your customers already visit." \
  --cta "ADVERTISE LOCALLY" \
  --image-prompt "Cinematic premium coastal restaurant district at blue hour, sophisticated modern hospitality interior visible through glass, tasteful wall-mounted television integrated naturally into the venue, warm architectural lighting, affluent local atmosphere, deep charcoal shadows, muted gold highlights, wine-red accents, strong right-side visual focus, generous clean dark negative space on left for typography, realistic commercial photography, no readable text, no logos, no signs, no interface"

echo 'CAMPAIGN_STAGE=HOST'
node scripts/local-creative.mjs \
  --brand "COASTLOOP" \
  --skip-llm true \
  --out "$OUT" \
  --headline "YOUR SCREEN CAN EARN." \
  --subhead "Host CoastLoop, support local businesses, and earn annual screen compensation." \
  --cta "HOST A SCREEN" \
  --image-prompt "Luxury coastal cafe interior with a beautifully mounted large television as a natural focal point, welcoming upscale local business environment, customers softly blurred in background, premium hospitality photography, warm cream and muted gold lighting, deep charcoal architectural details, subtle wine-red accents, screen positioned on right half, generous clean dark negative space on left for typography, realistic, cinematic, no readable text, no logos, no signs, no interface"

echo 'CAMPAIGN_STAGE=PROOF'
node scripts/local-creative.mjs \
  --brand "COASTLOOP" \
  --skip-llm true \
  --out "$OUT" \
  --headline "KNOW WHERE IT RAN." \
  --subhead "Track verified plays, screen health, locations, pacing, and delivery." \
  --cta "SEE THE PROOF" \
  --image-prompt "Premium cinematic close-up of a modern television advertising screen inside an elegant local business, subtle abstract data-light reflections and network signal motifs in the environment without any readable UI, sophisticated technology-meets-hospitality mood, dark charcoal palette, muted gold highlights, wine-red accents, crisp realistic commercial photography, screen and visual energy concentrated on right side, generous clean dark negative space on left for typography, no readable text, no logos, no signs"

echo 'HOUSE_CAMPAIGN=COMPLETE'
