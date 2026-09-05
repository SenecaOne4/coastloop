const ORG_ID = "28ad55e4-d32d-423b-80b5-481bd15dec9e";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

async function bodyJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function requireAdmin(request, env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(env.ADMIN_TOKEN && token === env.ADMIN_TOKEN);
}

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

  if (!res.ok) {
    console.error("SUPABASE", res.status, path);
    throw new Error(data?.message || `Supabase ${res.status}`);
  }
  return data;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(x => x.toString(16).padStart(2, "0")).join("");
}

function pairCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map(x => alphabet[x % alphabet.length]).join("");
}

async function getScreen(env, deviceId) {
  const rows = await sb(
    env,
    `screens?device_id=eq.${encodeURIComponent(deviceId)}&select=*`
  );
  return rows?.[0] || null;
}

async function validateDevice(env, deviceId, deviceKey) {
  if (!deviceId || !deviceKey) return null;
  const screen = await getScreen(env, deviceId);
  if (!screen?.device_key_hash) return null;
  const hash = await sha256Hex(deviceKey);
  return hash === screen.device_key_hash ? screen : null;
}

async function bootPlayer(request, env) {
  const b = await bodyJson(request);
  if (!b.device_id) return json({ error: "device_id required" }, 400);

  let screen = await getScreen(env, b.device_id);

  if (!screen) {
    const deviceKey = randomHex(32);
    const code = pairCode();
    const created = await sb(env, "screens", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_ID,
        name: "Unpaired screen",
        status: "unpaired",
        pairing_code: code,
        pairing_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        device_key_hash: await sha256Hex(deviceKey),
        last_seen_at: new Date().toISOString(),
        app_version: b.app_version || "0.3.0",
        display_width: Number.isFinite(b.width) ? b.width : null,
        display_height: Number.isFinite(b.height) ? b.height : null,
        device_id: b.device_id,
      }),
    });

    screen = created[0];
    return json({
      screen_id: screen.id,
      paired: false,
      pair_code: screen.pairing_code,
      name: screen.name,
      status: screen.status,
      device_key: deviceKey,
    });
  }

  if (!b.device_key || await sha256Hex(b.device_key) !== screen.device_key_hash)
    return json({ error: "invalid device key" }, 401);

  const updated = await sb(env, `screens?id=eq.${screen.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      last_seen_at: new Date().toISOString(),
      app_version: b.app_version || screen.app_version,
      display_width: Number.isFinite(b.width) ? b.width : screen.display_width,
      display_height: Number.isFinite(b.height) ? b.height : screen.display_height,
    }),
  });

  screen = updated[0] || screen;

  return json({
    screen_id: screen.id,
    paired: Boolean(screen.paired_at),
    pair_code: screen.pairing_code,
    name: screen.name,
    status: screen.status,
  });
}

async function playerConfig(request, env) {
  const b = await bodyJson(request);
  const deviceId = String(b.device_id || "").trim();
  const deviceKey = String(b.device_key || "");
  const screen = await validateDevice(env, deviceId, deviceKey);

  if (!screen) return json({ error: "invalid device" }, 401);

  await sb(env, `screens?id=eq.${screen.id}`, {
    method: "PATCH",
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  });

  if (!screen.paired_at)
    return json({ paired: false, pair_code: screen.pairing_code, items: [] });

  const assignments = await sb(
    env,
    `screen_playlist_assignments?screen_id=eq.${screen.id}&select=*&order=priority.desc,created_at.desc`
  );

  const now = Date.now();
  const assignment = (assignments || []).find(a =>
    (!a.starts_at || new Date(a.starts_at).getTime() <= now) &&
    (!a.ends_at || new Date(a.ends_at).getTime() > now)
  );

  if (!assignment)
    return json({
      paired: true,
      screen: { id: screen.id, name: screen.name },
      playlist: null,
      items: [],
    });

  const playlists = await sb(
    env,
    `playlists?id=eq.${assignment.playlist_id}&select=*`
  );
  const playlist = playlists?.[0];

  if (!playlist)
    return json({ paired: true, playlist: null, items: [] });

  const items = await sb(
    env,
    `playlist_items?playlist_id=eq.${playlist.id}&active=eq.true&select=*&order=position.asc`
  );
  const media = await sb(
    env,
    `media_assets?organization_id=eq.${ORG_ID}&status=eq.ready&select=*`
  );
  const mediaMap = new Map((media || []).map(m => [m.id, m]));

  const activeItems = (items || [])
    .filter(i =>
      (!i.starts_at || new Date(i.starts_at).getTime() <= now) &&
      (!i.ends_at || new Date(i.ends_at).getTime() > now)
    )
    .map(i => {
      const m = mediaMap.get(i.media_asset_id);
      if (!m) return null;
      return {
        item_id: i.id,
        position: i.position,
        duration_seconds: i.display_seconds || m.duration_seconds || 15,
        media_id: m.id,
        name: m.title,
        media_type: m.kind,
        mime_type: m.mime_type,
        campaign_id: i.campaign_id,
        url: `/media/${m.id}`,
      };
    })
    .filter(Boolean);

  return json({
    paired: true,
    screen: { id: screen.id, name: screen.name },
    playlist: {
      id: playlist.id,
      name: playlist.name,
      revision: playlist.version,
    },
    items: activeItems,
  }, 200, { "cache-control": "no-store" });
}

async function heartbeat(request, env) {
  const b = await bodyJson(request);
  const screen = await validateDevice(env, b.device_id, b.device_key);
  if (!screen) return json({ error: "invalid device" }, 401);

  await sb(env, `screens?id=eq.${screen.id}`, {
    method: "PATCH",
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  });
  return json({ ok: true });
}

async function proof(request, env) {
  const b = await bodyJson(request);
  const screen = await validateDevice(env, b.device_id, b.device_key);
  if (!screen || !b.media_id) return json({ error: "invalid proof" }, 401);

  const stamp = new Date().toISOString();
  const seconds = Math.max(0, Number(b.seconds || 0));

  await sb(env, "rpc/record_playback_atomic", {
    method: "POST",
    body: JSON.stringify({
      p_organization_id: ORG_ID,
      p_play_date: stamp.slice(0, 10),
      p_screen_id: screen.id,
      p_media_asset_id: b.media_id,
      p_campaign_id: b.campaign_id || null,
      p_seconds: seconds,
      p_stamp: stamp,
    }),
  });

  return json({ ok: true });
}

async function mediaLookup(env, mediaId) {
  const rows = await sb(
    env,
    `media_assets?id=eq.${mediaId}&organization_id=eq.${ORG_ID}&select=*`
  );
  return rows?.[0] || null;
}

async function serveMedia(env, mediaId) {
  const row = await mediaLookup(env, mediaId);
  if (!row?.storage_key) return new Response("Not found", { status: 404 });

  const object = await env.MEDIA.get(row.storage_key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

async function adminScreens(env) {
  const [screens, assignments, playlists, plays, locations, businesses] = await Promise.all([
    sb(env, `screens?organization_id=eq.${ORG_ID}&select=*&order=last_seen_at.desc.nullslast`),
    sb(env, `screen_playlist_assignments?organization_id=eq.${ORG_ID}&select=*&order=priority.desc,created_at.desc`),
    sb(env, `playlists?organization_id=eq.${ORG_ID}&select=id,name`),
    sb(env, `playback_daily?organization_id=eq.${ORG_ID}&select=screen_id,play_date,play_count,seconds_played,first_played_at,last_played_at`),
    sb(env, `locations?organization_id=eq.${ORG_ID}&select=id,business_id,name,address_line1,city,state`),
    sb(env, `businesses?organization_id=eq.${ORG_ID}&select=id,name`)
  ]);

  const pmap = new Map((playlists || []).map(p => [p.id, p.name]));
  const lmap = new Map((locations || []).map(l => [l.id, l]));
  const bmap = new Map((businesses || []).map(b => [b.id, b]));
  const today = new Date().toISOString().slice(0, 10);

  return (screens || []).map(screen => {
    const assignment = (assignments || []).find(x => x.screen_id === screen.id);
    const location = screen.location_id ? lmap.get(screen.location_id) : null;
    const business = location?.business_id ? bmap.get(location.business_id) : null;
    const rows = (plays || []).filter(p => p.screen_id === screen.id);
    const todayRows = rows.filter(p => p.play_date === today);

    const sum = (list, key) =>
      list.reduce((n, row) => n + Number(row[key] || 0), 0);

    const lastPlay = rows.reduce((latest, row) => {
      if (!row.last_played_at) return latest;
      if (!latest || new Date(row.last_played_at) > new Date(latest))
        return row.last_played_at;
      return latest;
    }, null);

    return {
      ...screen,
      pair_code: screen.pairing_code,
      playlist_id: assignment?.playlist_id || null,
      playlist_name: assignment ? pmap.get(assignment.playlist_id) : null,

      location_name: location?.name || business?.name || null,
      business_name: business?.name || null,
      address: location
        ? [location.address_line1, location.city, location.state].filter(Boolean).join(", ")
        : null,

      plays_today: sum(todayRows, "play_count"),
      seconds_today: sum(todayRows, "seconds_played"),
      plays_total: sum(rows, "play_count"),
      seconds_total: sum(rows, "seconds_played"),
      last_played_at: lastPlay,
    };
  });
}

async function adminMedia(env) {
  const rows = await sb(
    env,
    `media_assets?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`
  );
  return (rows || []).map(m => ({
    ...m,
    name: m.title,
    media_type: m.kind,
    bytes: m.byte_size || 0,
  }));
}

async function uploadMedia(request, env) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "file required" }, 400);

  const kind = file.type.startsWith("video/")
    ? "video"
    : file.type.startsWith("image/")
      ? "image"
      : null;

  if (!kind) return json({ error: "only image/video files supported" }, 400);

  const id = crypto.randomUUID();
  const ext = (file.name.split(".").pop() || "bin")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  const key = `media/${id}.${ext}`;

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const duration = Math.max(
    1,
    Math.min(300, Number(form.get("duration_seconds") || (kind === "image" ? 15 : 30)))
  );

  const rows = await sb(env, "media_assets", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      title: file.name,
      kind,
      storage_key: key,
      original_filename: file.name,
      mime_type: file.type,
      byte_size: file.size,
      duration_seconds: duration,
      status: "ready",
    }),
  });

  return json({ ok: true, id: rows?.[0]?.id });
}

async function listPlaylists(env) {
  const playlists = await sb(
    env,
    `playlists?organization_id=eq.${ORG_ID}&select=*&order=updated_at.desc`
  );
  const items = await sb(
    env,
    `playlist_items?organization_id=eq.${ORG_ID}&select=*&order=position.asc`
  );
  const media = await adminMedia(env);
  const mmap = new Map(media.map(m => [m.id, m]));

  return (playlists || []).map(p => ({
    ...p,
    revision: p.version,
    items: (items || [])
      .filter(i => i.playlist_id === p.id)
      .map(i => {
        const m = mmap.get(i.media_asset_id);
        return {
          ...i,
          media_id: i.media_asset_id,
          name: m?.name || "Missing media",
          media_type: m?.media_type || "unknown",
          duration_seconds: i.display_seconds || m?.duration_seconds,
        };
      }),
  }));
}

async function createPlaylist(request, env) {
  const b = await bodyJson(request);
  const name = String(b.name || "").trim();
  if (!name) return json({ error: "name required" }, 400);

  const rows = await sb(env, "playlists", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      name,
      status: "active",
    }),
  });

  return json({ ok: true, id: rows?.[0]?.id });
}

async function setPlaylistItems(request, env, playlistId) {
  const b = await bodyJson(request);
  const items = Array.isArray(b.items) ? b.items : [];

  await sb(env, `playlist_items?playlist_id=eq.${playlistId}`, {
    method: "DELETE",
  });

  if (items.length) {
    await sb(env, "playlist_items", {
      method: "POST",
      body: JSON.stringify(items.map((item, position) => ({
        organization_id: ORG_ID,
        playlist_id: playlistId,
        media_asset_id: item.media_id,
        campaign_id: item.campaign_id || null,
        position,
        display_seconds: item.duration_seconds || null,
        active: true,
      }))),
    });
  }

  const p = await sb(env, `playlists?id=eq.${playlistId}&select=version`);
  await sb(env, `playlists?id=eq.${playlistId}`, {
    method: "PATCH",
    body: JSON.stringify({
      version: Number(p?.[0]?.version || 1) + 1,
      updated_at: new Date().toISOString(),
    }),
  });

  return json({ ok: true });
}

async function assignScreen(request, env, screenId) {
  const b = await bodyJson(request);

  await sb(env, `screens?id=eq.${screenId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: String(b.name || "CoastLoop Screen").trim(),
      status: "active",
      paired_at: new Date().toISOString(),
    }),
  });

  await sb(env, `screen_playlist_assignments?screen_id=eq.${screenId}`, {
    method: "DELETE",
  });

  if (b.playlist_id) {
    await sb(env, "screen_playlist_assignments", {
      method: "POST",
      body: JSON.stringify({
        organization_id: ORG_ID,
        screen_id: screenId,
        playlist_id: b.playlist_id,
        priority: 100,
      }),
    });
  }

  return json({ ok: true });
}


async function createPublicLead(request, env) {
  const b = await bodyJson(request);

  // Honeypot: bots can fill this; humans never see it.
  if (String(b.company_fax || "").trim())
    return json({ ok: true });

  const name = String(b.business_name || b.name || "").trim().slice(0, 180);
  const contactName = String(b.contact_name || "").trim().slice(0, 180);
  const phone = String(b.phone || "").trim().slice(0, 80);
  const email = String(b.email || "").trim().slice(0, 180);
  const notes = String(b.notes || "").trim().slice(0, 2000);
  const interest = String(b.interest || "advertiser").toLowerCase();

  if (!name || (!phone && !email))
    return json({ error: "business name and phone or email required" }, 400);

  const hostInterest = interest === "host" || interest === "both";
  const advertiserInterest = interest === "advertiser" || interest === "both";

  const rows = await sb(env, "prospects", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      name,
      category: String(b.category || "").trim().slice(0, 120) || null,
      stage: "new",
      host_interest: hostInterest,
      advertiser_interest: advertiserInterest,
      contact_name: contactName || null,
      phone: phone || null,
      email: email || null,
      website: String(b.website || "").trim().slice(0, 240) || null,
      city: String(b.city || "").trim().slice(0, 120) || null,
      state: String(b.state || "").trim().slice(0, 40) || null,
      postal_code: String(b.postal_code || "").trim().slice(0, 20) || null,
      source: "coastloop.site",
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }),
  });

  return json({ ok: true, id: rows?.[0]?.id });
}


async function geocodeUS(address) {
  if (!address) return null;
  try {
    const u = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
    u.searchParams.set("address", address);
    u.searchParams.set("benchmark", "Public_AR_Current");
    u.searchParams.set("format", "json");

    const res = await fetch(u.toString(), {
      headers: { "user-agent": "CoastLoop/0.5 (coastloop.site)" }
    });
    if (!res.ok) return null;

    const d = await res.json();
    const c = d?.result?.addressMatches?.[0]?.coordinates;
    if (!c || !Number.isFinite(Number(c.x)) || !Number.isFinite(Number(c.y)))
      return null;

    return { latitude: Number(c.y), longitude: Number(c.x) };
  } catch {
    return null;
  }
}

async function createAdminProspect(request, env) {
  const b = await bodyJson(request);
  const name = String(b.name || "").trim().slice(0, 180);

  if (!name)
    return json({ error: "business name required" }, 400);

  const addressLine1 = String(b.address_line1 || "").trim().slice(0, 200) || null;
  const city = String(b.city || "").trim().slice(0, 120) || null;
  const state = String(b.state || "").trim().slice(0, 40) || null;
  const postalCode = String(b.postal_code || "").trim().slice(0, 20) || null;

  let latitude = Number(b.latitude);
  let longitude = Number(b.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    latitude = null;
    longitude = null;

    const address = [addressLine1, city, state, postalCode].filter(Boolean).join(", ");
    if (addressLine1 && city && state) {
      const geo = await geocodeUS(address);
      if (geo) {
        latitude = geo.latitude;
        longitude = geo.longitude;
      }
    }
  }

  const rows = await sb(env, "prospects", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      name,
      category: String(b.category || "").trim().slice(0, 120) || null,
      stage: "new",
      host_interest: Boolean(b.host_interest),
      advertiser_interest: b.advertiser_interest !== false,
      score: b.score === undefined || b.score === "" ? null : Math.max(0, Math.min(100, Math.round(Number(b.score) || 0))),
      contact_name: String(b.contact_name || "").trim().slice(0, 180) || null,
      phone: String(b.phone || "").trim().slice(0, 80) || null,
      email: String(b.email || "").trim().slice(0, 180) || null,
      website: String(b.website || "").trim().slice(0, 240) || null,
      address_line1: addressLine1,
      city,
      state,
      postal_code: postalCode,
      latitude,
      longitude,
      source: String(b.source || "field").trim().slice(0, 120),
      notes: String(b.notes || "").trim().slice(0, 4000) || null,
      updated_at: new Date().toISOString(),
    }),
  });

  return json({ ok: true, prospect: rows?.[0] || null });
}

async function adminProspects(env) {
  return await sb(
    env,
    `prospects?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`
  );
}

async function updateProspect(request, env, prospectId) {
  const b = await bodyJson(request);
  const patch = { updated_at: new Date().toISOString() };

  if (b.stage !== undefined) {
    const allowed = new Set([
      "new","researched","contacted","follow_up","hot",
      "won","lost","do_not_contact"
    ]);
    if (!allowed.has(b.stage))
      return json({ error: "invalid stage" }, 400);
    patch.stage = b.stage;
  }

  if (b.score !== undefined) {
    const n = Number(b.score);
    if (!Number.isFinite(n) || n < 0 || n > 100)
      return json({ error: "invalid score" }, 400);
    patch.score = Math.round(n);
  }

  if (b.notes !== undefined)
    patch.notes = String(b.notes || "").slice(0, 4000) || null;

  if (b.next_follow_up_at !== undefined)
    patch.next_follow_up_at = b.next_follow_up_at || null;

  await sb(env, `prospects?id=eq.${prospectId}&organization_id=eq.${ORG_ID}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  return json({ ok: true });
}


async function adminBusinesses(env) {
  const businesses = await sb(
    env,
    `businesses?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`
  );
  const locations = await sb(
    env,
    `locations?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`
  );

  return (businesses || []).map(b => ({
    ...b,
    locations: (locations || []).filter(l => l.business_id === b.id),
  }));
}

async function promoteProspect(request, env, prospectId) {
  const rows = await sb(
    env,
    `prospects?id=eq.${prospectId}&organization_id=eq.${ORG_ID}&select=*`
  );
  const prospect = rows?.[0];
  if (!prospect) return json({ error: "prospect not found" }, 404);

  let existing = await sb(
    env,
    `businesses?organization_id=eq.${ORG_ID}&source_prospect_id=eq.${prospectId}&select=*`
  );

  let business = existing?.[0];

  if (!business) {
    const created = await sb(env, "businesses", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_ID,
        source_prospect_id: prospect.id,
        name: prospect.name,
        category: prospect.category,
        contact_name: prospect.contact_name,
        phone: prospect.phone,
        email: prospect.email,
        website: prospect.website,
        notes: prospect.notes,
      }),
    });
    business = created?.[0];
  }

  let location = null;

  if (business && prospect.host_interest && prospect.address_line1) {
    const found = await sb(
      env,
      `locations?organization_id=eq.${ORG_ID}&business_id=eq.${business.id}&address_line1=eq.${encodeURIComponent(prospect.address_line1)}&select=*`
    );

    location = found?.[0];

    if (!location) {
      const created = await sb(env, "locations", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          organization_id: ORG_ID,
          business_id: business.id,
          name: prospect.name,
          address_line1: prospect.address_line1,
          city: prospect.city,
          state: prospect.state,
          postal_code: prospect.postal_code,
          latitude: prospect.latitude,
          longitude: prospect.longitude,
          host_status: "negotiating",
        }),
      });
      location = created?.[0];
    }
  }

  await sb(env, `prospects?id=eq.${prospect.id}&organization_id=eq.${ORG_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      stage: "won",
      updated_at: new Date().toISOString(),
    }),
  });

  return json({ ok: true, business, location });
}

async function adminCampaigns(env) {
  return await sb(
    env,
    `campaigns?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`
  );
}

async function createCampaign(request, env) {
  const b = await bodyJson(request);
  const businessId = String(b.advertiser_business_id || "").trim();
  const name = String(b.name || "").trim().slice(0, 180);

  if (!businessId || !name)
    return json({ error: "advertiser business and campaign name required" }, 400);

  const business = await sb(
    env,
    `businesses?id=eq.${businessId}&organization_id=eq.${ORG_ID}&select=id`
  );
  if (!business?.[0])
    return json({ error: "business not found" }, 404);

  const allowed = new Set(["draft","scheduled","active","paused","completed","canceled"]);
  const status = allowed.has(b.status) ? b.status : "draft";

  const rows = await sb(env, "campaigns", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      advertiser_business_id: businessId,
      name,
      status,
      starts_at: b.starts_at || null,
      ends_at: b.ends_at || null,
      price_cents: b.price_cents === undefined || b.price_cents === ""
        ? null : Math.max(0, Math.round(Number(b.price_cents) || 0)),
      billing_notes: String(b.billing_notes || "").slice(0, 2000) || null,
      notes: String(b.notes || "").slice(0, 4000) || null,
      updated_at: new Date().toISOString(),
    }),
  });

  return json({ ok: true, campaign: rows?.[0] || null });
}


async function adminCampaignReports(env) {
  const [campaigns, businesses, plays] = await Promise.all([
    sb(env, `campaigns?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`),
    sb(env, `businesses?organization_id=eq.${ORG_ID}&select=id,name`),
    sb(env, `playback_daily?organization_id=eq.${ORG_ID}&campaign_id=not.is.null&select=campaign_id,screen_id,play_date,play_count,seconds_played,first_played_at,last_played_at&order=play_date.asc`)
  ]);

  const businessMap = new Map((businesses || []).map(b => [b.id, b]));
  const grouped = new Map();

  for (const row of plays || []) {
    if (!row.campaign_id) continue;

    if (!grouped.has(row.campaign_id)) {
      grouped.set(row.campaign_id, {
        plays: 0,
        seconds: 0,
        screens: new Set(),
        first_played_at: null,
        last_played_at: null,
        daily: new Map(),
      });
    }

    const g = grouped.get(row.campaign_id);
    g.plays += Number(row.play_count || 0);
    g.seconds += Number(row.seconds_played || 0);
    if (row.screen_id) g.screens.add(row.screen_id);

    if (row.first_played_at &&
        (!g.first_played_at || new Date(row.first_played_at) < new Date(g.first_played_at)))
      g.first_played_at = row.first_played_at;

    if (row.last_played_at &&
        (!g.last_played_at || new Date(row.last_played_at) > new Date(g.last_played_at)))
      g.last_played_at = row.last_played_at;

    const day = row.play_date;
    const d = g.daily.get(day) || { date: day, plays: 0, seconds: 0 };
    d.plays += Number(row.play_count || 0);
    d.seconds += Number(row.seconds_played || 0);
    g.daily.set(day, d);
  }

  return (campaigns || []).map(c => {
    const g = grouped.get(c.id);
    const business = businessMap.get(c.advertiser_business_id);

    return {
      campaign_id: c.id,
      campaign_name: c.name,
      advertiser_business_id: c.advertiser_business_id,
      advertiser_name: business?.name || null,
      status: c.status,
      price_cents: c.price_cents,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      plays: g?.plays || 0,
      seconds_played: g?.seconds || 0,
      screen_count: g?.screens?.size || 0,
      first_played_at: g?.first_played_at || null,
      last_played_at: g?.last_played_at || null,
      daily: g ? Array.from(g.daily.values()) : [],
    };
  });
}

async function stats(env) {
  const [screens, media, plays] = await Promise.all([
    sb(env, `screens?organization_id=eq.${ORG_ID}&select=id,last_seen_at`),
    sb(env, `media_assets?organization_id=eq.${ORG_ID}&status=eq.ready&select=id`),
    sb(env, `playback_daily?organization_id=eq.${ORG_ID}&select=play_count,last_played_at`),
  ]);

  const cutoff = Date.now() - 120000;
  const dayCutoff = Date.now() - 86400000;

  return {
    screens: screens?.length || 0,
    online: (screens || []).filter(s => s.last_seen_at && new Date(s.last_seen_at).getTime() > cutoff).length,
    media: media?.length || 0,
    plays_24h: (plays || [])
      .filter(p => p.last_played_at && new Date(p.last_played_at).getTime() > dayCutoff)
      .reduce((n, p) => n + Number(p.play_count || 0), 0),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health")
        return json({ ok: true, service: "coastloop", version: "0.10.0" });

      if (url.pathname === "/api/player/boot" && request.method === "POST")
        return bootPlayer(request, env);

      if (url.pathname === "/api/player/config" && request.method === "POST")
        return playerConfig(request, env);

      if (url.pathname === "/api/player/heartbeat" && request.method === "POST")
        return heartbeat(request, env);

      if (url.pathname === "/api/player/proof" && request.method === "POST")
        return proof(request, env);

      if (url.pathname.startsWith("/media/") && request.method === "GET")
        return serveMedia(env, url.pathname.split("/").pop());

      if (url.pathname === "/api/public/lead" && request.method === "POST")
        return createPublicLead(request, env);

      if (url.pathname.startsWith("/api/admin/")) {
        if (!requireAdmin(request, env))
          return json({ error: "unauthorized" }, 401);

        if (url.pathname === "/api/admin/stats" && request.method === "GET")
          return json(await stats(env));

        if (url.pathname === "/api/admin/screens" && request.method === "GET")
          return json(await adminScreens(env));

        if (url.pathname === "/api/admin/prospects" && request.method === "GET")
          return json(await adminProspects(env));

        if (url.pathname === "/api/admin/prospects" && request.method === "POST")
          return createAdminProspect(request, env);

        const promote = url.pathname.match(/^\/api\/admin\/prospects\/([^/]+)\/promote$/);
        if (promote && request.method === "POST")
          return promoteProspect(request, env, promote[1]);

        const prospect = url.pathname.match(/^\/api\/admin\/prospects\/([^/]+)$/);
        if (prospect && request.method === "PUT")
          return updateProspect(request, env, prospect[1]);

        if (url.pathname === "/api/admin/businesses" && request.method === "GET")
          return json(await adminBusinesses(env));

        if (url.pathname === "/api/admin/campaigns" && request.method === "GET")
          return json(await adminCampaigns(env));

        if (url.pathname === "/api/admin/reports/campaigns" && request.method === "GET")
          return json(await adminCampaignReports(env));

        if (url.pathname === "/api/admin/campaigns" && request.method === "POST")
          return createCampaign(request, env);

        if (url.pathname === "/api/admin/media" && request.method === "GET")
          return json(await adminMedia(env));

        if (url.pathname === "/api/admin/media" && request.method === "POST")
          return uploadMedia(request, env);

        if (url.pathname === "/api/admin/playlists" && request.method === "GET")
          return json(await listPlaylists(env));

        if (url.pathname === "/api/admin/playlists" && request.method === "POST")
          return createPlaylist(request, env);

        const assign = url.pathname.match(/^\/api\/admin\/screens\/([^/]+)\/assign$/);
        if (assign && request.method === "PUT")
          return assignScreen(request, env, assign[1]);

        const items = url.pathname.match(/^\/api\/admin\/playlists\/([^/]+)\/items$/);
        if (items && request.method === "PUT")
          return setPlaylistItems(request, env, items[1]);
      }

      return json({ error: "not found" }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "server error", detail: String(error?.message || error) }, 500);
    }
  },
};
