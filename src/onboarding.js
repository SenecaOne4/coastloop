const ORG_ID = "28ad55e4-d32d-423b-80b5-481bd15dec9e";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function sb(env, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", env.SUPABASE_SECRET_KEY);
  headers.set("authorization", `Bearer ${env.SUPABASE_SECRET_KEY}`);
  if (options.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { message: text.slice(0, 400) }; }
  }
  if (!res.ok)
    throw new HttpError(res.status, data?.message || `Supabase ${res.status}`);
  return data;
}

async function bodyJson(request, maxBytes = 65536) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > maxBytes) throw new HttpError(413, "request too large");
  try { return await request.json(); }
  catch { throw new HttpError(400, "invalid JSON"); }
}

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function bool(value) {
  return value === true || value === "true";
}

function actorId(auth) {
  return auth?.user?.id || auth?.user_id || auth?.id || null;
}

function enc(value) {
  return encodeURIComponent(String(value));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value))
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function human(value, fallback = "None") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  if (typeof value === "object") {
    if (Number.isInteger(value.amount_cents)) {
      const amount = `$${(value.amount_cents / 100).toFixed(2)}`;
      return value.schedule ? `${amount} — ${value.schedule}` : amount;
    }
    return Object.entries(value)
      .map(([k, v]) => `${k.replaceAll("_", " ")}: ${human(v, "")}`)
      .filter(Boolean)
      .join("; ") || fallback;
  }
  return String(value);
}

function compensationCents(value) {
  if (Number.isInteger(value)) return Math.max(0, value);
  if (value && Number.isInteger(value.amount_cents))
    return Math.max(0, value.amount_cents);
  return 0;
}

function normalizePlacements(raw) {
  if (!Array.isArray(raw) || !raw.length)
    throw new HttpError(400, "at least one placement is required");
  if (raw.length > 16)
    throw new HttpError(400, "too many placements");

  return raw.map((p, index) => {
    const mode = text(p?.operating_mode, 40);
    if (!["dedicated_coastloop", "scheduled_coastloop", "other"].includes(mode))
      throw new HttpError(400, `placement ${index + 1} has invalid operating mode`);
    const count = Number(p?.screen_count ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 50)
      throw new HttpError(400, `placement ${index + 1} has invalid screen count`);

    return {
      zone_id: text(p?.zone_id, 80) || null,
      screen_id: text(p?.screen_id, 80) || null,
      zone_label: text(p?.zone_label, 180) || null,
      screen_label: text(p?.screen_label, 180) || null,
      screen_count: count,
      operating_mode: mode,
      operating_schedule:
        p?.operating_schedule && typeof p.operating_schedule === "object"
          ? p.operating_schedule
          : {},
      notes: text(p?.notes, 1000) || null,
    };
  });
}

async function auditExternal(request, env, events) {
  const list = Array.isArray(events) ? events : [events];
  const rows = list.map((event) => ({
    organization_id: ORG_ID,
    actor_user_id: null,
    actor_type: "external_signer",
    actor_role: "venue_signer",
    action: event.action,
    entity_type: event.entity_type || "agreement",
    entity_id: event.entity_id ? String(event.entity_id) : null,
    request_method: "POST",
    request_path: new URL(request.url).pathname,
    request_id: request.headers.get("cf-ray") || null,
    status_code: event.status_code || 200,
    succeeded: event.succeeded !== false,
    metadata: event.metadata || {},
  }));

  try {
    await sb(env, "audit_events", {
      method: "POST",
      body: JSON.stringify(rows),
    });
  } catch (error) {
    console.error("ONBOARDING_AUDIT_WRITE_FAILED", error?.message || error);
  }
}

async function readVenueContext(env, rawToken, allowUsed = true) {
  const token = text(rawToken, 256);
  if (!token) throw new HttpError(400, "token required");

  const hash = await sha256Hex(token);
  const tokens = await sb(
    env,
    `onboarding_tokens?organization_id=eq.${ORG_ID}&purpose=eq.venue_invite&token_hash=eq.${hash}&select=*&limit=1`
  );
  const tokenRow = tokens?.[0];
  if (!tokenRow) throw new HttpError(404, "invite not found");
  if (tokenRow.status === "revoked") throw new HttpError(410, "invite revoked");
  if (tokenRow.status === "expired") throw new HttpError(410, "invite expired");
  if (!allowUsed && tokenRow.status === "used")
    throw new HttpError(409, "invite already completed");

  if (
    tokenRow.status === "active" &&
    new Date(tokenRow.expires_at).getTime() <= Date.now()
  ) {
    await sb(env, `onboarding_tokens?id=eq.${tokenRow.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "expired" }),
    });
    throw new HttpError(410, "invite expired");
  }

  const agreements = await sb(
    env,
    `agreement_instances?organization_id=eq.${ORG_ID}&onboarding_token_id=eq.${tokenRow.id}&select=*&order=created_at.desc&limit=1`
  );
  const agreement = agreements?.[0];
  if (!agreement) throw new HttpError(404, "agreement not found");

  const [templates, businesses, locations, placements] = await Promise.all([
    sb(env, `agreement_templates?id=eq.${agreement.template_id}&organization_id=eq.${ORG_ID}&select=*&limit=1`),
    sb(env, `businesses?id=eq.${agreement.business_id}&organization_id=eq.${ORG_ID}&select=*&limit=1`),
    agreement.location_id
      ? sb(env, `locations?id=eq.${agreement.location_id}&organization_id=eq.${ORG_ID}&select=*&limit=1`)
      : Promise.resolve([]),
    sb(env, `placement_authorizations?agreement_instance_id=eq.${agreement.id}&organization_id=eq.${ORG_ID}&select=*&order=created_at.asc`),
  ]);

  return {
    rawToken: token,
    token: tokenRow,
    agreement,
    template: templates?.[0] || null,
    business: businesses?.[0] || null,
    location: locations?.[0] || null,
    placements: placements || [],
  };
}

export async function createVenueInvite(request, env, auth = null) {
  try {
    const b = await bodyJson(request);
    const businessId = text(b.business_id, 80);
    const locationId = text(b.location_id, 80);
    const preview = bool(b.preview);

    if (!businessId || !locationId)
      throw new HttpError(400, "business and location required");

    const [businesses, locations, templates] = await Promise.all([
      sb(env, `businesses?id=eq.${enc(businessId)}&organization_id=eq.${ORG_ID}&select=*&limit=1`),
      sb(env, `locations?id=eq.${enc(locationId)}&organization_id=eq.${ORG_ID}&select=*&limit=1`),
      sb(env, `agreement_templates?organization_id=eq.${ORG_ID}&template_family=eq.venue_partner&status=in.(locked,counsel_review)&select=*&order=created_at.desc&limit=10`),
    ]);

    const business = businesses?.[0];
    const location = locations?.[0];
    if (!business) throw new HttpError(404, "business not found");
    if (!location || location.business_id !== business.id)
      throw new HttpError(404, "location not found for business");

    const lockedTemplate = templates?.find((row) => row.status === "locked");
    const template = lockedTemplate || (preview ? templates?.[0] : null);
    if (!template)
      throw new HttpError(409, "venue agreement is not locked for external use");

    const placements = normalizePlacements(b.placements);
    const organizationLegalName = text(b.organization_legal_name, 240);
    const termType = text(b.term_type, 120);
    const houseInventory = text(b.house_inventory, 500);
    const equipment = text(b.equipment_network_responsibility, 800);

    if (!organizationLegalName || !termType || !houseInventory || !equipment)
      throw new HttpError(400, "legal name, term, house inventory, and equipment responsibility required");
    if (typeof b.public_venue_listing !== "boolean" ||
        typeof b.venue_photo_permission !== "boolean")
      throw new HttpError(400, "venue listing and photography elections required");

    const now = new Date().toISOString();
    const days = Math.min(30, Math.max(1, Number(b.expires_in_days || 7)));
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);

    const dealSummary = {
      organization_legal_name: organizationLegalName,
      venue_display_name: text(b.venue_display_name, 240) || location.name || business.name,
      venue_address_line1: text(b.venue_address_line1, 240) || location.address_line1 || "",
      venue_city: text(b.venue_city, 120) || location.city || "",
      venue_state: text(b.venue_state, 40) || location.state || "",
      venue_postal_code: text(b.venue_postal_code, 20) || location.postal_code || "",
      signer_name: text(b.signer_name, 180) || business.contact_name || "",
      signer_title: text(b.signer_title, 180),
      signer_email: text(b.signer_email, 180) || business.email || "",
      signer_mobile: text(b.signer_mobile, 80) || business.phone || "",
      term_type: termType,
      house_inventory: houseInventory,
      host_compensation: b.host_compensation ?? null,
      compensation_schedule: text(b.compensation_schedule, 500) || null,
      equipment_network_responsibility: equipment,
      category_exclusions: text(b.category_exclusions, 800) || null,
      public_venue_listing: b.public_venue_listing,
      venue_photo_permission: b.venue_photo_permission,
      preview_only: template.status !== "locked",
    };

    const tokenRows = await sb(env, "onboarding_tokens", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_ID,
        purpose: "venue_invite",
        token_hash: tokenHash,
        status: "active",
        business_id: business.id,
        location_id: location.id,
        recipient_email: dealSummary.signer_email || null,
        recipient_mobile: dealSummary.signer_mobile || null,
        expires_at: expiresAt,
        created_by: actorId(auth),
      }),
    });
    const tokenRow = tokenRows?.[0];
    if (!tokenRow) throw new Error("token insert returned no row");

    const agreementRows = await sb(env, "agreement_instances", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_ID,
        template_id: template.id,
        onboarding_token_id: tokenRow.id,
        business_id: business.id,
        location_id: location.id,
        template_family: template.template_family,
        template_version: template.template_version,
        status: "sent",
        deal_summary: dealSummary,
        sent_at: now,
        created_by: actorId(auth),
      }),
    });
    const agreement = agreementRows?.[0];
    if (!agreement) throw new Error("agreement insert returned no row");

    await sb(env, "placement_authorizations", {
      method: "POST",
      body: JSON.stringify(placements.map((p) => ({
        organization_id: ORG_ID,
        agreement_instance_id: agreement.id,
        business_id: business.id,
        location_id: location.id,
        screen_id: p.screen_id,
        zone_id: p.zone_id,
        zone_label: p.zone_label,
        screen_label: p.screen_label,
        screen_count: p.screen_count,
        operating_mode: p.operating_mode,
        operating_schedule: p.operating_schedule,
        notes: p.notes,
        status: "proposed",
      }))),
    });

    const origin = new URL(request.url).origin;
    return json({
      ok: true,
      agreement_instance_id: agreement.id,
      preview_only: template.status !== "locked",
      expires_at: expiresAt,
      url: `${origin}/onboard.html?t=${encodeURIComponent(rawToken)}`,
      token: rawToken,
    });
  } catch (error) {
    return json({ error: error.message || "server error" }, error.status || 500);
  }
}

export async function venueOnboardingSession(request, env) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    const c = await readVenueContext(env, token, true);
    if (!c.template) throw new HttpError(409, "agreement template unavailable");

    const deal = c.agreement.deal_summary || {};
    return json({
      ok: true,
      completed: Boolean(c.agreement.signed_at),
      can_sign: c.template.status === "locked" && !c.agreement.signed_at,
      preview_only: c.template.status !== "locked",
      agreement_instance_id: c.agreement.id,
      template: {
        family: c.template.template_family,
        version: c.template.template_version,
        title: c.template.display_title || "CoastLoop Venue Partner Agreement",
        status: c.template.status,
        full_terms: c.template.rendered_content || "",
        content_type: c.template.rendered_content_type || "text/html",
      },
      venue: {
        organization_legal_name: deal.organization_legal_name || "",
        venue_display_name: deal.venue_display_name || c.location?.name || c.business?.name || "",
        venue_address_line1: deal.venue_address_line1 || c.location?.address_line1 || "",
        venue_city: deal.venue_city || c.location?.city || "",
        venue_state: deal.venue_state || c.location?.state || "",
        venue_postal_code: deal.venue_postal_code || c.location?.postal_code || "",
        signer_name: deal.signer_name || c.business?.contact_name || "",
        signer_title: deal.signer_title || "",
        signer_email: deal.signer_email || c.business?.email || "",
        signer_mobile: deal.signer_mobile || c.business?.phone || "",
      },
      commercial_terms: {
        term_type: deal.term_type,
        house_inventory: deal.house_inventory,
        host_compensation: deal.host_compensation,
        compensation_schedule: deal.compensation_schedule,
        equipment_network_responsibility: deal.equipment_network_responsibility,
        category_exclusions: deal.category_exclusions,
        public_venue_listing: deal.public_venue_listing,
        venue_photo_permission: deal.venue_photo_permission,
      },
      placements: c.placements.map((p) => ({
        id: p.id,
        zone_label: p.zone_label,
        screen_label: p.screen_label,
        screen_count: p.screen_count,
        operating_mode: p.operating_mode,
        operating_schedule: p.operating_schedule,
        notes: p.notes,
        status: p.status,
      })),
      executed_url: c.agreement.signed_at
        ? `/api/onboarding/executed?token=${encodeURIComponent(c.rawToken)}`
        : null,
    });
  } catch (error) {
    return json({ error: error.message || "server error" }, error.status || 500);
  }
}

export async function markVenueOnboardingViewed(request, env) {
  try {
    const b = await bodyJson(request, 8192);
    const c = await readVenueContext(env, b.token, true);
    const now = new Date().toISOString();

    if (!c.token.first_viewed_at) {
      await sb(env, `onboarding_tokens?id=eq.${c.token.id}`, {
        method: "PATCH",
        body: JSON.stringify({ first_viewed_at: now }),
      });
    }

    if (!c.agreement.first_viewed_at) {
      await sb(env, `agreement_instances?id=eq.${c.agreement.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          first_viewed_at: now,
          status: c.agreement.status === "sent" ? "viewed" : c.agreement.status,
        }),
      });
      await auditExternal(request, env, {
        action: "agreement.viewed",
        entity_id: c.agreement.id,
        metadata: { template_version: c.agreement.template_version },
      });
    }

    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || "server error" }, error.status || 500);
  }
}

function renderExecutedVenueHtml(template, snapshot) {
  const d = snapshot.deal_summary;
  const placementRows = snapshot.placements.map((p) => `
    <tr>
      <td>${html(p.zone_label || "")}</td>
      <td>${html(p.screen_label || "")}</td>
      <td>${html(p.screen_count)}</td>
      <td>${html(p.operating_mode)}</td>
      <td>${html(human(p.operating_schedule, ""))}</td>
      <td>${html(p.notes || "")}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Executed CoastLoop Venue Partner Agreement</title>
<style>
body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 28px;color:#171412;line-height:1.55}
h1,h2{line-height:1.15}table{width:100%;border-collapse:collapse;margin:18px 0}
th,td{border:1px solid #ccc;padding:8px;vertical-align:top}th{text-align:left;background:#f4efe7}
.card{border:1px solid #d8c39a;border-radius:14px;padding:18px;margin:18px 0}
.sig{margin-top:28px;padding-top:18px;border-top:2px solid #171412}
.small{font-size:12px;color:#655e58}
</style>
</head>
<body>
<h1>CoastLoop Venue Partner Agreement</h1>
<p class="small">Executed ${html(snapshot.signed_at)} UTC · Template ${html(snapshot.template_version)}</p>
<div class="card">
<h2>Deal Summary</h2>
<p><strong>Venue legal entity:</strong> ${html(d.organization_legal_name)}</p>
<p><strong>Venue:</strong> ${html(d.venue_display_name)}</p>
<p><strong>Address:</strong> ${html([d.venue_address_line1,d.venue_city,d.venue_state,d.venue_postal_code].filter(Boolean).join(", "))}</p>
<p><strong>Term:</strong> ${html(d.term_type)}</p>
<p><strong>Venue house inventory:</strong> ${html(human(d.house_inventory))}</p>
<p><strong>Host compensation:</strong> ${html(human(d.host_compensation))}</p>
<p><strong>Equipment / network:</strong> ${html(human(d.equipment_network_responsibility))}</p>
<p><strong>Category exclusions:</strong> ${html(human(d.category_exclusions))}</p>
<p><strong>Public venue listing:</strong> ${d.public_venue_listing ? "Yes" : "No"}</p>
<p><strong>Approved placement photography:</strong> ${d.venue_photo_permission ? "Yes" : "No"}</p>
</div>
<h2>Placement Schedule</h2>
<table>
<thead><tr><th>Zone</th><th>Screen</th><th>Qty</th><th>Mode</th><th>Schedule</th><th>Notes</th></tr></thead>
<tbody>${placementRows}</tbody>
</table>
<section>${template.rendered_content || ""}</section>
<div class="sig">
<h2>Electronic Acceptance</h2>
<p><strong>Signer:</strong> ${html(snapshot.signer.legal_name)} — ${html(snapshot.signer.title)}</p>
<p><strong>Email:</strong> ${html(snapshot.signer.email)} &nbsp; <strong>Mobile:</strong> ${html(snapshot.signer.mobile)}</p>
<p><strong>Electronic signature:</strong> ${html(snapshot.signer.signature_representation)}</p>
<p><strong>Signed:</strong> ${html(snapshot.signed_at)} UTC</p>
<p class="small">Signer consented to electronic records/signatures, represented authority to bind the venue, and confirmed review of the full agreement.</p>
</div>
</body>
</html>`;
}

async function ensureTask(env, agreement, type, metadata = {}) {
  const existing = await sb(
    env,
    `onboarding_tasks?organization_id=eq.${ORG_ID}&agreement_instance_id=eq.${agreement.id}&task_type=eq.${enc(type)}&select=id&limit=1`
  );
  if (existing?.[0]) return existing[0].id;

  const rows = await sb(env, "onboarding_tasks", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      task_type: type,
      status: "open",
      business_id: agreement.business_id,
      location_id: agreement.location_id,
      agreement_instance_id: agreement.id,
      metadata,
    }),
  });
  return rows?.[0]?.id || null;
}

async function ensureVenuePostSign(env, c) {
  const now = new Date().toISOString();

  await Promise.all([
    sb(env, `locations?id=eq.${c.agreement.location_id}&organization_id=eq.${ORG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ host_status: "signed", updated_at: now }),
    }),
    sb(env, `placement_authorizations?agreement_instance_id=eq.${c.agreement.id}&organization_id=eq.${ORG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "authorized", authorized_at: now, updated_at: now }),
    }),
  ]);

  await ensureTask(env, c.agreement, "installation", {
    source: "venue_signature",
  });

  const compensation = compensationCents(c.agreement.deal_summary?.host_compensation);
  if (compensation > 0) {
    await ensureTask(env, c.agreement, "payee_setup", {
      source: "venue_signature",
      host_compensation_cents: compensation,
    });
  }
}

export async function acceptVenueOnboarding(request, env) {
  try {
    const b = await bodyJson(request);
    const c = await readVenueContext(env, b.token, true);

    if (c.agreement.signed_at) {
      await ensureVenuePostSign(env, c);
      if (c.token.status !== "used") {
        await sb(env, `onboarding_tokens?id=eq.${c.token.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "used", used_at: c.agreement.signed_at }),
        });
      }
      return json({
        ok: true,
        completed: true,
        executed_url: `/api/onboarding/executed?token=${encodeURIComponent(c.rawToken)}`,
      });
    }

    if (c.token.status !== "active")
      throw new HttpError(409, "invite is not active");
    if (!c.template || c.template.status !== "locked")
      throw new HttpError(409, "agreement is not approved for signature");

    const legalName = text(b.organization_legal_name, 240);
    const venueName = text(b.venue_display_name, 240);
    const address1 = text(b.venue_address_line1, 240);
    const city = text(b.venue_city, 120);
    const state = text(b.venue_state, 40);
    const postal = text(b.venue_postal_code, 20);
    const signerName = text(b.signer_name, 180);
    const signerTitle = text(b.signer_title, 180);
    const signerEmail = text(b.signer_email, 180);
    const signerMobile = text(b.signer_mobile, 80);
    const signature = text(b.signature_representation, 240);

    if (!legalName || !venueName || !address1 || !city || !state || !postal)
      throw new HttpError(400, "venue legal name and full address required");
    if (!signerName || !signerTitle || !signerEmail || !signerMobile || !signature)
      throw new HttpError(400, "signer name, title, email, mobile, and signature required");
    if (!bool(b.consent_to_electronic_records) ||
        !bool(b.authority_confirmation) ||
        !bool(b.reviewed_full_agreement))
      throw new HttpError(400, "all acceptance confirmations are required");

    const now = new Date().toISOString();
    const finalDeal = {
      ...(c.agreement.deal_summary || {}),
      organization_legal_name: legalName,
      venue_display_name: venueName,
      venue_address_line1: address1,
      venue_city: city,
      venue_state: state,
      venue_postal_code: postal,
      signer_name: signerName,
      signer_title: signerTitle,
      signer_email: signerEmail,
      signer_mobile: signerMobile,
      preview_only: false,
    };

    const snapshot = {
      agreement_instance_id: c.agreement.id,
      template_family: c.agreement.template_family,
      template_version: c.agreement.template_version,
      template_rendered_sha256: c.template.rendered_sha256,
      deal_summary: finalDeal,
      placements: c.placements.map((p) => ({
        id: p.id,
        zone_label: p.zone_label,
        screen_label: p.screen_label,
        screen_count: p.screen_count,
        operating_mode: p.operating_mode,
        operating_schedule: p.operating_schedule,
        notes: p.notes,
      })),
      signer: {
        legal_name: signerName,
        title: signerTitle,
        email: signerEmail,
        mobile: signerMobile,
        signature_type: "typed",
        signature_representation: signature,
        ip: request.headers.get("cf-connecting-ip") || null,
        user_agent: text(request.headers.get("user-agent"), 1000) || null,
      },
      consent_to_electronic_records: true,
      authority_confirmation: true,
      reviewed_full_agreement: true,
      signed_at: now,
      invite_token_id: c.token.id,
    };

    const executedHtml = renderExecutedVenueHtml(c.template, snapshot);
    const digest = await sha256Hex(executedHtml);
    const storageKey = `agreements/${c.agreement.id}/${digest}.html`;
    snapshot.executed_sha256 = digest;

    const existingObject = await env.MEDIA.head(storageKey);
    if (!existingObject) {
      await env.MEDIA.put(storageKey, executedHtml, {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
        customMetadata: {
          agreement_instance_id: c.agreement.id,
          sha256: digest,
          template_version: c.agreement.template_version,
        },
      });
    }

    const updatedRows = await sb(
      env,
      `agreement_instances?id=eq.${c.agreement.id}&organization_id=eq.${ORG_ID}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: "archived",
          deal_summary: finalDeal,
          executed_snapshot: snapshot,
          executed_storage_key: storageKey,
          executed_sha256: digest,
          signer_legal_name: signerName,
          signer_title: signerTitle,
          signer_email: signerEmail,
          signer_mobile: signerMobile,
          consent_to_electronic_records: true,
          authority_confirmation: true,
          reviewed_full_agreement: true,
          signature_type: "typed",
          signature_representation: signature,
          signer_ip: snapshot.signer.ip,
          signer_user_agent: snapshot.signer.user_agent,
          signed_at: now,
          archived_at: now,
          updated_at: now,
        }),
      }
    );
    c.agreement = updatedRows?.[0] || { ...c.agreement, deal_summary: finalDeal, signed_at: now };

    await Promise.all([
      sb(env, `businesses?id=eq.${c.business.id}&organization_id=eq.${ORG_ID}`, {
        method: "PATCH",
        body: JSON.stringify({
          contact_name: signerName,
          email: signerEmail,
          phone: signerMobile,
          is_host: true,
          updated_at: now,
        }),
      }),
      sb(env, `locations?id=eq.${c.location.id}&organization_id=eq.${ORG_ID}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: venueName,
          address_line1: address1,
          city,
          state,
          postal_code: postal,
          host_status: "signed",
          updated_at: now,
        }),
      }),
    ]);

    c.agreement.deal_summary = finalDeal;
    await ensureVenuePostSign(env, c);

    await sb(env, `onboarding_tokens?id=eq.${c.token.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "used", used_at: now }),
    });

    await auditExternal(request, env, [
      {
        action: "agreement.accepted",
        entity_id: c.agreement.id,
        metadata: {
          template_version: c.agreement.template_version,
          executed_sha256: digest,
        },
      },
      {
        action: "agreement.archived",
        entity_id: c.agreement.id,
        metadata: { storage_key: storageKey, executed_sha256: digest },
      },
    ]);

    return json({
      ok: true,
      completed: true,
      agreement_instance_id: c.agreement.id,
      executed_sha256: digest,
      executed_url: `/api/onboarding/executed?token=${encodeURIComponent(c.rawToken)}`,
    });
  } catch (error) {
    return json({ error: error.message || "server error" }, error.status || 500);
  }
}

export async function executedVenueAgreement(request, env) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    const c = await readVenueContext(env, token, true);
    if (!c.agreement.signed_at || !c.agreement.executed_storage_key)
      throw new HttpError(404, "executed agreement not available");

    const object = await env.MEDIA.get(c.agreement.executed_storage_key);
    if (!object) throw new HttpError(404, "executed agreement file not found");

    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType || "text/html; charset=utf-8",
        "content-disposition": 'inline; filename="CoastLoop-Venue-Agreement.html"',
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return json({ error: error.message || "server error" }, error.status || 500);
  }
}

export async function adminOnboarding(env) {
  const [agreements, tasks] = await Promise.all([
    sb(env, `agreement_instances?organization_id=eq.${ORG_ID}&select=id,business_id,location_id,template_family,template_version,status,signer_legal_name,signer_email,sent_at,first_viewed_at,signed_at,created_at&order=created_at.desc&limit=100`),
    sb(env, `onboarding_tasks?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc&limit=100`),
  ]);
  return { agreements: agreements || [], tasks: tasks || [] };
}
