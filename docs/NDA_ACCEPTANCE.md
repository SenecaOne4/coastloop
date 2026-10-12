# CoastLoop platform NDA gate

The platform NDA is distinct from advertiser and venue agreements. Those role-specific signing flows continue to use their existing records.

## Configuration

After the approved NDA text is published at an immutable, version-specific HTTPS URL or CoastLoop path, set both Worker variables:

- `NDA_CURRENT_VERSION`: the exact document version identifier, such as `1.0`.
- `NDA_DOCUMENT_URL`: the URL the user opens to review that version.

Do not set these values to a draft or placeholder. If either value is absent or invalid, the acceptance page reports that the NDA is not configured, acceptance writes are rejected, and protected account APIs fail closed. Public advertiser checkout endpoints remain available.

Never replace the content behind an existing version URL. For each revised NDA, publish a new immutable URL and change `NDA_CURRENT_VERSION` and `NDA_DOCUMENT_URL` together. Existing users must accept the new version before protected account access resumes.

## Deploy sequence

1. Review and approve the legal text and publish its versioned document.
2. Apply the new Supabase migration. It creates an append-only acceptance table with RLS enabled and access limited to the Worker's service role.
3. Configure the two Worker variables for the approved version.
4. Deploy the Worker and static assets together.
5. Verify a new Google sign-in reaches the NDA page, acceptance is recorded, the same version is not shown again, and a version change prompts again.
6. Verify direct calls to protected APIs fail before acceptance and advertiser checkout remains usable.

This repository change does not publish NDA terms, configure production secrets, apply the database migration, or deploy to production.
