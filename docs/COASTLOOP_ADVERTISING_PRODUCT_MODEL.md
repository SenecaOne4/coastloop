# CoastLoop Advertising Product Model

Status: Product / advertising north star  
Owner: Advertising / Media / Creative / UI-UX lane  
Coordination: Backend architecture remains owned by the main builder lane

## 1. Core hierarchy

CoastLoop scales geographically as:

Network -> Region / Market -> Zone -> Location -> Screen

A Zone is the smallest CoastLoop-defined hyperlocal territory customers can recognize and understand.

Zones should remain deliberately small. They do not need to follow city limits, ZIP codes, census boundaries, DoorDash zones, or another company's geography.

A Zone is geography. It is not necessarily the commercial package.

## 2. Commercial hierarchy

Zone = atomic geography

Package = one or more Zones or another explicitly defined coverage product

Campaign entitlement = the coverage purchased by the advertiser

Delivery = the eligible screen inventory against which the campaign may run

Account tier = customer relationship / capabilities

Media spend = money purchasing advertising delivery

Account tier and media spend must remain separate.

## 3. Coverage versus delivery

Coverage defines where a campaign is eligible to run.

Delivery is what CoastLoop actually serves and verifies.

Adding a screen to a covered Zone may make that screen eligible for an active campaign according to package and delivery rules.

Zone membership must not silently create an undocumented guaranteed play count.

All quantified customer-facing claims must trace to:
- a contractual entitlement,
- current eligible inventory, or
- verified delivery data.

## 4. Screen inventory

Screens create finite advertising capacity.

Locations contain screens.

Zones aggregate locations.

Packages aggregate geographic coverage.

Campaigns consume finite eligible inventory.

The long-term inventory model must preserve the ability to allocate different delivery weights or shares among competing campaigns without requiring an architectural rewrite.

Future progression:

Base entitlement -> additional delivery -> premium share / position -> competitive pricing -> bidding

Auctions are not a launch requirement.

## 5. Business categories

Advertisers require a stable category model so competitive measurements are meaningful.

Example:
Roofing competes with Roofing.

A category may later have hierarchy and refinement, but category identity must be stable enough for historical reporting.

## 6. Verified Play Share

Future competitive position should be derived from actual delivery rather than arbitrary badges.

Concept:

Category Play Share =
advertiser verified eligible plays
divided by
total verified eligible category plays
within a defined Zone and measurement window.

This can support transparent rank such as #1, #2, #3 and percentage share.

Rank must never be fabricated.

## 7. Competitive marketplace

The marketplace begins when multiple advertisers want more of the same finite geographic/category inventory.

A customer should eventually be able to understand:
- how many category competitors are active,
- its own verified delivery and share,
- who currently has greater share,
- why another advertiser receives more delivery,
- whether additional inventory is available,
- what geographic expansion opportunities exist.

Scarcity should be real and measurable.

## 8. Customer levels

### Standard Advertiser

Launch-oriented, simple purchase:
- choose package / coverage,
- provide business and brand material,
- CoastLoop creates screen-ready creative,
- advertiser reviews,
- campaign is delivered,
- verified playback is reported.

### Premium / Network Intelligence

A materially higher-value product, not a low-cost analytics add-on.

Potential future capabilities:
- category competitor visibility,
- Zone-by-Zone position,
- verified Play Share,
- historical movement,
- uncovered / undercovered Zones,
- adjacent expansion opportunities,
- additional inventory availability,
- deeper campaign management,
- enhanced creative services.

### Enterprise

For serious regional / national buyers:
- many Zones / markets,
- team access,
- advanced reporting,
- major creative support,
- negotiated / competitive media inventory,
- large-scale geography management.

## 9. CoastLoop Creative

Creative is part of the media product.

Current pipeline:

Brand / source assets
-> creative generation
-> advertiser review
-> revision
-> approval
-> delivery variants
-> screens

Future qualifying accounts may add:

Professional on-location photography / video
-> Brand Library
-> CoastLoop creative production
-> review
-> approval
-> network delivery

Professional production should elevate the advertiser and the quality of the CoastLoop network simultaneously.

## 10. Geographic administration

The Admin Zone Control Map is the canonical visual operating surface for CoastLoop geography.

Customer/admin-facing Zones should appear as recognizable interlocking polygons.

Underlying geometric cells / hexes may assist:
- drawing,
- snapping,
- adjacency,
- inventory aggregation,
- geographic editing,
- national-scale analysis.

The visible Zone remains the customer-recognizable Polygon / MultiPolygon.

Boundary changes must create new versions rather than rewriting historical geography.

## 11. Launch truth rules

At launch:
- do not invent Zone counts,
- do not invent screen counts,
- do not invent projected plays,
- do not invent delivery guarantees,
- do not imply a test screen is a commercial deployment,
- do not display engineering placeholders such as READY as customer value.

Commissioning states should be explicit.

When real inventory exists, numerical truth should replace descriptive placeholders automatically.

## 12. Current public product facts

Current public packages expose package-backed facts such as:
- package price,
- term length,
- ad length,
- market,
- coverage mode,
- placement scope,
- availability.

Current CoastLoop public package coverage may still be zero until real Zones, locations, and commercial screens are seeded.

The public advertising page should automatically replace the fallback coverage description with live:
- Zone count,
- location count,
- commercial screen count

once those relationships exist.

## 13. SOP direction

The eventual CoastLoop Advertising Operations SOP should cover:

Define Zone
-> build screen inventory
-> assemble packages
-> sell advertiser
-> classify category
-> collect brand material
-> create creative
-> advertiser review
-> allocate delivery
-> go live
-> verify plays
-> report
-> expand / upgrade
-> renew / compete

Separate:
- Live SOP
- Launch policy
- Scale SOP
- Marketplace SOP

Do not SOP speculative marketplace behavior as if it is live today.

## 14. Product principle

CoastLoop is not merely software for putting ads on televisions.

CoastLoop is a geographically organized, measurable advertising network whose software helps local and enterprise advertisers understand, purchase, improve, measure, and eventually compete for local attention.
