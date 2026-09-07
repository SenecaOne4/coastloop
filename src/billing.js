import { jsonBody } from "./request.js";
const ORG_ID = "28ad55e4-d32d-423b-80b5-481bd15dec9e";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const bodyJson = jsonBody;

async function sb(env, path, options = {}) {
  const headers = {
    apikey: env.SUPABASE_SECRET_KEY,
    "content-type": "application/json",
    ...(options.headers || {}),
  };
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(data?.message || `Supabase ${res.status}`);
  return data;
}

function cents(value, allowZero = true) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) return null;
  return n;
}

function isoFromUnix(value) {
  const n = Number(value || 0);
  return n > 0 ? new Date(n * 1000).toISOString() : null;
}

function requestKey(body, prefix) {
  const supplied = String(body.request_key || "").trim().slice(0, 255);
  return supplied || `${prefix}:${crypto.randomUUID()}`;
}

function stripeConfigured(env) {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function stripeWebhookConfigured(env) {
  return Boolean(env.STRIPE_WEBHOOK_SECRET);
}

async function stripeRequest(env, path, params = {}, key = null, method = "POST") {
  if (!stripeConfigured(env)) throw new Error("Stripe is not configured");

  const headers = {
    authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
  };
  let body;
  let url = `https://api.stripe.com/v1/${path}`;

  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    form.append(k, String(v));
  }

  if (method === "GET") {
    const query = form.toString();
    if (query) url += `?${query}`;
  } else {
    headers["content-type"] = "application/x-www-form-urlencoded";
    if (key) headers["idempotency-key"] = String(key).slice(0, 255);
    body = form.toString();
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Stripe ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

async function findInvoice(env, invoiceId) {
  const rows = await sb(
    env,
    `billing_invoices?id=eq.${encodeURIComponent(invoiceId)}&organization_id=eq.${ORG_ID}&select=*`
  );
  return rows?.[0] || null;
}

async function findInvoiceByStripeId(env, stripeInvoiceId) {
  if (!stripeInvoiceId) return null;
  const rows = await sb(
    env,
    `billing_invoices?organization_id=eq.${ORG_ID}&provider=eq.stripe&provider_invoice_id=eq.${encodeURIComponent(stripeInvoiceId)}&select=*`
  );
  return rows?.[0] || null;
}

async function stripeInvoiceForPaymentIntent(env, paymentIntentId) {
  if (!paymentIntentId) return null;

  const rows = await stripeRequest(env, "invoice_payments", {
    "payment[type]": "payment_intent",
    "payment[payment_intent]": paymentIntentId,
    limit: 10,
  }, null, "GET");

  const remoteInvoiceId = rows?.data?.find(x =>
    x?.invoice && x?.payment?.payment_intent === paymentIntentId
  )?.invoice;

  return remoteInvoiceId ? findInvoiceByStripeId(env, remoteInvoiceId) : null;
}

async function stripeInvoiceForPaymentObject(env, object) {
  let paymentIntentId = typeof object?.payment_intent === "string"
    ? object.payment_intent
    : object?.payment_intent?.id || null;

  if (!paymentIntentId && object?.charge) {
    const chargeId = typeof object.charge === "string"
      ? object.charge
      : object.charge?.id;
    if (chargeId) {
      const charge = await stripeRequest(
        env,
        `charges/${encodeURIComponent(chargeId)}`,
        {},
        null,
        "GET"
      );
      paymentIntentId = typeof charge?.payment_intent === "string"
        ? charge.payment_intent
        : charge?.payment_intent?.id || null;
    }
  }

  return stripeInvoiceForPaymentIntent(env, paymentIntentId);
}

async function upsertStripeAdjustment(
  env,
  invoice,
  providerTransactionId,
  providerEventId,
  kind,
  amountCents,
  currency,
  status,
  note
) {
  if (!invoice || !providerTransactionId) return false;

  const existing = await sb(
    env,
    `billing_transactions?organization_id=eq.${ORG_ID}&provider=eq.stripe&provider_transaction_id=eq.${encodeURIComponent(providerTransactionId)}&select=*`
  );

  const payload = {
    provider_event_id: providerEventId || null,
    kind,
    status,
    amount_cents: Math.max(0, Number(amountCents || 0)),
    currency: String(currency || invoice.currency || "usd").toLowerCase(),
    payment_method: "stripe",
    occurred_at: new Date().toISOString(),
    note: String(note || "").slice(0, 1000) || null,
  };

  if (existing?.[0]) {
    await sb(env, `billing_transactions?id=eq.${existing[0].id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return true;
  }

  await sb(env, "billing_transactions", {
    method: "POST",
    body: JSON.stringify({
      organization_id: ORG_ID,
      invoice_id: invoice.id,
      campaign_id: invoice.campaign_id,
      advertiser_business_id: invoice.advertiser_business_id,
      provider: "stripe",
      provider_transaction_id: providerTransactionId,
      ...payload,
    }),
  });

  return true;
}

async function stripeCustomerForBusiness(env, business) {
  let rows = await sb(
    env,
    `billing_customers?organization_id=eq.${ORG_ID}&business_id=eq.${business.id}&provider=eq.stripe&select=*`
  );
  let row = rows?.[0] || null;
  if (row?.provider_customer_id) return row;

  const customer = await stripeRequest(env, "customers", {
    name: business.name,
    email: business.email || undefined,
    "metadata[coastloop_business_id]": business.id,
  }, `coastloop:customer:${business.id}`);

  if (row) {
    rows = await sb(env, `billing_customers?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        provider_customer_id: customer.id,
        updated_at: new Date().toISOString(),
      }),
    });
    return rows?.[0] || row;
  }

  rows = await sb(env, "billing_customers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      business_id: business.id,
      provider: "stripe",
      provider_customer_id: customer.id,
      status: "active",
    }),
  });
  return rows?.[0] || null;
}


async function advanceAdvertiserOrderAfterInvoicePaid(env, invoice) {
  if (!invoice || invoice.status !== "paid") return;

  const orders = await sb(
    env,
    `advertiser_orders?organization_id=eq.${ORG_ID}&invoice_id=eq.${encodeURIComponent(invoice.id)}&select=*&limit=1`
  );
  const order = orders?.[0];
  if (!order) return;

  const now = invoice.paid_at || new Date().toISOString();
  const firstPaidTransition = order.status !== "paid";

  if (firstPaidTransition) {
    await sb(env, `advertiser_orders?id=eq.${order.id}&organization_id=eq.${ORG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "paid",
        paid_at: now,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  const existingTasks = await sb(
    env,
    `onboarding_tasks?organization_id=eq.${ORG_ID}&advertiser_order_id=eq.${order.id}&task_type=eq.creative_intake&select=id&limit=1`
  );

  if (!existingTasks?.[0]) {
    const agreements = await sb(
      env,
      `agreement_instances?organization_id=eq.${ORG_ID}&advertiser_order_id=eq.${order.id}&select=id&order=created_at.desc&limit=1`
    );

    await sb(env, "onboarding_tasks", {
      method: "POST",
      body: JSON.stringify({
        organization_id: ORG_ID,
        task_type: "creative_intake",
        status: "open",
        business_id: order.advertiser_business_id,
        advertiser_order_id: order.id,
        agreement_instance_id: agreements?.[0]?.id || null,
        campaign_id: order.campaign_id || invoice.campaign_id || null,
        metadata: {
          source: "confirmed_payment",
          invoice_id: invoice.id,
        },
      }),
    });
  }

  if (firstPaidTransition) {
    try {
      await sb(env, "audit_events", {
        method: "POST",
        body: JSON.stringify({
          organization_id: ORG_ID,
          actor_user_id: null,
          actor_type: "system",
          actor_role: "billing_reconciliation",
          action: "advertiser_order.paid",
          entity_type: "advertiser_order",
          entity_id: String(order.id),
          request_method: "POST",
          request_path: "/internal/billing/reconcile",
          request_id: null,
          status_code: 200,
          succeeded: true,
          metadata: {
            invoice_id: invoice.id,
            campaign_id: order.campaign_id || invoice.campaign_id || null,
          },
        }),
      });
    } catch (error) {
      console.error("ORDER_PAID_AUDIT_FAILED", error?.message || error);
    }
  }
}

async function reconcileInvoice(env, invoice) {
  const tx = await sb(
    env,
    `billing_transactions?organization_id=eq.${ORG_ID}&invoice_id=eq.${invoice.id}&status=eq.succeeded&select=kind,amount_cents`
  );

  let paid = 0;
  let refunded = 0;
  for (const row of tx || []) {
    if (row.kind === "payment") paid += Number(row.amount_cents || 0);
    if (row.kind === "refund") refunded += Number(row.amount_cents || 0);
  }

  const total = Number(invoice.total_cents || 0);
  const due = Math.max(0, total - paid);
  let status = invoice.status;

  if (paid >= total && total > 0 && !["void","uncollectible"].includes(status))
    status = "paid";
  else if (status === "paid" && paid < total)
    status = "open";

  const patch = {
    amount_paid_cents: paid,
    amount_due_cents: due,
    amount_refunded_cents: refunded,
    status,
    paid_at: status === "paid" ? (invoice.paid_at || new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  };

  const rows = await sb(env, `billing_invoices?id=eq.${invoice.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return rows?.[0] || { ...invoice, ...patch };
}

export async function billingConfig(env) {
  return {
    stripe_configured: stripeConfigured(env),
    stripe_webhook_configured: stripeWebhookConfigured(env),
    currency: "usd",
    collection_model: "hosted_invoice",
  };
}

export async function adminBillingInvoices(env) {
  return await sb(
    env,
    `billing_invoices?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`
  );
}

export async function adminBillingTransactions(env) {
  return await sb(
    env,
    `billing_transactions?organization_id=eq.${ORG_ID}&select=*&order=occurred_at.desc`
  );
}

export async function adminBillingPayouts(env) {
  const [broker, host] = await Promise.all([
    sb(env, `broker_payouts?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`),
    sb(env, `host_payouts?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`),
  ]);
  return { broker: broker || [], host: host || [] };
}

export async function createBillingInvoice(request, env, actorUserId = null) {
  const b = await bodyJson(request);
  const campaignId = String(b.campaign_id || "").trim();
  if (!campaignId) return json({ error: "campaign required" }, 400);

  const campaigns = await sb(
    env,
    `campaigns?id=eq.${encodeURIComponent(campaignId)}&organization_id=eq.${ORG_ID}&select=*`
  );
  const campaign = campaigns?.[0];
  if (!campaign) return json({ error: "campaign not found" }, 404);

  const businesses = await sb(
    env,
    `businesses?id=eq.${campaign.advertiser_business_id}&organization_id=eq.${ORG_ID}&is_advertiser=eq.true&select=*`
  );
  const business = businesses?.[0];
  if (!business) return json({ error: "advertiser business not found" }, 404);

  const amount = cents(
    b.total_cents === undefined || b.total_cents === ""
      ? campaign.price_cents
      : b.total_cents,
    false
  );
  if (amount === null) return json({ error: "invoice amount must be greater than zero" }, 400);

  const provider = b.provider === "stripe" ? "stripe" : "manual";
  if (provider === "stripe" && !stripeConfigured(env))
    return json({ error: "Stripe is not configured yet" }, 503);
  if (provider === "stripe" && !business.email)
    return json({ error: "advertiser email is required for Stripe invoicing" }, 400);

  const days = Math.max(1, Math.min(365, Math.round(Number(b.days_until_due || 15))));
  const key = requestKey(b, "invoice");

  const existing = await sb(
    env,
    `billing_invoices?organization_id=eq.${ORG_ID}&request_key=eq.${encodeURIComponent(key)}&select=*`
  );
  if (existing?.[0])
    return json({ ok: true, invoice: existing[0], idempotent: true });

  const created = await sb(env, "billing_invoices", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      campaign_id: campaign.id,
      advertiser_business_id: business.id,
      provider,
      status: "draft",
      collection_method: provider === "stripe" ? "send_invoice" : "manual",
      currency: "usd",
      subtotal_cents: amount,
      tax_cents: 0,
      total_cents: amount,
      amount_paid_cents: 0,
      amount_due_cents: amount,
      amount_refunded_cents: 0,
      due_at: new Date(Date.now() + days * 86400000).toISOString(),
      created_by: actorUserId,
      request_key: key,
    }),
  });

  let invoice = created?.[0];
  if (!invoice) return json({ error: "invoice could not be created" }, 500);
  if (provider !== "stripe") return json({ ok: true, invoice });

  const customerRow = await stripeCustomerForBusiness(env, business);
  const stripeInvoice = await stripeRequest(env, "invoices", {
    customer: customerRow.provider_customer_id,
    collection_method: "send_invoice",
    days_until_due: days,
    auto_advance: "false",
    description: `CoastLoop — ${campaign.name}`,
    "metadata[coastloop_invoice_id]": invoice.id,
    "metadata[coastloop_campaign_id]": campaign.id,
    "metadata[coastloop_business_id]": business.id,
  }, `coastloop:invoice:${invoice.id}`);

  const item = await stripeRequest(env, "invoiceitems", {
    customer: customerRow.provider_customer_id,
    invoice: stripeInvoice.id,
    amount,
    currency: "usd",
    description: campaign.name,
    "metadata[coastloop_invoice_id]": invoice.id,
    "metadata[coastloop_campaign_id]": campaign.id,
  }, `coastloop:invoice-item:${invoice.id}`);

  const patched = await sb(env, `billing_invoices?id=eq.${invoice.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      provider_customer_id: customerRow.provider_customer_id,
      provider_invoice_id: stripeInvoice.id,
      provider_invoice_item_id: item.id,
      invoice_number: stripeInvoice.number || null,
      updated_at: new Date().toISOString(),
    }),
  });

  invoice = patched?.[0] || invoice;
  return json({ ok: true, invoice });
}

export async function sendBillingInvoice(request, env, invoiceId) {
  let invoice = await findInvoice(env, invoiceId);
  if (!invoice) return json({ error: "invoice not found" }, 404);
  if (invoice.status !== "draft") {
    if (invoice.sent_at || ["open","paid","uncollectible"].includes(invoice.status))
      return json({ ok: true, invoice, idempotent: true });
    return json({ error: "only draft invoices can be sent" }, 409);
  }

  const now = new Date().toISOString();

  if (invoice.provider === "stripe") {
    if (!stripeConfigured(env))
      return json({ error: "Stripe is not configured" }, 503);
    if (!invoice.provider_invoice_id)
      return json({ error: "Stripe invoice is incomplete" }, 409);

    const remote = await stripeRequest(
      env,
      `invoices/${encodeURIComponent(invoice.provider_invoice_id)}/send`,
      {},
      `coastloop:send:${invoice.id}`
    );

    const rows = await sb(env, `billing_invoices?id=eq.${invoice.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: remote.status || "open",
        invoice_number: remote.number || invoice.invoice_number,
        subtotal_cents: Number(remote.subtotal ?? invoice.subtotal_cents),
        total_cents: Number(remote.total ?? invoice.total_cents),
        amount_paid_cents: Number(remote.amount_paid ?? invoice.amount_paid_cents),
        amount_due_cents: Number(remote.amount_remaining ?? remote.amount_due ?? invoice.amount_due_cents),
        due_at: isoFromUnix(remote.due_date) || invoice.due_at,
        hosted_invoice_url: remote.hosted_invoice_url || null,
        invoice_pdf_url: remote.invoice_pdf || null,
        sent_at: now,
        paid_at: isoFromUnix(remote.status_transitions?.paid_at),
        updated_at: now,
      }),
    });
    return json({ ok: true, invoice: rows?.[0] || invoice });
  }

  const rows = await sb(env, `billing_invoices?id=eq.${invoice.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "open",
      sent_at: now,
      updated_at: now,
    }),
  });
  return json({ ok: true, invoice: rows?.[0] || invoice });
}

async function recordManualTransaction(request, env, invoiceId, kind, actorUserId) {
  const b = await bodyJson(request);
  const invoice = await findInvoice(env, invoiceId);
  if (!invoice) return json({ error: "invoice not found" }, 404);
  if (invoice.status === "void")
    return json({ error: "void invoice cannot accept transactions" }, 409);

  let defaultAmount = Number(invoice.amount_due_cents || 0);
  if (kind === "refund")
    defaultAmount = Math.max(0,
      Number(invoice.amount_paid_cents || 0) - Number(invoice.amount_refunded_cents || 0)
    );

  const amount = cents(
    b.amount_cents === undefined || b.amount_cents === "" ? defaultAmount : b.amount_cents,
    false
  );
  if (amount === null) return json({ error: "transaction amount must be greater than zero" }, 400);

  if (invoice.provider !== "manual")
    return json({ error: "Stripe invoices must be reconciled through Stripe" }, 409);

  const key = requestKey(b, kind);
  const existing = await sb(
    env,
    `billing_transactions?organization_id=eq.${ORG_ID}&request_key=eq.${encodeURIComponent(key)}&select=*`
  );
  if (existing?.[0])
    return json({ ok: true, transaction: existing[0], invoice, idempotent: true });

  if (kind === "payment") {
    if (invoice.status !== "open")
      return json({ error: "only open invoices can accept manual payments" }, 409);
    if (amount > Number(invoice.amount_due_cents || 0))
      return json({ error: "payment exceeds invoice amount due" }, 400);
  }

  if (kind === "refund") {
    if (invoice.status !== "paid")
      return json({ error: "only paid invoices can be refunded" }, 409);
    const refundable = Math.max(
      0,
      Number(invoice.amount_paid_cents || 0) -
      Number(invoice.amount_refunded_cents || 0)
    );
    if (amount > refundable)
      return json({ error: "refund exceeds refundable amount" }, 400);
  }

  const rows = await sb(env, "billing_transactions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      invoice_id: invoice.id,
      campaign_id: invoice.campaign_id,
      advertiser_business_id: invoice.advertiser_business_id,
      provider: "manual",
      kind,
      status: "succeeded",
      amount_cents: amount,
      currency: invoice.currency || "usd",
      payment_method: String(b.payment_method || "").slice(0, 80) || null,
      occurred_at: b.occurred_at || new Date().toISOString(),
      note: String(b.note || "").slice(0, 1000) || null,
      created_by: actorUserId,
      request_key: key,
    }),
  });

  const nextInvoice = await reconcileInvoice(env, invoice);
  await advanceAdvertiserOrderAfterInvoicePaid(env, nextInvoice);
  return json({ ok: true, transaction: rows?.[0] || null, invoice: nextInvoice });
}

export function recordBillingPayment(request, env, invoiceId, actorUserId = null) {
  return recordManualTransaction(request, env, invoiceId, "payment", actorUserId);
}

export function recordBillingRefund(request, env, invoiceId, actorUserId = null) {
  return recordManualTransaction(request, env, invoiceId, "refund", actorUserId);
}

export async function createBrokerPayout(request, env, actorUserId = null) {
  const b = await bodyJson(request);
  const brokerUserId = String(b.broker_user_id || "").trim();
  const amount = cents(b.amount_cents, false);
  if (!brokerUserId || amount === null)
    return json({ error: "broker and positive amount required" }, 400);

  const key = requestKey(b, "broker-payout");
  const existing = await sb(
    env,
    `broker_payouts?organization_id=eq.${ORG_ID}&request_key=eq.${encodeURIComponent(key)}&select=*`
  );
  if (existing?.[0])
    return json({ ok: true, payout: existing[0], idempotent: true });

  const broker = await sb(
    env,
    `organization_members?organization_id=eq.${ORG_ID}&user_id=eq.${encodeURIComponent(brokerUserId)}&role=eq.broker&select=user_id`
  );
  if (!broker?.[0]) return json({ error: "broker not found" }, 404);

  const finance = await billingFinanceSnapshot(env, brokerUserId);
  const available = Math.max(
    0,
    Number(finance.broker_payout_due_cents || 0) -
    Number(finance.broker_payout_scheduled_cents || 0)
  );
  if (amount > available)
    return json({ error: "payout exceeds earned commission available" }, 400);

  const rows = await sb(env, "broker_payouts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      broker_user_id: brokerUserId,
      period_start: b.period_start || null,
      period_end: b.period_end || null,
      amount_cents: amount,
      status: "due",
      note: String(b.note || "").slice(0, 1000) || null,
      created_by: actorUserId,
      request_key: key,
    }),
  });
  return json({ ok: true, payout: rows?.[0] || null });
}

export async function createHostPayout(request, env, actorUserId = null) {
  const b = await bodyJson(request);
  const businessId = String(b.business_id || "").trim();
  const amount = cents(b.amount_cents, false);
  if (!businessId || amount === null)
    return json({ error: "host business and positive amount required" }, 400);

  const key = requestKey(b, "host-payout");
  const existing = await sb(
    env,
    `host_payouts?organization_id=eq.${ORG_ID}&request_key=eq.${encodeURIComponent(key)}&select=*`
  );
  if (existing?.[0])
    return json({ ok: true, payout: existing[0], idempotent: true });

  const business = await sb(
    env,
    `businesses?id=eq.${encodeURIComponent(businessId)}&organization_id=eq.${ORG_ID}&is_host=eq.true&select=id`
  );
  if (!business?.[0]) return json({ error: "host business not found" }, 404);

  const locationId = String(b.location_id || "").trim() || null;
  const screenId = String(b.screen_id || "").trim() || null;

  if (locationId) {
    const loc = await sb(
      env,
      `locations?id=eq.${encodeURIComponent(locationId)}&organization_id=eq.${ORG_ID}&business_id=eq.${businessId}&select=id`
    );
    if (!loc?.[0]) return json({ error: "location does not belong to host" }, 400);
  }

  if (screenId) {
    const screen = await sb(
      env,
      `screens?id=eq.${encodeURIComponent(screenId)}&organization_id=eq.${ORG_ID}&select=id,location_id`
    );
    if (!screen?.[0]) return json({ error: "screen not found" }, 404);
    if (!screen[0].location_id)
      return json({ error: "screen is not assigned to a host location" }, 400);
    if (locationId && screen[0].location_id !== locationId)
      return json({ error: "screen does not belong to selected location" }, 400);

    const screenLocation = await sb(
      env,
      `locations?id=eq.${encodeURIComponent(screen[0].location_id)}&organization_id=eq.${ORG_ID}&business_id=eq.${businessId}&select=id`
    );
    if (!screenLocation?.[0])
      return json({ error: "screen does not belong to selected host" }, 400);
  }

  const rows = await sb(env, "host_payouts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      business_id: businessId,
      location_id: locationId,
      screen_id: screenId,
      period_start: b.period_start || null,
      period_end: b.period_end || null,
      amount_cents: amount,
      status: "due",
      note: String(b.note || "").slice(0, 1000) || null,
      created_by: actorUserId,
      request_key: key,
    }),
  });
  return json({ ok: true, payout: rows?.[0] || null });
}

async function updatePayout(request, env, table, payoutId) {
  const b = await bodyJson(request);
  const allowed = new Set(["due","approved","paid","void"]);
  if (!allowed.has(b.status))
    return json({ error: "invalid payout status" }, 400);

  const patch = {
    status: b.status,
    payment_reference: String(b.payment_reference || "").slice(0, 180) || null,
    paid_at: b.status === "paid" ? (b.paid_at || new Date().toISOString()) : null,
    note: b.note === undefined ? undefined : String(b.note || "").slice(0, 1000) || null,
    updated_at: new Date().toISOString(),
  };
  for (const k of Object.keys(patch))
    if (patch[k] === undefined) delete patch[k];

  const rows = await sb(
    env,
    `${table}?id=eq.${encodeURIComponent(payoutId)}&organization_id=eq.${ORG_ID}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    }
  );
  if (!rows?.[0]) return json({ error: "payout not found" }, 404);
  return json({ ok: true, payout: rows[0] });
}

export function updateBrokerPayout(request, env, payoutId) {
  return updatePayout(request, env, "broker_payouts", payoutId);
}

export function updateHostPayout(request, env, payoutId) {
  return updatePayout(request, env, "host_payouts", payoutId);
}

function hex(bytes) {
  return [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function verifyStripeSignature(raw, signature, secret) {
  const parts = String(signature || "").split(",");
  const timestamp = parts.find(x => x.startsWith("t="))?.slice(2);
  const signatures = parts.filter(x => x.startsWith("v1=")).map(x => x.slice(3));

  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${raw}`)
  );
  const expected = hex(new Uint8Array(digest));
  return signatures.some(sig => safeEqual(sig, expected));
}

async function recordStripePaymentFromInvoice(env, invoice, remote, eventId) {
  const stableTransactionId = `invoice:${remote.id}:paid`;
  const existing = await sb(
    env,
    `billing_transactions?organization_id=eq.${ORG_ID}&provider=eq.stripe&provider_transaction_id=eq.${encodeURIComponent(stableTransactionId)}&select=id`
  );

  const amount = Math.max(0, Number(remote.amount_paid || 0));
  if (!amount) return;

  const payload = {
    provider_event_id: eventId,
    status: "succeeded",
    amount_cents: amount,
    currency: remote.currency || invoice.currency || "usd",
    payment_method: "stripe",
    occurred_at: isoFromUnix(remote.status_transitions?.paid_at) || new Date().toISOString(),
    note: "Stripe invoice paid",
  };

  if (existing?.[0]) {
    await sb(env, `billing_transactions?id=eq.${existing[0].id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return;
  }

  await sb(env, "billing_transactions", {
    method: "POST",
    body: JSON.stringify({
      organization_id: ORG_ID,
      invoice_id: invoice.id,
      campaign_id: invoice.campaign_id,
      advertiser_business_id: invoice.advertiser_business_id,
      provider: "stripe",
      provider_transaction_id: stableTransactionId,
      kind: "payment",
      ...payload,
    }),
  });
}

async function syncStripeInvoice(env, remote, eventId = null) {
  let invoice = await findInvoiceByStripeId(env, remote.id);
  if (!invoice && remote.metadata?.coastloop_invoice_id)
    invoice = await findInvoice(env, remote.metadata.coastloop_invoice_id);
  if (!invoice) return false;

  const patch = {
    provider_customer_id: typeof remote.customer === "string" ? remote.customer : invoice.provider_customer_id,
    provider_invoice_id: remote.id,
    invoice_number: remote.number || invoice.invoice_number,
    status: ["draft","open","paid","void","uncollectible"].includes(remote.status)
      ? remote.status : invoice.status,
    subtotal_cents: Number(remote.subtotal ?? invoice.subtotal_cents),
    total_cents: Number(remote.total ?? invoice.total_cents),
    amount_paid_cents: Number(remote.amount_paid ?? invoice.amount_paid_cents),
    amount_due_cents: Number(remote.amount_remaining ?? remote.amount_due ?? invoice.amount_due_cents),
    hosted_invoice_url: remote.hosted_invoice_url || invoice.hosted_invoice_url,
    invoice_pdf_url: remote.invoice_pdf || invoice.invoice_pdf_url,
    due_at: isoFromUnix(remote.due_date) || invoice.due_at,
    sent_at: remote.status !== "draft" ? (invoice.sent_at || new Date().toISOString()) : invoice.sent_at,
    paid_at: isoFromUnix(remote.status_transitions?.paid_at) || invoice.paid_at,
    voided_at: isoFromUnix(remote.status_transitions?.voided_at) || invoice.voided_at,
    updated_at: new Date().toISOString(),
  };

  await sb(env, `billing_invoices?id=eq.${invoice.id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  if (eventId && remote.status === "paid")
    await recordStripePaymentFromInvoice(env, { ...invoice, ...patch }, remote, eventId);

  if (remote.status === "paid")
    await advanceAdvertiserOrderAfterInvoicePaid(env, { ...invoice, ...patch });

  return true;
}

export async function stripeWebhook(request, env) {
  if (!stripeWebhookConfigured(env))
    return json({ error: "Stripe webhook is not configured" }, 503);

  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  const valid = await verifyStripeSignature(raw, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return json({ error: "invalid signature" }, 400);

  let event;
  try { event = JSON.parse(raw); }
  catch { return json({ error: "invalid payload" }, 400); }

  const eventId = String(event.id || "");
  const eventType = String(event.type || "");
  if (!eventId || !eventType) return json({ error: "invalid event" }, 400);

  const existing = await sb(
    env,
    `billing_webhook_events?provider=eq.stripe&provider_event_id=eq.${encodeURIComponent(eventId)}&select=*`
  );
  if (["processed","ignored"].includes(existing?.[0]?.status))
    return json({ ok: true, duplicate: true });

  if (!existing?.[0]) {
    await sb(env, "billing_webhook_events", {
      method: "POST",
      body: JSON.stringify({
        provider: "stripe",
        provider_event_id: eventId,
        event_type: eventType,
        livemode: Boolean(event.livemode),
        status: "received",
      }),
    });
  }

  try {
    let handled = false;
    const obj = event?.data?.object || {};

    if (eventType.startsWith("invoice.")) {
      handled = await syncStripeInvoice(env, obj, eventType === "invoice.paid" ? eventId : null);
    }

    if (
      eventType === "refund.created" ||
      eventType === "refund.updated" ||
      eventType === "refund.failed"
    ) {
      const invoice = await stripeInvoiceForPaymentObject(env, obj);
      if (invoice) {
        const status = obj.status === "succeeded"
          ? "succeeded"
          : obj.status === "failed"
            ? "failed"
            : obj.status === "canceled"
              ? "canceled"
              : "pending";

        handled = await upsertStripeAdjustment(
          env,
          invoice,
          obj.id,
          eventId,
          "refund",
          obj.amount,
          obj.currency,
          status,
          "Stripe refund"
        );
      }
    }

    if (
      eventType === "charge.dispute.created" ||
      eventType === "charge.dispute.funds_withdrawn" ||
      eventType === "charge.dispute.funds_reinstated" ||
      eventType === "charge.dispute.closed"
    ) {
      const invoice = await stripeInvoiceForPaymentObject(env, obj);
      if (invoice) {
        let status = "succeeded";
        if (eventType === "charge.dispute.funds_reinstated" || obj.status === "won")
          status = "canceled";
        if (obj.status === "warning_closed")
          status = "canceled";

        handled = await upsertStripeAdjustment(
          env,
          invoice,
          obj.id,
          eventId,
          "chargeback",
          obj.amount,
          obj.currency,
          status,
          `Stripe dispute ${obj.status || eventType}`
        );
      }
    }

    await sb(
      env,
      `billing_webhook_events?provider=eq.stripe&provider_event_id=eq.${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: handled ? "processed" : "ignored",
          processed_at: new Date().toISOString(),
          error: null,
        }),
      }
    );

    return json({ ok: true, handled });
  } catch (error) {
    await sb(
      env,
      `billing_webhook_events?provider=eq.stripe&provider_event_id=eq.${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "failed",
          error: String(error?.message || error).slice(0, 1000),
        }),
      }
    ).catch(() => null);
    return json({ error: "webhook processing failed" }, 500);
  }
}

export async function billingFinanceSnapshot(env, brokerId = null) {
  const campaignScope = brokerId
    ? `&broker_user_id=eq.${encodeURIComponent(brokerId)}`
    : "";

  const campaigns = await sb(
    env,
    `campaigns?organization_id=eq.${ORG_ID}${campaignScope}&select=id,broker_user_id,broker_commission_percent`
  );
  const campaignMap = new Map((campaigns || []).map(c => [c.id, c]));
  const ids = new Set(campaignMap.keys());

  const [allInvoices, allTransactions, brokerPayouts, hostPayouts] = await Promise.all([
    sb(env, `billing_invoices?organization_id=eq.${ORG_ID}&select=*`),
    sb(env, `billing_transactions?organization_id=eq.${ORG_ID}&status=eq.succeeded&select=*`),
    sb(env, `broker_payouts?organization_id=eq.${ORG_ID}${brokerId ? `&broker_user_id=eq.${encodeURIComponent(brokerId)}` : ""}&select=*`),
    brokerId ? Promise.resolve([]) :
      sb(env, `host_payouts?organization_id=eq.${ORG_ID}&select=*`),
  ]);

  const invoices = (allInvoices || []).filter(x => ids.has(x.campaign_id));
  const transactions = (allTransactions || []).filter(x => ids.has(x.campaign_id));

  const invoicedCents = invoices
    .filter(x => ["open","paid","uncollectible"].includes(x.status))
    .reduce((n, x) => n + Number(x.total_cents || 0), 0);

  const receivableCents = invoices
    .filter(x => x.status === "open")
    .reduce((n, x) => n + Number(x.amount_due_cents || 0), 0);

  let collected = 0;
  let refunded = 0;
  let chargebacks = 0;
  const netByCampaign = new Map();

  for (const t of transactions) {
    const amount = Number(t.amount_cents || 0);
    let delta = 0;
    if (t.kind === "payment") { collected += amount; delta = amount; }
    if (t.kind === "refund") { refunded += amount; delta = -amount; }
    if (t.kind === "chargeback") { chargebacks += amount; delta = -amount; }
    netByCampaign.set(t.campaign_id, (netByCampaign.get(t.campaign_id) || 0) + delta);
  }

  const netCollected = collected - refunded - chargebacks;

  let earnedCommission = 0;
  for (const [campaignId, net] of netByCampaign) {
    const campaign = campaignMap.get(campaignId);
    earnedCommission += Math.round(
      net * Number(campaign?.broker_commission_percent || 0) / 100
    );
  }

  const brokerPaid = (brokerPayouts || [])
    .filter(x => x.status === "paid")
    .reduce((n, x) => n + Number(x.amount_cents || 0), 0);

  const brokerApproved = (brokerPayouts || [])
    .filter(x => ["due","approved"].includes(x.status))
    .reduce((n, x) => n + Number(x.amount_cents || 0), 0);

  const hostPaid = (hostPayouts || [])
    .filter(x => x.status === "paid")
    .reduce((n, x) => n + Number(x.amount_cents || 0), 0);

  const hostDue = (hostPayouts || [])
    .filter(x => ["due","approved"].includes(x.status))
    .reduce((n, x) => n + Number(x.amount_cents || 0), 0);

  return {
    invoiced_cents: invoicedCents,
    collected_cents: collected,
    refunded_cents: refunded,
    chargeback_cents: chargebacks,
    net_collected_cents: netCollected,
    receivable_cents: receivableCents,
    broker_commission_earned_cents: earnedCommission,
    broker_payout_due_cents: Math.max(0, earnedCommission - brokerPaid),
    broker_payout_scheduled_cents: brokerApproved,
    broker_payout_paid_cents: brokerPaid,
    broker_overpaid_cents: Math.max(0, brokerPaid - earnedCommission),
    host_payout_due_cents: hostDue,
    host_payout_paid_cents: hostPaid,
  };
}
