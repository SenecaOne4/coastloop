const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function authorized(request, env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(env.CREATIVE_WORKER_TOKEN && token === env.CREATIVE_WORKER_TOKEN);
}

async function rpc(env, name, body) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`creative rpc ${name}: ${res.status}`);
  return text ? JSON.parse(text) : null;
}

async function rest(env, path, options = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`creative rest: ${res.status}`);
  return text ? JSON.parse(text) : null;
}

async function cleanupAsset(env, orgId, assetId) {
  if (!assetId) return;
  const rows = await rest(env,
    `media_assets?id=eq.${encodeURIComponent(assetId)}&organization_id=eq.${encodeURIComponent(orgId)}&select=storage_key&limit=1`
  ).catch(() => []);
  if (rows?.[0]?.storage_key) await env.MEDIA.delete(rows[0].storage_key).catch(() => {});
  await rest(env,
    `media_assets?id=eq.${encodeURIComponent(assetId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    { method: "DELETE" }).catch(() => null);
}

export async function creativeWorkerApi(request, env, url, deps = {}) {
  if (!url.pathname.startsWith("/api/creative-worker/")) return null;
  if (!authorized(request, env)) return reply({ error: "unauthorized" }, 401);

  const sourcesMatch=url.pathname.match(/^\/api\/creative-worker\/([^/]+)\/sources$/);
  if(sourcesMatch && request.method==="GET"){
    const lease=request.headers.get("x-creative-lease")||"";
    const jobs=await rest(env,`creative_jobs?id=eq.${encodeURIComponent(sourcesMatch[1])}&organization_id=eq.${encodeURIComponent(deps.orgId)}&status=eq.claimed&lease_token=eq.${encodeURIComponent(lease)}&select=id,lease_expires_at&limit=1`);
    const job=jobs?.[0];
    if(!job || new Date(job.lease_expires_at)<=new Date()) return reply({error:"active lease required"},409);
    const links=await rest(env,`creative_job_sources?creative_job_id=eq.${encodeURIComponent(job.id)}&select=source_asset_id,role`);
    const ids=(links||[]).map(x=>x.source_asset_id);
    if(!ids.length) return reply({sources:[]});
    const assets=await rest(env,`advertiser_source_assets?id=in.(${ids.map(encodeURIComponent).join(",")})&organization_id=eq.${encodeURIComponent(deps.orgId)}&usage_status=eq.approved&select=id,title,asset_type,original_filename,mime_type,byte_size`);
    const roles=new Map((links||[]).map(x=>[x.source_asset_id,x.role]));
    return reply({sources:(assets||[]).map(a=>({...a,role:roles.get(a.id)||"other"}))});
  }

  const sourceMatch=url.pathname.match(/^\/api\/creative-worker\/([^/]+)\/source\/([^/]+)$/);
  if(sourceMatch && request.method==="GET"){
    const lease=request.headers.get("x-creative-lease")||"";
    const jobs=await rest(env,`creative_jobs?id=eq.${encodeURIComponent(sourceMatch[1])}&organization_id=eq.${encodeURIComponent(deps.orgId)}&status=eq.claimed&lease_token=eq.${encodeURIComponent(lease)}&select=id,lease_expires_at&limit=1`);
    const job=jobs?.[0];
    if(!job || new Date(job.lease_expires_at)<=new Date()) return reply({error:"active lease required"},409);
    const links=await rest(env,`creative_job_sources?creative_job_id=eq.${encodeURIComponent(job.id)}&source_asset_id=eq.${encodeURIComponent(sourceMatch[2])}&select=source_asset_id&limit=1`);
    if(!links?.[0]) return reply({error:"source not attached"},404);
    const assets=await rest(env,`advertiser_source_assets?id=eq.${encodeURIComponent(sourceMatch[2])}&organization_id=eq.${encodeURIComponent(deps.orgId)}&usage_status=eq.approved&select=storage_key,mime_type,original_filename&limit=1`);
    const a=assets?.[0];
    if(!a) return reply({error:"source unavailable"},404);
    const obj=await env.MEDIA.get(a.storage_key);
    if(!obj) return reply({error:"source object missing"},404);
    return new Response(obj.body,{headers:{
      "content-type":a.mime_type||"application/octet-stream",
      "content-disposition":`attachment; filename="${String(a.original_filename||"source").replace(/"/g,"")}"`
    }});
  }

  if (url.pathname === "/api/creative-worker/claim" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const rows = await rpc(env, "claim_creative_job", {
      p_organization_id: deps.orgId,
      p_worker_id: String(b.worker_id || "local-worker").slice(0, 120),
      p_lease_seconds: 900,
    });
    return reply({ job: Array.isArray(rows) ? rows[0] || null : rows || null });
  }

  const m = url.pathname.match(/^\/api\/creative-worker\/([^/]+)\/(heartbeat|fail|result)$/);
  if (!m || request.method !== "POST") return reply({ error: "not found" }, 404);

  if (m[2] === "result") {
    const form = await request.formData();
    const leaseToken = String(form.get("lease_token") || "");
    const file = form.get("file");
    const deliveryFile = form.get("delivery_file");
    if (!leaseToken) return reply({ error: "lease_token required" }, 400);
    if (!(file instanceof File)) return reply({ error: "file required" }, 400);

    const renewed = await rpc(env, "heartbeat_creative_job", {
      p_job_id: m[1],
      p_lease_token: leaseToken,
      p_lease_seconds: 900,
    });
    if (renewed !== true) return reply({ error: "lease expired" }, 409);

    const jobs = await rest(
      env,
      `creative_jobs?id=eq.${encodeURIComponent(m[1])}&organization_id=eq.${encodeURIComponent(deps.orgId)}&status=eq.claimed&lease_token=eq.${encodeURIComponent(leaseToken)}&select=id,advertiser_business_id,job_type&limit=1`
    );
    const job = jobs?.[0];
    if (!job) return reply({ error: "active job not found" }, 409);

    if (job.job_type === "image" && !file.type.startsWith("image/"))
      return reply({ error: "image job requires image result" }, 400);
    if (job.job_type === "video" && !file.type.startsWith("video/"))
      return reply({ error: "video job requires video result" }, 400);

    const uploadForm = new FormData();
    uploadForm.set("file", file, file.name);
    if (job.advertiser_business_id)
      uploadForm.set("advertiser_business_id", job.advertiser_business_id);
    uploadForm.set("title", String(form.get("title") || file.name));
    if (job.job_type === "video") uploadForm.set("delivery_tier", "4k");
    for (const key of ["duration_seconds", "width", "height"]) {
      const value = form.get(key);
      if (value != null && String(value) !== "") uploadForm.set(key, String(value));
    }

    const uploadRequest = new Request(request.url, {
      method: "POST",
      body: uploadForm,
    });
    if (typeof deps.uploadMedia !== "function") return reply({ error: "upload unavailable" }, 500);
    const uploaded = await deps.uploadMedia(uploadRequest, env, null);
    const payload = await uploaded.clone().json().catch(() => null);
    if (!uploaded.ok || !payload?.id) return uploaded;

    let deliveryPayload = null;
    if (job.job_type === "video" && deliveryFile instanceof File) {
      const df = new FormData();
      df.set("file", deliveryFile, deliveryFile.name);
      if (job.advertiser_business_id) df.set("advertiser_business_id", job.advertiser_business_id);
      df.set("title", `${String(form.get("title") || file.name)} · 1080p`);
      df.set("duration_seconds", "15");
      df.set("width", "1920");
      df.set("height", "1080");
      df.set("parent_asset_id", payload.id);
      df.set("delivery_tier", "1080p");
      const dr = await deps.uploadMedia(new Request(request.url,{method:"POST",body:df}),env,null);
      deliveryPayload = await dr.clone().json().catch(()=>null);
      if (!dr.ok || !deliveryPayload?.id) {
        await cleanupAsset(env, deps.orgId, payload.id);
        return dr;
      }
    }

    const completed = await rpc(env, "complete_creative_job", {
      p_job_id: m[1],
      p_lease_token: leaseToken,
      p_output_asset_id: payload.id,
    });

    if (completed !== true) {
      await cleanupAsset(env, deps.orgId, deliveryPayload?.id);
      await cleanupAsset(env, deps.orgId, payload.id);
      return reply({ error: "lease expired before completion" }, 409);
    }

    return reply({ ok: true, asset_id: payload.id, delivery_asset_id: deliveryPayload?.id || null });
  }

  const b = await request.json().catch(() => ({}));
  if (!b.lease_token) return reply({ error: "lease_token required" }, 400);

  const args = { p_job_id: m[1], p_lease_token: b.lease_token };
  const name = m[2] === "heartbeat" ? "heartbeat_creative_job" : "fail_creative_job";

  if (m[2] === "heartbeat") args.p_lease_seconds = 900;
  else {
    args.p_error = String(b.error || "local render failed").slice(0, 2000);
    args.p_retry_seconds = 60;
  }

  const result = await rpc(env, name, args);
  return reply({ ok: result === true });
}
