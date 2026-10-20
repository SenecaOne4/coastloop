# CoastLoop UI / Conversion Redesign Plan

## North Star

CoastLoop must create the shortest credible path from interest to paid advertising while looking controlled enough that a business trusts us with its public image.

The interface itself is evidence of the quality we sell.

Primary commercial path:

SEE IT -> UNDERSTAND IT -> PRICE -> PAY -> PROVIDE BRAND MATERIAL -> COASTLOOP CREATES -> REVIEW -> LIVE -> PROOF

Every extra step must justify its existence.

## Product principles

1. Minimal, not bare.
2. Premium through precision, not decoration.
3. One visual system across public site, advertiser, host, broker, and admin.
4. Client-facing complexity is progressive: simple list first, detail on demand.
5. Color communicates state, not decoration.
6. Typography, spacing, borders, forms, tables, media, and motion must be consistent.
7. No client-facing surface may look temporary, improvised, or operational.
8. Creative production machinery remains invisible to the advertiser.
9. Public pages sell distribution and outcome, not infrastructure.
10. Preserve proven backend architecture unless a real blocker appears.

## Phase 1 - Freeze and inventory

- Preserve creative worker, Supabase creative schema, media variants, player delivery, campaign attribution, and adaptive delivery.
- Inventory all public/client/admin surfaces.
- Identify duplicate styling and one-off components.
- Map every route involved in advertising purchase, onboarding, creative, approval, and proof.
- Identify current payment boundary and unnecessary pre-payment friction.

Exit condition:
A complete surface/route map and a clear list of files safe to redesign.

## Phase 2 - CoastLoop design system

Create one shared visual language inspired by Resend's restraint, not a literal copy.

Foundation:
- near-black / neutral surfaces
- restrained white/gray typography
- hairline borders
- compact controls
- small intentional radii
- strong spacing rhythm
- one primary action per view
- tables/lists over card grids
- status color only where meaningful
- premium media presentation
- stable responsive layout

Standardize:
- page shell
- navigation
- buttons
- inputs/selects/textareas
- table/list rows
- badges/status
- dialogs/drawers
- loading
- empty states
- error states
- media preview
- checkout summary
- onboarding step shell

Exit condition:
All new surfaces can be built from the same small component language.

## Phase 3 - Public conversion path

Rebuild the front-facing experience around payment.

Primary path:
Homepage -> Package -> Checkout

Homepage must answer quickly:
- What is CoastLoop?
- Where will my business appear?
- What will the ad quality look like?
- What does it cost?
- What do I need to provide?
- How fast can I get live?

Rules:
- no quote form before checkout for standard packages
- no unnecessary account creation before payment
- no long About/feature journey in the critical path
- no infrastructure jargon
- show real creative / screen context early
- transparent pricing
- repeated direct CTA

Core message direction:
Get your business on local screens.
We create the ad for you.

Exit condition:
A prospect can understand the offer and reach payment with minimal decisions.

## Phase 4 - Paid onboarding -> creative production

Immediately after payment:
- establish customer/account context
- collect business facts
- collect offer/CTA only from advertiser-provided truth
- collect website
- upload logo/photos/video/docs
- reuse Brand Library assets
- submit one clear creative request

Behind the interface:
source assets -> creative job -> local generation -> deterministic exact composition -> video/master if needed -> derivative -> review

Customer-facing production states:
- Preparing
- Creating
- Ready for review
- Revision requested
- Approved
- Live

Do not expose:
- prompts
- worker leases
- internal job IDs
- render implementation
- master/derivative mechanics
- storage details

Exit condition:
Payment flows naturally into creative intake with no system boundary visible to the customer.

## Phase 5 - Product dashboards

### Advertiser
Navigation should stay extremely small:
- Overview
- Start / Create Ad
- Your Ads
- Brand Library
- Billing
- Settings

Overview prioritizes:
- active ads
- review-needed ads
- plays / delivery proof
- one obvious action

### Host
Prioritize:
- screens
- online/offline state
- current content
- last heartbeat
- delivery
- payout where applicable

### Admin / internal
Prioritize operational lists:
- screens
- locations
- advertisers
- campaigns
- creative
- proof
- billing
- settings

Use tables/lists and drill-in details rather than dashboard-card sprawl.

Exit condition:
Every role feels like the same product with only the necessary capabilities exposed.

## Phase 6 - Presentation hardening

Verify:
- desktop
- tablet
- mobile
- loading states
- empty states
- error states
- long business names
- missing logos/images
- slow media
- keyboard/focus behavior
- contrast
- layout shift
- media aspect ratios
- upload progress
- render/review transitions
- payment return states

No visual wobble is acceptable on client-facing paths.

Exit condition:
The site looks intentional under normal and imperfect real-world data.

## Phase 7 - Controlled shipping

For every slice:
1. inspect working tree
2. change the smallest coherent surface
3. run syntax/build checks
4. smoke locally/live as appropriate
5. verify adjacent user paths
6. deploy with bounded output
7. continue only after the slice is stable

Never reset or revert the shared working tree.

## Priority order

1. Public shell + homepage
2. Package / pricing decision
3. Checkout handoff
4. Paid onboarding
5. Advertiser dashboard
6. Creative review / revision
7. Brand Library
8. Host dashboard
9. Admin dashboard
10. polish / QA across all surfaces

## Success metrics

Primary:
- clicks from landing to checkout
- checkout starts
- completed payments
- paid -> onboarding completion
- onboarding -> first creative submission
- creative -> approval time
- approval -> live time

Quality guardrails:
- no broken responsive layouts
- no inconsistent client-facing components
- no hidden payment dead ends
- no duplicate data entry
- no need for advertiser knowledge of CoastLoop internals
