# CoastLoop platform NDA acceptance

The platform NDA is separate from advertiser and venue agreements. Their existing signatures and checkout behavior stay unchanged.

## Current manual-review mode

Set `NDA_ENFORCEMENT_ENABLED=false` (the default) so a user can continue after sign-in without accepting the platform NDA. This keeps the NDA page and versioned acceptance records available, but acceptance does not block account access. CoastLoop staff can review and approve account access through the existing account authorization workflow.

Advertiser checkout remains available. This change does not add cash collection or mark an invoice paid; handle any in-person cash payment through your manual process.

## Enable an NDA gate later

After the NDA language is approved and published at an immutable, version-specific URL, configure:

- `NDA_ENFORCEMENT_ENABLED=true`
- `NDA_CURRENT_VERSION`: exact document version, such as `1.0`
- `NDA_DOCUMENT_URL`: HTTPS URL or CoastLoop path for that version

Apply the Supabase migration before enabling enforcement. If enforcement is enabled but the document or database is unavailable, protected account APIs fail closed. Never replace the content behind an existing version URL. For revised language, publish a new version and update the version and URL together.

## Source validation

With enforcement disabled, new and returning users can continue whether or not an acceptance record exists. With enforcement enabled, users must accept the configured current version before protected account access resumes. Public advertiser checkout routes are unaffected.

The migration, production Worker settings, deployment, and production behavior still require a controlled rollout and validation.
