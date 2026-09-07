const ORG_ID = "28ad55e4-d32d-423b-80b5-481bd15dec9e";

async function rest(env, path, options = {}) {
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

  if (!res.ok)
    throw new Error(data?.message || `Supabase ${res.status}`);

  return data;
}

function clip(value, max) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function actorFromAuth(auth) {
  if (auth?.legacy) {
    return {
      actor_user_id: null,
      actor_type: "legacy_admin",
      actor_role: "owner",
    };
  }

  if (auth?.user?.id) {
    return {
      actor_user_id: auth.user.id,
      actor_type: "user",
      actor_role:
        auth?.access?.internal_role ||
        auth?.role ||
        null,
    };
  }

  return {
    actor_user_id: null,
    actor_type: "system",
    actor_role: auth?.role || null,
  };
}

function responseEntityId(data) {
  const candidates = [
    data?.id,
    data?.screen_id,
    data?.prospect?.id,
    data?.business?.id,
    data?.campaign?.id,
    data?.invitation?.id,
    data?.invoice?.id,
    data?.payout?.id,
    data?.broker_payout?.id,
    data?.host_payout?.id,
    data?.transaction?.id,
  ];

  const found = candidates.find(v => v !== undefined && v !== null && String(v).trim());
  return found === undefined ? null : String(found);
}

async function writeAuditEvent(request, env, auth, spec, statusCode, succeeded, responseData) {
  const actor = actorFromAuth(auth);
  const url = new URL(request.url);

  const metadata = {
    ...(spec.metadata || {}),
  };

  if (!succeeded && typeof responseData?.error === "string")
    metadata.response_error = responseData.error.slice(0, 200);

  const entityId =
    clip(spec.entity_id, 240) ||
    clip(responseEntityId(responseData), 240);

  await rest(env, "audit_events", {
    method: "POST",
    body: JSON.stringify({
      organization_id: ORG_ID,
      ...actor,
      action: clip(spec.action, 120),
      entity_type: clip(spec.entity_type, 80),
      entity_id: entityId,
      request_method: request.method,
      request_path: clip(url.pathname, 500),
      request_id: clip(
        request.headers.get("cf-ray") ||
        request.headers.get("x-request-id"),
        160
      ),
      status_code: statusCode,
      succeeded,
      metadata,
    }),
  });
}

async function safeWriteAuditEvent(...args) {
  try {
    await writeAuditEvent(...args);
  } catch (error) {
    console.error("AUDIT_WRITE_FAILED", error?.message || error);
  }
}

export async function auditMutation(request, env, auth, spec, operation) {
  let response;

  try {
    response = await operation();
  } catch (error) {
    await safeWriteAuditEvent(
      request,
      env,
      auth,
      spec,
      500,
      false,
      { error: "server error" }
    );
    throw error;
  }

  let data = null;
  try {
    data = await response.clone().json();
  } catch {}

  await safeWriteAuditEvent(
    request,
    env,
    auth,
    spec,
    response.status,
    response.ok,
    data
  );

  return response;
}

export async function adminAuditEvents(env, url) {
  const requested = Math.round(Number(url.searchParams.get("limit") || 75));
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(200, requested))
    : 75;

  return rest(
    env,
    `audit_events?organization_id=eq.${ORG_ID}` +
    `&select=id,actor_user_id,actor_type,actor_role,action,entity_type,entity_id,request_method,request_path,request_id,status_code,succeeded,metadata,created_at` +
    `&order=created_at.desc&limit=${limit}`
  );
}
