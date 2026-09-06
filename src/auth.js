const ORG_ID = "28ad55e4-d32d-423b-80b5-481bd15dec9e";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

async function bodyJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function bearer(request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
}

function authBase(env) {
  return String(env.SUPABASE_AUTH_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
}

async function rest(env, path, options = {}) {
  const headers = {
    apikey: env.SUPABASE_SECRET_KEY,
    authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    "content-type": "application/json",
    ...(options.headers || {}),
  };
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(data?.message || data?.msg || `Supabase ${res.status}`);
  return data;
}

async function authRequest(env, path, options = {}) {
  const headers = {
    apikey: env.SUPABASE_SECRET_KEY,
    "content-type": "application/json",
    ...(options.headers || {}),
  };
  const res = await fetch(`${authBase(env)}/auth/v1/${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { res, data };
}

async function authUserFromToken(env, token) {
  if (!token) return null;
  const { res, data } = await authRequest(env, "user", {
    headers: { authorization: `Bearer ${token}` },
  });
  return res.ok ? data : null;
}

async function upsertProfile(env, user) {
  const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || null;
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  await rest(env, "user_profiles?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: user.id,
      email: String(user.email || "").toLowerCase(),
      full_name: fullName,
      avatar_url: avatarUrl,
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

async function claimInvitations(env, user) {
  if (!user?.email) return;
  const email = String(user.email).trim().toLowerCase();
  const now = new Date().toISOString();
  const invites = await rest(
    env,
    `user_invitations?organization_id=eq.${ORG_ID}&email=eq.${encodeURIComponent(email)}&status=eq.pending&expires_at=gt.${encodeURIComponent(now)}&select=*`
  );

  for (const invite of invites || []) {
    if (invite.account_type === "internal") {
      await rest(env, "organization_members?on_conflict=organization_id,user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          organization_id: ORG_ID,
          user_id: user.id,
          role: invite.role,
        }),
      });
    } else if (invite.account_type === "business" && invite.business_id) {
      await rest(env, "business_members?on_conflict=business_id,user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          business_id: invite.business_id,
          user_id: user.id,
          role: invite.role,
          updated_at: now,
        }),
      });
    }

    await rest(env, `user_invitations?id=eq.${invite.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "accepted",
        accepted_by: user.id,
        accepted_at: now,
        updated_at: now,
      }),
    });
  }
}

async function accessForUser(env, user, claim = true) {
  if (claim) await claimInvitations(env, user);
  await upsertProfile(env, user);

  const [internalRows, businessRows, businesses] = await Promise.all([
    rest(env, `organization_members?organization_id=eq.${ORG_ID}&user_id=eq.${user.id}&select=role`),
    rest(env, `business_members?user_id=eq.${user.id}&select=business_id,role`),
    rest(env, `businesses?organization_id=eq.${ORG_ID}&select=id,name,category`),
  ]);

  const businessMap = new Map((businesses || []).map(x => [x.id, x]));
  return {
    internal_role: internalRows?.[0]?.role || null,
    businesses: (businessRows || []).map(m => ({
      business_id: m.business_id,
      business_name: businessMap.get(m.business_id)?.name || "Business",
      category: businessMap.get(m.business_id)?.category || null,
      role: m.role,
    })),
  };
}

export async function requireUserAccess(request, env) {
  const token = bearer(request);
  if (!token || token === env.ADMIN_TOKEN) return null;
  const user = await authUserFromToken(env, token);
  if (!user) return null;
  const access = await accessForUser(env, user);
  if (!access.internal_role && !access.businesses.length) return null;
  return { token, user, access };
}

export async function requireAdminAccess(request, env) {
  const token = bearer(request);
  if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN)
    return { legacy: true, role: "owner", user: null, access: { internal_role: "owner", businesses: [] } };

  const auth = await requireUserAccess(request, env);
  if (!auth || !["owner", "admin"].includes(auth.access.internal_role)) return null;
  return auth;
}

async function loginWithPassword(env, email, password) {
  const { res, data } = await authRequest(env, "token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return { error: data?.error_description || data?.msg || data?.message || "Invalid email or password", status: res.status };

  const user = data.user || await authUserFromToken(env, data.access_token);
  if (!user) return { error: "Could not load user", status: 401 };
  const access = await accessForUser(env, user);
  if (!access.internal_role && !access.businesses.length)
    return { error: "This CoastLoop account has no assigned access yet.", status: 403 };

  return {
    session: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: data.expires_at,
      token_type: data.token_type || "bearer",
    },
    user: { id: user.id, email: user.email, full_name: user.user_metadata?.full_name || user.user_metadata?.name || null },
    access,
  };
}

async function bootstrapStatus(env) {
  const owners = await rest(env, `organization_members?organization_id=eq.${ORG_ID}&role=eq.owner&select=user_id`);
  return { bootstrap_required: !(owners || []).length };
}

async function bootstrapOwner(request, env) {
  if (!env.ADMIN_TOKEN || bearer(request) !== env.ADMIN_TOKEN)
    return json({ error: "Legacy admin token required for first-owner setup" }, 401);

  const status = await bootstrapStatus(env);
  if (!status.bootstrap_required) return json({ error: "Owner account already exists" }, 409);

  const b = await bodyJson(request);
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const fullName = String(b.full_name || "").trim().slice(0, 180);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Valid email required" }, 400);
  if (password.length < 10) return json({ error: "Password must be at least 10 characters" }, 400);

  const { res, data } = await authRequest(env, "admin/users", {
    method: "POST",
    headers: { authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || "CoastLoop Owner" },
      app_metadata: { coastloop: true },
    }),
  });
  if (!res.ok) return json({ error: data?.msg || data?.message || "Could not create owner" }, res.status);

  const user = data.user || data;
  await rest(env, "organization_members?on_conflict=organization_id,user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ organization_id: ORG_ID, user_id: user.id, role: "owner" }),
  });

  const logged = await loginWithPassword(env, email, password);
  if (logged.error) return json({ error: logged.error }, logged.status || 500);
  return json({ ok: true, ...logged });
}

async function authLogin(request, env) {
  const b = await bodyJson(request);
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const logged = await loginWithPassword(env, email, password);
  if (logged.error) return json({ error: logged.error }, logged.status || 401);
  return json({ ok: true, ...logged });
}

async function authSignup(request, env) {
  const b = await bodyJson(request);
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const fullName = String(b.full_name || "").trim().slice(0, 180);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Valid email required" }, 400);
  if (password.length < 10) return json({ error: "Password must be at least 10 characters" }, 400);

  const now = new Date().toISOString();
  const invites = await rest(env, `user_invitations?organization_id=eq.${ORG_ID}&email=eq.${encodeURIComponent(email)}&status=eq.pending&expires_at=gt.${encodeURIComponent(now)}&select=id`);
  if (!(invites || []).length) return json({ error: "An invitation is required" }, 403);

  const { res, data } = await authRequest(env, "signup", {
    method: "POST",
    body: JSON.stringify({ email, password, data: { full_name: fullName || null } }),
  });
  if (!res.ok) return json({ error: data?.msg || data?.message || "Could not activate account" }, res.status);

  if (!data?.access_token)
    return json({ ok: true, confirmation_required: true, message: "Check your email to confirm your CoastLoop account." });

  const user = data.user || await authUserFromToken(env, data.access_token);
  const access = await accessForUser(env, user);
  return json({
    ok: true,
    session: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: data.expires_at,
      token_type: data.token_type || "bearer",
    },
    user: { id: user.id, email: user.email, full_name: user.user_metadata?.full_name || null },
    access,
  });
}

async function authRefresh(request, env) {
  const b = await bodyJson(request);
  const refreshToken = String(b.refresh_token || "");
  if (!refreshToken) return json({ error: "refresh token required" }, 400);

  const { res, data } = await authRequest(env, "token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return json({ error: "Session expired" }, 401);

  const user = data.user || await authUserFromToken(env, data.access_token);
  const access = await accessForUser(env, user);
  if (!access.internal_role && !access.businesses.length) return json({ error: "Access removed" }, 403);

  return json({
    ok: true,
    session: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: data.expires_at,
      token_type: data.token_type || "bearer",
    },
    user: { id: user.id, email: user.email, full_name: user.user_metadata?.full_name || user.user_metadata?.name || null },
    access,
  });
}

async function authMe(request, env) {
  const auth = await requireUserAccess(request, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  return json({
    ok: true,
    user: { id: auth.user.id, email: auth.user.email, full_name: auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || null },
    access: auth.access,
  });
}

async function authPassword(request, env) {
  const token = bearer(request);
  const user = await authUserFromToken(env, token);
  if (!user) return json({ error: "unauthorized" }, 401);
  const b = await bodyJson(request);
  const password = String(b.password || "");
  if (password.length < 10) return json({ error: "Password must be at least 10 characters" }, 400);

  const { res, data } = await authRequest(env, "user", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return json({ error: data?.msg || data?.message || "Could not update password" }, res.status);
  return json({ ok: true });
}

async function authRecover(request, env) {
  const b = await bodyJson(request);
  const email = String(b.email || "").trim().toLowerCase();
  if (email) {
    await authRequest(env, `recover?redirect_to=${encodeURIComponent("https://coastloop.site/reset-password")}`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }
  return json({ ok: true, message: "If that account exists, a recovery email is on the way." });
}

async function authLogout(request, env) {
  const token = bearer(request);
  if (token) {
    await authRequest(env, "logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
  }
  return json({ ok: true });
}

async function authConfig(env) {
  const status = await bootstrapStatus(env);
  return {
    ...status,
    google_enabled: String(env.GOOGLE_AUTH_ENABLED || "").toLowerCase() === "true",
    auth_host: (() => { try { return new URL(authBase(env)).hostname; } catch { return null; } })(),
  };
}

export async function handleAuthRoute(request, env, url) {
  if (!url.pathname.startsWith("/api/auth/")) return null;

  if (url.pathname === "/api/auth/config" && request.method === "GET")
    return json(await authConfig(env));
  if (url.pathname === "/api/auth/bootstrap-status" && request.method === "GET")
    return json(await bootstrapStatus(env));
  if (url.pathname === "/api/auth/bootstrap-owner" && request.method === "POST")
    return bootstrapOwner(request, env);
  if (url.pathname === "/api/auth/login" && request.method === "POST")
    return authLogin(request, env);
  if (url.pathname === "/api/auth/signup" && request.method === "POST")
    return authSignup(request, env);
  if (url.pathname === "/api/auth/refresh" && request.method === "POST")
    return authRefresh(request, env);
  if (url.pathname === "/api/auth/me" && request.method === "GET")
    return authMe(request, env);
  if (url.pathname === "/api/auth/password" && request.method === "PUT")
    return authPassword(request, env);
  if (url.pathname === "/api/auth/recover" && request.method === "POST")
    return authRecover(request, env);
  if (url.pathname === "/api/auth/logout" && request.method === "POST")
    return authLogout(request, env);
  if (url.pathname === "/api/auth/google" && request.method === "GET") {
    if (String(env.GOOGLE_AUTH_ENABLED || "").toLowerCase() !== "true")
      return json({ error: "Google sign-in is not enabled yet" }, 503);
    const target = new URL(`${authBase(env)}/auth/v1/authorize`);
    target.searchParams.set("provider", "google");
    target.searchParams.set("redirect_to", "https://coastloop.site/auth-callback");
    return Response.redirect(target.toString(), 302);
  }

  return json({ error: "not found" }, 404);
}

export async function adminUserDirectory(env) {
  const [profiles, internal, businessMembers, businesses, invites] = await Promise.all([
    rest(env, "user_profiles?select=*&order=created_at.asc"),
    rest(env, `organization_members?organization_id=eq.${ORG_ID}&select=user_id,role,created_at`),
    rest(env, "business_members?select=business_id,user_id,role,created_at"),
    rest(env, `businesses?organization_id=eq.${ORG_ID}&select=id,name,category`),
    rest(env, `user_invitations?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`),
  ]);

  const businessMap = new Map((businesses || []).map(x => [x.id, x]));
  const internalMap = new Map((internal || []).map(x => [x.user_id, x.role]));
  const businessByUser = new Map();
  for (const m of businessMembers || []) {
    if (!businessByUser.has(m.user_id)) businessByUser.set(m.user_id, []);
    businessByUser.get(m.user_id).push({
      business_id: m.business_id,
      business_name: businessMap.get(m.business_id)?.name || "Business",
      role: m.role,
    });
  }

  return {
    users: (profiles || []).map(p => ({
      user_id: p.user_id,
      email: p.email,
      full_name: p.full_name,
      last_login_at: p.last_login_at,
      created_at: p.created_at,
      internal_role: internalMap.get(p.user_id) || null,
      businesses: businessByUser.get(p.user_id) || [],
    })),
    invitations: invites || [],
  };
}

export async function createUserInvitation(request, env, adminAuth) {
  const b = await bodyJson(request);
  const email = String(b.email || "").trim().toLowerCase();
  const accountType = String(b.account_type || "business");
  const role = String(b.role || "viewer");
  const businessId = b.business_id ? String(b.business_id) : null;

  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Valid email required" }, 400);
  const internalRoles = new Set(["owner", "admin", "sales", "creative", "viewer"]);
  const businessRoles = new Set(["owner", "manager", "viewer"]);
  if (accountType === "internal") {
    if (!internalRoles.has(role)) return json({ error: "Invalid internal role" }, 400);
  } else if (accountType === "business") {
    if (!businessId || !businessRoles.has(role)) return json({ error: "Business and valid role required" }, 400);
    const business = await rest(env, `businesses?id=eq.${businessId}&organization_id=eq.${ORG_ID}&select=id`);
    if (!business?.[0]) return json({ error: "Business not found" }, 404);
  } else {
    return json({ error: "Invalid account type" }, 400);
  }

  await rest(env, `user_invitations?organization_id=eq.${ORG_ID}&email=eq.${encodeURIComponent(email)}&status=eq.pending`, {
    method: "PATCH",
    body: JSON.stringify({ status: "revoked", updated_at: new Date().toISOString() }),
  });

  const created = await rest(env, "user_invitations", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      business_id: accountType === "business" ? businessId : null,
      email,
      account_type: accountType,
      role,
      invited_by: adminAuth?.user?.id || null,
    }),
  });

  let emailSent = false;
  let emailError = null;
  if (String(env.AUTH_INVITE_EMAILS_ENABLED || "").toLowerCase() === "true") {
    const { res, data } = await authRequest(env, `invite?redirect_to=${encodeURIComponent("https://coastloop.site/set-password")}`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
      body: JSON.stringify({ email, data: { coastloop_invite: true } }),
    });
    emailSent = res.ok;
    if (!res.ok) emailError = data?.msg || data?.message || "Invite email failed";
  }

  return json({ ok: true, invitation: created?.[0] || null, email_sent: emailSent, email_error: emailError });
}

export async function portalOverview(request, env) {
  const auth = await requireUserAccess(request, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const businessIds = new Set(auth.access.businesses.map(x => x.business_id));
  if (!businessIds.size)
    return json({ ok: true, user: { email: auth.user.email }, access: auth.access, businesses: [] });

  const [businesses, locations, campaigns, screens, plays] = await Promise.all([
    rest(env, `businesses?organization_id=eq.${ORG_ID}&select=id,name,category`),
    rest(env, `locations?organization_id=eq.${ORG_ID}&select=id,business_id,name,address_line1,city,state,host_status`),
    rest(env, `campaigns?organization_id=eq.${ORG_ID}&select=id,advertiser_business_id,name,status,starts_at,ends_at`),
    rest(env, `screens?organization_id=eq.${ORG_ID}&select=id,location_id,name,status,last_seen_at,app_version,display_width,display_height,is_test`),
    rest(env, `playback_daily?organization_id=eq.${ORG_ID}&select=screen_id,campaign_id,play_date,play_count,seconds_played,last_played_at`),
  ]);

  const screenMap = new Map((screens || []).map(x => [x.id, x]));
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const result = (businesses || []).filter(b => businessIds.has(b.id)).map(b => {
    const bizLocations = (locations || []).filter(l => l.business_id === b.id);
    const locationIds = new Set(bizLocations.map(l => l.id));
    const bizScreens = (screens || []).filter(s => locationIds.has(s.location_id) && !s.is_test);
    const bizCampaigns = (campaigns || []).filter(c => c.advertiser_business_id === b.id);

    const locationData = bizLocations.map(l => {
      const locScreens = bizScreens.filter(s => s.location_id === l.id);
      const ids = new Set(locScreens.map(s => s.id));
      const locPlays = (plays || []).filter(p => ids.has(p.screen_id));
      return {
        ...l,
        screens: locScreens.map(s => ({
          ...s,
          online: Boolean(s.last_seen_at && now - new Date(s.last_seen_at).getTime() < 120000),
          plays_today: locPlays.filter(p => p.screen_id === s.id && p.play_date === today).reduce((n,p) => n + Number(p.play_count || 0), 0),
          last_played_at: locPlays.filter(p => p.screen_id === s.id).map(p => p.last_played_at).filter(Boolean).sort().pop() || null,
        })),
      };
    });

    const campaignData = bizCampaigns.map(c => {
      const rows = (plays || []).filter(p => p.campaign_id === c.id && !screenMap.get(p.screen_id)?.is_test);
      return {
        ...c,
        plays: rows.reduce((n,p) => n + Number(p.play_count || 0), 0),
        seconds_played: rows.reduce((n,p) => n + Number(p.seconds_played || 0), 0),
        screen_count: new Set(rows.map(p => p.screen_id).filter(Boolean)).size,
        last_played_at: rows.map(p => p.last_played_at).filter(Boolean).sort().pop() || null,
      };
    });

    return {
      id: b.id,
      name: b.name,
      category: b.category,
      member_role: auth.access.businesses.find(x => x.business_id === b.id)?.role || "viewer",
      is_host: locationData.length > 0,
      is_advertiser: campaignData.length > 0,
      locations: locationData,
      campaigns: campaignData,
    };
  });

  return json({
    ok: true,
    user: { id: auth.user.id, email: auth.user.email, full_name: auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || null },
    access: auth.access,
    businesses: result,
  });
}


export async function updateUserAccess(request, env, adminAuth, userId) {
  const b = await bodyJson(request);
  const allowedInternal = new Set(["owner","admin","sales","creative","viewer"]);
  const allowedBusiness = new Set(["owner","manager","viewer"]);

  const current = await rest(
    env,
    `organization_members?organization_id=eq.${ORG_ID}&user_id=eq.${userId}&select=role`
  );
  const currentRole = current?.[0]?.role || null;

  // Never let the signed-in owner accidentally remove their own ownership.
  if (adminAuth?.user?.id === userId && currentRole === "owner" && b.internal_role !== "owner")
    return json({ error: "You cannot remove your own owner access." }, 400);

  if (b.internal_role !== undefined) {
    if (b.internal_role === null || b.internal_role === "") {
      await rest(
        env,
        `organization_members?organization_id=eq.${ORG_ID}&user_id=eq.${userId}`,
        { method: "DELETE" }
      );
    } else {
      const role = String(b.internal_role);
      if (!allowedInternal.has(role))
        return json({ error: "Invalid internal role" }, 400);

      await rest(env, "organization_members?on_conflict=organization_id,user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          organization_id: ORG_ID,
          user_id: userId,
          role,
        }),
      });
    }
  }

  if (Array.isArray(b.businesses)) {
    const clean = [];

    for (const m of b.businesses) {
      const businessId = String(m.business_id || "");
      const role = String(m.role || "viewer");

      if (!businessId || !allowedBusiness.has(role))
        return json({ error: "Invalid business access" }, 400);

      const exists = await rest(
        env,
        `businesses?id=eq.${businessId}&organization_id=eq.${ORG_ID}&select=id`
      );
      if (!exists?.[0])
        return json({ error: "Business not found" }, 404);

      clean.push({ business_id: businessId, user_id: userId, role });
    }

    await rest(env, `business_members?user_id=eq.${userId}`, {
      method: "DELETE",
    });

    if (clean.length) {
      await rest(env, "business_members", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(clean),
      });
    }
  }

  return json({ ok: true });
}

export async function revokeUserInvitation(request, env, invitationId) {
  await rest(
    env,
    `user_invitations?id=eq.${invitationId}&organization_id=eq.${ORG_ID}&status=eq.pending`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "revoked",
        updated_at: new Date().toISOString(),
      }),
    }
  );
  return json({ ok: true });
}
