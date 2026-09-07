import { createBillingInvoice } from "./billing.js";

const ORG_ID = "28ad55e4-d32d-423b-80b5-481bd15dec9e";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const enc = (v) => encodeURIComponent(String(v));
const clean = (v, n = 500) => String(v ?? "").trim().slice(0, n);
const yes = (v) => v === true || v === "true";

function actorId(auth) {
  return auth?.user?.id || auth?.user_id || auth?.id || null;
}

async function bodyJson(request, max = 65536) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new HttpError(413, "request too large");
  try { return await request.json(); }
  catch { throw new HttpError(400, "invalid JSON"); }
}

async function sb(env, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", env.SUPABASE_SECRET_KEY);
  headers.set("authorization", `Bearer ${env.SUPABASE_SECRET_KEY}`);
  if (options.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options, headers,
  });
  const raw = await res.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); }
    catch { data = { message: raw.slice(0, 300) }; }
  }
  if (!res.ok) throw new HttpError(res.status, data?.message || `Supabase ${res.status}`);
  return data;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(String(value))
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function packageSnapshot(p) {
  return {
    package_id: p.id,
    package_key: p.package_key,
    version: p.version,
    name: p.name,
    market: p.market,
    placement_scope: p.placement_scope || {},
    price_cents: Number(p.price_cents),
    currency: p.currency,
    term_days: p.term_days,
    ad_length_seconds: p.ad_length_seconds,
    frequency_label: p.frequency_label,
    loop_share: p.loop_share,
    screen_count: p.screen_count,
    projected_plays: p.projected_plays,
    projection_period_days: p.projection_period_days,
    availability_status: p.availability_status,
  };
}

async function auditExternal(request, env, action, entityId, metadata = {}) {
  try {
    await sb(env, "audit_events", {
      method: "POST",
      body: JSON.stringify({
        organization_id: ORG_ID,
        actor_user_id: null,
        actor_type: "external_signer",
        actor_role: "advertiser_signer",
        action,
        entity_type: "agreement",
        entity_id: String(entityId),
        request_method: "POST",
        request_path: new URL(request.url).pathname,
        request_id: request.headers.get("cf-ray") || null,
        status_code: 200,
        succeeded: true,
        metadata,
      }),
    });
  } catch (error) {
    console.error("ADVERTISER_AUDIT_WRITE_FAILED", error?.message || error);
  }
}

export async function publicAdvertisingPackages(env) {
  try {
    const rows = await sb(
      env,
      `advertising_packages?organization_id=eq.${ORG_ID}&status=eq.active&availability_status=in.(available,limited)&select=*&order=price_cents.asc`
    );
    return json({
      packages: (rows || []).map(packageSnapshot),
      measurement_note: "Projected plays are delivery projections, not human views.",
    });
  } catch {
    return json({ error: "could not load placements" }, 500);
  }
}

export async function adminAdvertisingPackages(env) {
  return sb(
    env,
    `advertising_packages?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`
  );
}

export async function createAdvertisingPackage(request, env, auth = null) {
  try {
    const b = await bodyJson(request);
    const key = clean(b.package_key, 120);
    const name = clean(b.name, 180);
    const version = Number(b.version);
    const price = Number(b.price_cents);

    if (!key || !name || !Number.isInteger(version) || version < 1)
      throw new HttpError(400, "package key, name, and version required");
    if (!Number.isInteger(price) || price < 0)
      throw new HttpError(400, "price_cents must be a non-negative integer");

    const rows = await sb(env, "advertising_packages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_ID,
        package_key: key,
        version,
        name,
        status: "draft",
        market: clean(b.market, 180) || null,
        placement_scope: b.placement_scope && typeof b.placement_scope === "object"
          ? b.placement_scope : {},
        price_cents: price,
        currency: "usd",
        term_days: Number.isInteger(Number(b.term_days)) ? Number(b.term_days) : null,
        ad_length_seconds: Number.isInteger(Number(b.ad_length_seconds))
          ? Number(b.ad_length_seconds) : 15,
        frequency_label: clean(b.frequency_label, 180) || null,
        loop_share: b.loop_share === "" || b.loop_share == null ? null : Number(b.loop_share),
        screen_count: Number.isInteger(Number(b.screen_count)) ? Number(b.screen_count) : null,
        projected_plays: Number.isInteger(Number(b.projected_plays)) ? Number(b.projected_plays) : null,
        projection_period_days: Number.isInteger(Number(b.projection_period_days))
          ? Number(b.projection_period_days) : null,
        availability_status: "available",
        metadata: b.metadata && typeof b.metadata === "object" ? b.metadata : {},
        created_by: actorId(auth),
      }),
    });
    return json({ ok: true, package: rows?.[0] || null });
  } catch (error) {
    return json({ error: error.message || "server error" }, error.status || 500);
  }
}

async function readContext(env, token) {
  const rawToken = clean(token, 256);
  const hash = await sha256Hex(rawToken);
  const tokens = await sb(
    env,
    `onboarding_tokens?organization_id=eq.${ORG_ID}&purpose=eq.advertiser_checkout&token_hash=eq.${hash}&select=*&limit=1`
  );
  const t = tokens?.[0];
  if (!t) throw new HttpError(404, "checkout not found");
  if (t.status === "revoked" || t.status === "expired")
    throw new HttpError(410, "checkout link is no longer active");
  if (new Date(t.expires_at).getTime() <= Date.now() && t.status === "active")
    throw new HttpError(410, "checkout link expired");

  const orders = await sb(
    env,
    `advertiser_orders?id=eq.${t.advertiser_order_id}&organization_id=eq.${ORG_ID}&select=*&limit=1`
  );
  const order = orders?.[0];
  if (!order) throw new HttpError(404, "order not found");

  const agreements = await sb(
    env,
    `agreement_instances?advertiser_order_id=eq.${order.id}&organization_id=eq.${ORG_ID}&select=*&order=created_at.desc&limit=1`
  );
  const agreement = agreements?.[0];
  if (!agreement) throw new HttpError(404, "agreement not found");

  const [templates, businesses, invoices] = await Promise.all([
    sb(env, `agreement_templates?id=eq.${agreement.template_id}&organization_id=eq.${ORG_ID}&select=*&limit=1`),
    sb(env, `businesses?id=eq.${order.advertiser_business_id}&organization_id=eq.${ORG_ID}&select=*&limit=1`),
    order.invoice_id
      ? sb(env, `billing_invoices?id=eq.${order.invoice_id}&organization_id=eq.${ORG_ID}&select=*&limit=1`)
      : Promise.resolve([]),
  ]);

  return {
    rawToken,
    token: t,
    order,
    agreement,
    template: templates?.[0] || null,
    business: businesses?.[0] || null,
    invoice: invoices?.[0] || null,
  };
}

export async function startAdvertiserCheckout(request, env) {
  try {
    const b = await bodyJson(request);
    const packageId = clean(b.package_id, 80);
    const legalName = clean(b.advertiser_legal_name, 240);
    const displayName = clean(b.advertiser_display_name, 240) || legalName;
    const contactName = clean(b.contact_name, 180);
    const email = clean(b.contact_email, 180).toLowerCase();
    const mobile = clean(b.contact_mobile, 80);

    if (!packageId || !legalName || !contactName || !email || !mobile)
      throw new HttpError(400, "business, contact, email, mobile, and package required");

    const [packages, templates] = await Promise.all([
      sb(env, `advertising_packages?id=eq.${enc(packageId)}&organization_id=eq.${ORG_ID}&status=eq.active&select=*&limit=1`),
      sb(env, `agreement_templates?organization_id=eq.${ORG_ID}&template_family=eq.advertising_order_terms&status=eq.locked&select=*&order=created_at.desc&limit=1`),
    ]);
    const pkg = packages?.[0];
    const template = templates?.[0];

    if (!pkg) throw new HttpError(404, "placement package is not available");
    if (!template)
      throw new HttpError(409, "advertising terms are still in legal review");

    let businesses = await sb(
      env,
      `businesses?organization_id=eq.${ORG_ID}&email=eq.${enc(email)}&is_advertiser=eq.true&select=*&limit=1`
    );
    let business = businesses?.[0];

    if (!business) {
      businesses = await sb(env, "businesses", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          organization_id: ORG_ID,
          name: displayName,
          contact_name: contactName,
          phone: mobile,
          email,
          website: clean(b.website, 240) || null,
          is_host: false,
          is_advertiser: true,
          notes: "Created by advertiser self-checkout.",
        }),
      });
      business = businesses?.[0];
    }
    if (!business) throw new Error("business creation failed");

    const snapshot = packageSnapshot(pkg);
    const orders = await sb(env, "advertiser_orders", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_ID,
        advertiser_business_id: business.id,
        package_id: pkg.id,
        status: "prepared",
        package_key: pkg.package_key,
        package_version: pkg.version,
        amount_cents: Number(pkg.price_cents),
        currency: pkg.currency,
        market: pkg.market,
        placement_scope: pkg.placement_scope || {},
        start_preference: clean(b.start_preference, 180) || null,
        order_snapshot: {
          package: snapshot,
          advertiser: {
            legal_name: legalName,
            display_name: displayName,
            contact_name: contactName,
            email,
            mobile,
            website: clean(b.website, 240) || null,
          },
        },
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }),
    });
    const order = orders?.[0];
    if (!order) throw new Error("order creation failed");

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);
    const tokenRows = await sb(env, "onboarding_tokens", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_ID,
        purpose: "advertiser_checkout",
        token_hash: tokenHash,
        status: "active",
        business_id: business.id,
        advertiser_order_id: order.id,
        recipient_email: email,
        recipient_mobile: mobile,
        expires_at: order.expires_at,
      }),
    });
    const tokenRow = tokenRows?.[0];
    if (!tokenRow) throw new Error("checkout token creation failed");

    const agreementRows = await sb(env, "agreement_instances", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_ID,
        template_id: template.id,
        onboarding_token_id: tokenRow.id,
        business_id: business.id,
        advertiser_order_id: order.id,
        template_family: template.template_family,
        template_version: template.template_version,
        status: "sent",
        deal_summary: order.order_snapshot,
        sent_at: new Date().toISOString(),
      }),
    });
    if (!agreementRows?.[0]) throw new Error("agreement creation failed");

    const origin = new URL(request.url).origin;
    return json({
      ok: true,
      order_id: order.id,
      url: `${origin}/checkout.html?t=${encodeURIComponent(rawToken)}`,
      token: rawToken,
    });
  } catch (error) {
    return json({ error: error.message || "server error" }, error.status || 500);
  }
}

export async function advertiserCheckoutSession(request, env) {
  try {
    const c = await readContext(
      env, new URL(request.url).searchParams.get("token")
    );
    return json({
      ok: true,
      completed: Boolean(c.agreement.signed_at),
      order_status: c.order.status,
      payment_status: c.invoice?.status || null,
      can_accept: c.template?.status === "locked" && !c.agreement.signed_at,
      template: {
        title: c.template?.display_title || "CoastLoop Advertising Order & Terms",
        version: c.template?.template_version,
        full_terms: c.template?.rendered_content || "",
        content_type: c.template?.rendered_content_type || "text/html",
      },
      order: c.order.order_snapshot,
      amount_cents: Number(c.order.amount_cents),
      currency: c.order.currency,
      invoice: c.invoice ? {
        id: c.invoice.id,
        status: c.invoice.status,
        amount_due_cents: c.invoice.amount_due_cents,
        hosted_invoice_url: c.invoice.hosted_invoice_url,
      } : null,
      executed_url: c.agreement.signed_at
        ? `/api/onboarding/advertiser/executed?token=${encodeURIComponent(c.rawToken)}`
        : null,
    });
  } catch (error) {
    return json({ error: error.message || "server error" }, error.status || 500);
  }
}

function executedHtml(template, snapshot) {
  const p = snapshot.order.package;
  const a = snapshot.order.advertiser;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Executed CoastLoop Advertising Order</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 28px;color:#171412;line-height:1.55}.card{border:1px solid #d8c39a;border-radius:14px;padding:18px;margin:18px 0}.sig{border-top:2px solid #171412;margin-top:28px;padding-top:18px}.small{font-size:12px;color:#655e58}</style></head><body>
<h1>CoastLoop Advertising Order & Terms</h1>
<p class="small">Executed ${escapeHtml(snapshot.signed_at)} UTC · Template ${escapeHtml(snapshot.template_version)}</p>
<div class="card"><h2>Order Summary</h2>
<p><strong>Advertiser:</strong> ${escapeHtml(a.legal_name)}</p>
<p><strong>Package:</strong> ${escapeHtml(p.name)} — version ${escapeHtml(p.version)}</p>
<p><strong>Price:</strong> $${(Number(p.price_cents)/100).toFixed(2)} ${escapeHtml(p.currency.toUpperCase())}</p>
<p><strong>Market:</strong> ${escapeHtml(p.market || "As shown in package")}</p>
<p><strong>Ad length:</strong> ${escapeHtml(p.ad_length_seconds)} seconds</p>
<p><strong>Frequency:</strong> ${escapeHtml(p.frequency_label || "As shown in package")}</p>
<p><strong>Screen count:</strong> ${escapeHtml(p.screen_count ?? "As available")}</p>
<p><strong>Projected verified plays:</strong> ${escapeHtml(p.projected_plays ?? "Not specified")} ${p.projection_period_days ? `over ${escapeHtml(p.projection_period_days)} days` : ""}</p>
<p class="small">Projected plays are delivery projections, not human views or impressions.</p></div>
<section>${template.rendered_content || ""}</section>
<div class="sig"><h2>Electronic Acceptance</h2>
<p><strong>Signer:</strong> ${escapeHtml(snapshot.signer.legal_name)} — ${escapeHtml(snapshot.signer.title)}</p>
<p><strong>Electronic signature:</strong> ${escapeHtml(snapshot.signer.signature_representation)}</p>
<p><strong>Signed:</strong> ${escapeHtml(snapshot.signed_at)} UTC</p></div>
</body></html>`;
}

export async function acceptAdvertiserCheckout(request, env) {
  try {
    const b = await bodyJson(request);
    const c = await readContext(env, b.token);

    if (c.agreement.signed_at)
      return json({
        ok: true,
        completed: true,
        payment_status: c.invoice?.status || "pending",
        executed_url: `/api/onboarding/advertiser/executed?token=${encodeURIComponent(c.rawToken)}`,
      });

    if (c.template?.status !== "locked")
      throw new HttpError(409, "advertising terms are not approved for acceptance");
    if (!yes(b.consent_to_electronic_records) ||
        !yes(b.authority_confirmation) ||
        !yes(b.order_summary_confirmed) ||
        !yes(b.reviewed_full_agreement))
      throw new HttpError(400, "all acceptance confirmations are required");

    const signerName = clean(b.signer_name, 180);
    const signerTitle = clean(b.signer_title, 180);
    const signerEmail = clean(b.signer_email, 180).toLowerCase();
    const signerMobile = clean(b.signer_mobile, 80);
    const signature = clean(b.signature_representation, 240);
    if (!signerName || !signerTitle || !signerEmail || !signerMobile || !signature)
      throw new HttpError(400, "signer details and electronic signature required");

    const now = new Date().toISOString();
    const snapshot = {
      agreement_instance_id: c.agreement.id,
      advertiser_order_id: c.order.id,
      template_family: c.agreement.template_family,
      template_version: c.agreement.template_version,
      template_rendered_sha256: c.template.rendered_sha256,
      order: c.order.order_snapshot,
      signer: {
        legal_name: signerName,
        title: signerTitle,
        email: signerEmail,
        mobile: signerMobile,
        signature_type: "typed",
        signature_representation: signature,
        ip: request.headers.get("cf-connecting-ip") || null,
        user_agent: clean(request.headers.get("user-agent"), 1000) || null,
      },
      consent_to_electronic_records: true,
      authority_confirmation: true,
      order_summary_confirmed: true,
      reviewed_full_agreement: true,
      signed_at: now,
      checkout_token_id: c.token.id,
    };

    const document = executedHtml(c.template, snapshot);
    const digest = await sha256Hex(document);
    const storageKey = `agreements/${c.agreement.id}/${digest}.html`;
    snapshot.executed_sha256 = digest;

    if (!(await env.MEDIA.head(storageKey))) {
      await env.MEDIA.put(storageKey, document, {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
        customMetadata: {
          agreement_instance_id: c.agreement.id,
          advertiser_order_id: c.order.id,
          sha256: digest,
        },
      });
    }

    await sb(env, `agreement_instances?id=eq.${c.agreement.id}&organization_id=eq.${ORG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "archived",
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
        order_summary_confirmed: true,
        signature_type: "typed",
        signature_representation: signature,
        signer_ip: snapshot.signer.ip,
        signer_user_agent: snapshot.signer.user_agent,
        signed_at: now,
        archived_at: now,
        updated_at: now,
      }),
    });

    let campaignId = c.order.campaign_id;
    if (!campaignId) {
      const pkg = c.order.order_snapshot?.package || {};
      const advertiser = c.order.order_snapshot?.advertiser || {};
      const campaigns = await sb(env, "campaigns", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          organization_id: ORG_ID,
          advertiser_business_id: c.order.advertiser_business_id,
          name: `${advertiser.display_name || advertiser.legal_name || "Advertiser"} — ${pkg.name || c.order.package_key}`,
          status: "draft",
          price_cents: Number(c.order.amount_cents),
          billing_notes: `CoastLoop order ${c.order.id}; ${c.order.package_key} v${c.order.package_version}`,
          delivery_target_plays: Number.isInteger(Number(pkg.projected_plays))
            ? Number(pkg.projected_plays) : null,
        }),
      });
      campaignId = campaigns?.[0]?.id;
      if (!campaignId) throw new Error("campaign creation failed");
    }

    let invoiceId = c.order.invoice_id;
    let invoice = c.invoice;
    if (!invoiceId) {
      const invoiceRequest = new Request(request.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          provider: "manual",
          total_cents: Number(c.order.amount_cents),
          days_until_due: 7,
        }),
      });
      const invoiceResponse = await createBillingInvoice(invoiceRequest, env, null);
      const invoiceData = await invoiceResponse.json();
      if (!invoiceResponse.ok || !invoiceData?.invoice?.id)
        throw new HttpError(invoiceResponse.status, invoiceData?.error || "invoice creation failed");
      invoice = invoiceData.invoice;
      invoiceId = invoice.id;
    }

    await Promise.all([
      sb(env, `advertiser_orders?id=eq.${c.order.id}&organization_id=eq.${ORG_ID}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "payment_pending",
          campaign_id: campaignId,
          invoice_id: invoiceId,
          accepted_at: now,
          updated_at: now,
        }),
      }),
      sb(env, `onboarding_tokens?id=eq.${c.token.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "used", used_at: now }),
      }),
    ]);

    await auditExternal(request, env, "agreement.accepted", c.agreement.id, {
      advertiser_order_id: c.order.id,
      executed_sha256: digest,
      invoice_id: invoiceId,
      payment_status: invoice?.status || "draft",
    });

    return json({
      ok: true,
      completed: true,
      order_status: "payment_pending",
      payment_status: invoice?.status || "draft",
      invoice: {
        id: invoiceId,
        status: invoice?.status || "draft",
        amount_due_cents: invoice?.amount_due_cents ?? Number(c.order.amount_cents),
        hosted_invoice_url: invoice?.hosted_invoice_url || null,
      },
      executed_url: `/api/onboarding/advertiser/executed?token=${encodeURIComponent(c.rawToken)}`,
    });
  } catch (error) {
    return json({ error: error.message || "server error" }, error.status || 500);
  }
}

export async function executedAdvertiserAgreement(request, env) {
  try {
    const c = await readContext(env, new URL(request.url).searchParams.get("token"));
    if (!c.agreement.signed_at || !c.agreement.executed_storage_key)
      throw new HttpError(404, "executed order not available");
    const object = await env.MEDIA.get(c.agreement.executed_storage_key);
    if (!object) throw new HttpError(404, "executed order file not found");
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType || "text/html; charset=utf-8",
        "content-disposition": 'inline; filename="CoastLoop-Advertising-Order.html"',
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return json({ error: error.message || "server error" }, error.status || 500);
  }
}
