import { auditMutation, adminAuditEvents } from "./audit.js";
import { jsonBody, validateJsonMutation } from "./request.js";
import {
  createVenueInvite,
  venueOnboardingSession,
  markVenueOnboardingViewed,
  acceptVenueOnboarding,
  executedVenueAgreement,
  adminOnboarding,
} from "./onboarding.js";
import {
  publicAdvertisingPackages,
  adminAdvertisingPackages,
  createAdvertisingPackage,
  startAdvertiserCheckout,
  advertiserCheckoutSession,
  acceptAdvertiserCheckout,
  executedAdvertiserAgreement,
} from "./advertiser-onboarding.js";
import {
  handleAuthRoute,
  requireAdminAccess,
  requireBrokerAccess,
  adminUserDirectory,
  createUserInvitation,
  updateUserAccess,
  revokeUserInvitation,
  portalOverview
} from "./auth.js";
import {
  billingConfig,
  adminBillingInvoices,
  adminBillingTransactions,
  adminBillingPayouts,
  createBillingInvoice,
  sendBillingInvoice,
  recordBillingPayment,
  recordBillingRefund,
  createBrokerPayout,
  createHostPayout,
  updateBrokerPayout,
  updateHostPayout,
  stripeWebhook,
  billingFinanceSnapshot
} from "./billing.js";

const ORG_ID = "28ad55e4-d32d-423b-80b5-481bd15dec9e";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const bodyJson = jsonBody;

function brokerIdFromAuth(auth) {
  return auth?.access?.internal_role === "broker" ? auth?.user?.id || null : null;
}

async function brokerTerms(env, userId) {
  if (!userId) return null;
  const rows = await sb(
    env,
    `organization_members?organization_id=eq.${ORG_ID}&user_id=eq.${encodeURIComponent(userId)}&role=eq.broker&select=user_id,broker_commission_percent`
  );
  return rows?.[0] || null;
}

function validMoneyCents(value, max = null) {
  const n = Math.round(Number(value || 0));
  return Number.isFinite(n) && n >= 0 && (max === null || n <= max) ? n : null;
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

function requestTooLarge(request, maxBytes) {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const size = Number(raw);
  return Number.isFinite(size) && size > maxBytes;
}

function requestIp(request) {
  return String(
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function enforceRateLimit(request, limiter, actorKeys = []) {
  if (!limiter || typeof limiter.limit !== "function") return null;

  const keys = [...actorKeys, `ip:${requestIp(request)}`];
  for (const key of keys) {
    const { success } = await limiter.limit({ key: String(key).slice(0, 200) });
    if (!success) {
      return json(
        { error: "too many requests" },
        429,
        { "retry-after": "60", "cache-control": "no-store" }
      );
    }
  }
  return null;
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
  if (requestTooLarge(request, 16384))
    return json({ error: "request too large" }, 413);

  const b = await bodyJson(request);
  if (!b.device_id) return json({ error: "device_id required" }, 400);

  const deviceKey = await sha256Hex(String(b.device_id));
  const limited = await enforceRateLimit(
    request,
    env.PLAYER_BOOT_RATE_LIMITER,
    [`device:${deviceKey}`]
  );
  if (limited) return limited;

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
        video_mode: String(b.video_mode || "").trim() || null,
        can_play_4k: b.can_play_4k === true,
        device_model: String(b.device_model || "").trim() || null,
        device_display_name: String(b.device_display_name || "").trim() || null,
        device_type: String(b.device_type || "").trim() || null,
        device_vendor: String(b.device_vendor || "").trim() || null,
        device_model_number: String(b.device_model_number || "").trim() || null,
        device_screen_size: String(b.device_screen_size || "").trim() || null,
        device_id: b.device_id,
        lan_ip: String(b.lan_ip || "").trim() || null,
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

  if (!screen.device_key_hash) {
    const deviceKey = randomHex(32);
    const code = pairCode();
    const updated = await sb(env, `screens?id=eq.${screen.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: "Unpaired screen",
        status: "unpaired",
        paired_at: null,
        pairing_code: code,
        pairing_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        device_key_hash: await sha256Hex(deviceKey),
        last_seen_at: new Date().toISOString(),
        app_version: b.app_version || screen.app_version,
        display_width: Number.isFinite(b.width) ? b.width : screen.display_width,
        display_height: Number.isFinite(b.height) ? b.height : screen.display_height,
        video_mode: String(b.video_mode || screen.video_mode || "").trim() || null,
        can_play_4k: typeof b.can_play_4k === "boolean" ? b.can_play_4k : Boolean(screen.can_play_4k),
        device_model: String(b.device_model || screen.device_model || "").trim() || null,
        device_display_name: String(b.device_display_name || screen.device_display_name || "").trim() || null,
        device_type: String(b.device_type || screen.device_type || "").trim() || null,
        device_vendor: String(b.device_vendor || screen.device_vendor || "").trim() || null,
        device_model_number: String(b.device_model_number || screen.device_model_number || "").trim() || null,
        device_screen_size: String(b.device_screen_size || screen.device_screen_size || "").trim() || null,
        lan_ip: String(b.lan_ip || screen.lan_ip || "").trim() || null,
      }),
    });

    screen = updated[0] || screen;
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

  const patch = {
    last_seen_at: new Date().toISOString(),
    app_version: b.app_version || screen.app_version,
    display_width: Number.isFinite(b.width) ? b.width : screen.display_width,
    display_height: Number.isFinite(b.height) ? b.height : screen.display_height,
    video_mode: String(b.video_mode || screen.video_mode || "").trim() || null,
    can_play_4k: typeof b.can_play_4k === "boolean" ? b.can_play_4k : Boolean(screen.can_play_4k),
    device_model: String(b.device_model || screen.device_model || "").trim() || null,
    device_display_name: String(b.device_display_name || screen.device_display_name || "").trim() || null,
    device_type: String(b.device_type || screen.device_type || "").trim() || null,
    device_vendor: String(b.device_vendor || screen.device_vendor || "").trim() || null,
    device_model_number: String(b.device_model_number || screen.device_model_number || "").trim() || null,
    device_screen_size: String(b.device_screen_size || screen.device_screen_size || "").trim() || null,
    lan_ip: String(b.lan_ip || screen.lan_ip || "").trim() || null,
  };

  if (!screen.paired_at &&
      (!screen.pairing_code ||
       !screen.pairing_expires_at ||
       new Date(screen.pairing_expires_at).getTime() <= Date.now())) {
    patch.pairing_code = pairCode();
    patch.pairing_expires_at = new Date(Date.now() + 7 * 86400000).toISOString();
  }

  const updated = await sb(env, `screens?id=eq.${screen.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
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



const WEEKLY_SCHEDULE_DAYS = [
  "sun", "mon", "tue", "wed", "thu", "fri", "sat",
];

function weeklyScheduleConfigured(schedule) {
  return Boolean(
    schedule &&
    typeof schedule === "object" &&
    !Array.isArray(schedule) &&
    Object.keys(schedule).length
  );
}

function scheduleMinute(value, allow24 = false) {
  const text = String(value || "").trim();
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (allow24 && hour === 24 && minute === 0) return 1440;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

function normalizeWeeklySchedule(raw, label = "schedule") {
  if (raw === null || raw === undefined || raw === "")
    return { value: {} };

  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { error: `${label} must be an object` };

  const allowed = new Set(WEEKLY_SCHEDULE_DAYS);
  const normalized = {};

  for (const [dayRaw, windows] of Object.entries(raw)) {
    const day = String(dayRaw || "").trim().toLowerCase();

    if (!allowed.has(day))
      return { error: `${label} contains invalid weekday ${dayRaw}` };

    if (!Array.isArray(windows))
      return { error: `${label}.${day} must be an array` };

    if (windows.length > 8)
      return { error: `${label}.${day} has too many windows` };

    const parsed = [];

    for (const window of windows) {
      if (!Array.isArray(window) || window.length !== 2)
        return { error: `${label}.${day} windows must be [start,end] pairs` };

      const startText = String(window[0] || "").trim();
      const endText = String(window[1] || "").trim();
      const start = scheduleMinute(startText);
      const end = scheduleMinute(endText, true);

      if (start === null || end === null || start === end)
        return { error: `${label}.${day} contains an invalid time window` };

      parsed.push([startText, endText]);
    }

    parsed.sort((a, b) => scheduleMinute(a[0]) - scheduleMinute(b[0]));
    normalized[day] = parsed;
  }

  return { value: normalized };
}

function validTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function weeklyScheduleAllows(schedule, timezone, nowMs) {
  if (!weeklyScheduleConfigured(schedule)) return true;
  if (!timezone || !validTimezone(timezone)) return false;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));

  const values = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const day = String(values.weekday || "").slice(0, 3).toLowerCase();
  const dayIndex = WEEKLY_SCHEDULE_DAYS.indexOf(day);
  if (dayIndex < 0) return false;

  const minute = Number(values.hour || 0) * 60 + Number(values.minute || 0);
  const current = Array.isArray(schedule?.[day]) ? schedule[day] : [];

  for (const window of current) {
    const start = scheduleMinute(window?.[0]);
    const end = scheduleMinute(window?.[1], true);
    if (start === null || end === null) continue;

    if (end > start && minute >= start && minute < end) return true;
    if (end <= start && minute >= start) return true;
  }

  const priorDay = WEEKLY_SCHEDULE_DAYS[
    (dayIndex + WEEKLY_SCHEDULE_DAYS.length - 1) %
    WEEKLY_SCHEDULE_DAYS.length
  ];
  const prior = Array.isArray(schedule?.[priorDay]) ? schedule[priorDay] : [];

  for (const window of prior) {
    const start = scheduleMinute(window?.[0]);
    const end = scheduleMinute(window?.[1], true);
    if (start === null || end === null) continue;
    if (end <= start && minute < end) return true;
  }

  return false;
}

function locationCampaignAllows(location, campaign, nowMs) {
  if (!location) return false;

  const timezone = String(
    location.timezone || "America/New_York"
  ).trim();

  if (!weeklyScheduleAllows(
    location.operating_hours || {},
    timezone,
    nowMs
  )) return false;

  if (
    weeklyScheduleConfigured(campaign?.dayparts) &&
    !weeklyScheduleAllows(campaign.dayparts, timezone, nowMs)
  ) return false;

  return true;
}

function pacingHash(input) {
  let h = 2166136261;
  const text = String(input || "");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

async function applyInventoryPacing(
  env,
  playlist,
  items,
  campaignMap,
  now,
  screen
) {
  const sourceItems = Array.isArray(items) ? items : [];

  if (!screen || screen.is_test) {
    return {
      items: sourceItems,
      meta: {
        mode: screen?.is_test ? "test_bypass" : "inventory_unavailable",
        eligible_screens: null,
        base_loop_seconds: null,
        campaigns: [],
      },
    };
  }

  const targetedIds = [...new Set(
    sourceItems
      .map(item => item.campaign_id)
      .filter(id => {
        if (!id) return false;
        const campaign = campaignMap.get(id);
        return campaign?.delivery_target_plays != null;
      })
  )];

  if (!targetedIds.length) {
    return {
      items: sourceItems,
      meta: {
        mode: "inventory_v1",
        eligible_screens: null,
        base_loop_seconds: sourceItems.reduce(
          (n, item) => n + Number(item.duration_seconds || 15), 0
        ),
        campaigns: [],
      },
    };
  }

  const campaignFilter = targetedIds
    .map(id => encodeURIComponent(id))
    .join(",");

  const [plays, screens, assignments, locations] = await Promise.all([
    sb(
      env,
      `playback_daily?organization_id=eq.${ORG_ID}&campaign_id=in.(${campaignFilter})&select=campaign_id,screen_id,play_count`
    ),
    sb(
      env,
      `screens?organization_id=eq.${ORG_ID}&select=id,location_id,is_test,status,last_seen_at,deployment_class`
    ),
    sb(
      env,
      `screen_playlist_assignments?organization_id=eq.${ORG_ID}&playlist_id=eq.${encodeURIComponent(playlist.id)}&select=screen_id,starts_at,ends_at`
    ),
    sb(
      env,
      `locations?organization_id=eq.${ORG_ID}&select=id,timezone,operating_hours`
    ),
  ]);

  const screenMap = new Map((screens || []).map(row => [row.id, row]));
  const locationMap = new Map((locations || []).map(row => [row.id, row]));
  const delivered = new Map(targetedIds.map(id => [id, 0]));

  for (const row of plays || []) {
    const proofScreen = screenMap.get(row.screen_id);
    if (proofScreen?.is_test) continue;
    delivered.set(
      row.campaign_id,
      Number(delivered.get(row.campaign_id) || 0) +
        Number(row.play_count || 0)
    );
  }

  const assignedIds = new Set(
    (assignments || [])
      .filter(a =>
        (!a.starts_at || new Date(a.starts_at).getTime() <= now) &&
        (!a.ends_at || new Date(a.ends_at).getTime() > now)
      )
      .map(a => a.screen_id)
  );

  const onlineCutoff = now - 120000;
  const baseEligibleIds = new Set(
    (screens || [])
      .filter(row =>
        assignedIds.has(row.id) &&
        !row.is_test &&
        row.status === "active" &&
        ["pilot", "production"].includes(row.deployment_class) &&
        row.last_seen_at &&
        new Date(row.last_seen_at).getTime() > onlineCutoff
      )
      .map(row => row.id)
  );

  const requesterBaseEligible = baseEligibleIds.has(screen.id);

  const baseLoopSeconds = Math.max(
    1,
    sourceItems.reduce(
      (n, item) => n + Number(item.duration_seconds || 15),
      0
    )
  );

  // Assigned commercial playlists receive one house item in playerConfig.
  // Include that time in the capacity model before the item is injected.
  const effectiveLoopSeconds =
    baseLoopSeconds + (playlist.name === "CoastLoop House Loop" ? 0 : 15);

  const groups = new Map();
  for (const item of sourceItems) {
    if (!item.campaign_id || !targetedIds.includes(item.campaign_id))
      continue;
    if (!groups.has(item.campaign_id))
      groups.set(item.campaign_id, []);
    groups.get(item.campaign_id).push(item);
  }

  const plans = new Map();
  const metadata = [];

  for (const campaignId of targetedIds) {
    const campaign = campaignMap.get(campaignId);
    const creatives = groups.get(campaignId) || [];
    if (!campaign || !creatives.length) continue;

    const target = Number(campaign.delivery_target_plays || 0);
    const makegood = Number(campaign.makegood_plays || 0);
    const goal = target + makegood;
    const deliveredPlays = Number(delivered.get(campaignId) || 0);
    const remaining = Math.max(goal - deliveredPlays, 0);
    const endMs = campaign.ends_at
      ? new Date(campaign.ends_at).getTime()
      : null;

    const campaignEligibleIds = new Set(
      [...baseEligibleIds].filter(screenId => {
        const inventoryScreen = screenMap.get(screenId);
        const location = inventoryScreen?.location_id
          ? locationMap.get(inventoryScreen.location_id)
          : null;
        return locationCampaignAllows(location, campaign, now);
      })
    );

    const requesterEligible = campaignEligibleIds.has(screen.id);
    const eligibleScreens = campaignEligibleIds.size;

    let desiredPerLoop = 1;
    let copies = 1;
    let requiredPerHour = null;
    let capacityPerHour = null;
    let capacityRatio = null;
    let state = "tracking";

    if (remaining <= 0) {
      desiredPerLoop = 0;
      copies = 0;
      state = "fulfilled";
    } else if (!requesterEligible || eligibleScreens < 1) {
      desiredPerLoop = 0;
      copies = 0;
      state = "no_eligible_inventory";
    } else if (endMs !== null && Number.isFinite(endMs) && endMs > now) {
      const secondsLeft = Math.max(1, (endMs - now) / 1000);
      requiredPerHour = remaining / (secondsLeft / 3600);

      capacityPerHour =
        eligibleScreens * (3600 / effectiveLoopSeconds);

      capacityRatio = requiredPerHour > 0
        ? capacityPerHour / requiredPerHour
        : null;

      desiredPerLoop =
        (remaining * effectiveLoopSeconds) /
        (secondsLeft * eligibleScreens);

      // Small delivery reserve absorbs config jitter and brief screen dropouts.
      desiredPerLoop *= 1.05;

      const whole = Math.floor(desiredPerLoop);
      const fraction = desiredPerLoop - whole;
      const bucketMs = Math.max(
        5000,
        Math.min(120000, Math.round(effectiveLoopSeconds * 1000))
      );
      const bucket = Math.floor(now / bucketMs);
      const roll = pacingHash(
        `${screen.id}|${campaignId}|${bucket}`
      );

      copies = whole + (roll < fraction ? 1 : 0);
      copies = Math.max(0, Math.min(12, copies));

      if (desiredPerLoop > 12)
        state = "capacity_shortfall";
      else if (desiredPerLoop > 1.1)
        state = "accelerated";
      else if (desiredPerLoop < 0.9)
        state = "throttled";
      else
        state = "on_rate";
    } else {
      // A target without a finite end date cannot be rate-paced.
      copies = 1;
      desiredPerLoop = 1;
      state = "unbounded_schedule";
    }

    const bucketKey = Math.floor(
      now / Math.max(
        5000,
        Math.min(120000, Math.round(effectiveLoopSeconds * 1000))
      )
    );

    const startOffset = creatives.length
      ? Math.floor(
          pacingHash(`${campaignId}|${screen.id}|${bucketKey}|creative`) *
          creatives.length
        )
      : 0;

    const selected = [];
    for (let n = 0; n < copies; n++) {
      const creative = creatives[(startOffset + n) % creatives.length];
      selected.push({
        ...creative,
        pacing_sequence: n + 1,
        pacing_copies: copies,
        pacing_state: state,
      });
    }

    plans.set(campaignId, selected);
    metadata.push({
      campaign_id: campaignId,
      goal_plays: goal,
      delivered_plays: deliveredPlays,
      remaining_plays: remaining,
      desired_plays_per_loop:
        Math.round(desiredPerLoop * 1000) / 1000,
      copies_this_loop: copies,
      required_plays_per_hour:
        requiredPerHour == null
          ? null
          : Math.round(requiredPerHour * 10) / 10,
      available_plays_per_hour:
        capacityPerHour == null
          ? null
          : Math.round(capacityPerHour * 10) / 10,
      capacity_ratio:
        capacityRatio == null
          ? null
          : Math.round(capacityRatio * 100) / 100,
      eligible_screens: eligibleScreens,
      requester_eligible: requesterEligible,
      pacing_state: state,
    });
  }

  const output = [];
  const emitted = new Set();

  for (const item of sourceItems) {
    const campaignId = item.campaign_id;

    if (!campaignId || !plans.has(campaignId)) {
      output.push(item);
      continue;
    }

    if (emitted.has(campaignId))
      continue;

    emitted.add(campaignId);
    output.push(...(plans.get(campaignId) || []));
  }

  return {
    items: output,
    meta: {
      mode: "inventory_v1",
      eligible_screens: baseEligibleIds.size,
      requester_eligible: requesterBaseEligible,
      base_loop_seconds: baseLoopSeconds,
      effective_loop_seconds: effectiveLoopSeconds,
      campaigns: metadata,
    },
  };
}

async function playlistPayload(env, playlistId, now, screen = null) {
  const playlists = await sb(
    env,
    `playlists?id=eq.${playlistId}&organization_id=eq.${ORG_ID}&status=eq.active&select=*`
  );
  const playlist = playlists?.[0];
  if (!playlist) return null;

  const [items, media, campaigns] = await Promise.all([
    sb(
      env,
      `playlist_items?playlist_id=eq.${playlist.id}&active=eq.true&select=*&order=position.asc`
    ),
    sb(
      env,
      `media_assets?organization_id=eq.${ORG_ID}&status=eq.ready&select=*`
    ),
    sb(
      env,
      `campaigns?organization_id=eq.${ORG_ID}&select=id,status,starts_at,ends_at,advertiser_business_id,delivery_target_plays,makegood_plays,dayparts`
    )
  ]);

  const mediaMap = new Map((media || []).map(m => [m.id, m]));
  const campaignMap = new Map((campaigns || []).map(c => [c.id, c]));

  let deliveryLocation = null;
  if (screen?.location_id) {
    const rows = await sb(
      env,
      `locations?id=eq.${encodeURIComponent(screen.location_id)}&organization_id=eq.${ORG_ID}&select=id,timezone,operating_hours`
    );
    deliveryLocation = rows?.[0] || null;
  }

  const campaignDeliverable = campaignId => {
    if (!campaignId) return true;

    const campaign = campaignMap.get(campaignId);
    if (!campaign) return false;

    if (!locationCampaignAllows(deliveryLocation, campaign, now))
      return false;

    const starts = campaign.starts_at
      ? new Date(campaign.starts_at).getTime()
      : null;
    const ends = campaign.ends_at
      ? new Date(campaign.ends_at).getTime()
      : null;

    if (starts !== null && (!Number.isFinite(starts) || starts > now))
      return false;
    if (ends !== null && (!Number.isFinite(ends) || ends <= now))
      return false;

    if (campaign.status === "active")
      return true;

    if (campaign.status === "scheduled")
      return starts !== null && starts <= now;

    return false;
  };

  const activeItems = (items || [])
    .filter(i =>
      (!i.starts_at || new Date(i.starts_at).getTime() <= now) &&
      (!i.ends_at || new Date(i.ends_at).getTime() > now) &&
      campaignDeliverable(i.campaign_id)
    )
    .map(i => {
      const m = mediaMap.get(i.media_asset_id);
      if (!m) return null;

      if (i.campaign_id) {
        const campaign = campaignMap.get(i.campaign_id);
        if (!campaign || m.approval_status !== "approved")
          return null;

        if (!m.advertiser_business_id ||
            m.advertiser_business_id !== campaign.advertiser_business_id)
          return null;
      } else if (m.advertiser_business_id) {
        // Advertiser creative must always retain campaign attribution.
        return null;
      }

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

  const paced = await applyInventoryPacing(
    env,
    playlist,
    activeItems,
    campaignMap,
    now,
    screen
  );

  const payload = {
    playlist: {
      id: playlist.id,
      name: playlist.name,
      revision: playlist.version,
    },
    items: paced.items,
    pacing: paced.meta,
  };

  if (playlist.name === "CoastLoop House Loop" && screen) {
    const videoMode = String(screen.video_mode || "");
    const is4k = videoMode.startsWith("2160p") && screen.can_play_4k === true;

    if (is4k) {
      const masters = await sb(
        env,
        `media_assets?organization_id=eq.${ORG_ID}&title=eq.${encodeURIComponent("coastloop-house-v3-delivery-4k-hevc.mp4")}&status=eq.ready&select=*&limit=1`
      );
      const master = masters?.[0];
      const base = payload.items?.[0];

      if (master && base) {
        payload.items[0] = {
          ...base,
          media_id: master.id,
          name: master.title,
          media_type: master.kind,
          mime_type: master.mime_type,
          duration_seconds: master.duration_seconds || 15,
          url: `/media/${master.id}`,
          fallback_media_id: base.media_id,
          fallback_url: base.url,
          delivery_tier: "4k",
        };
      } else if (base) {
        base.delivery_tier = "1080p";
        base.delivery_note = "4k_asset_unavailable";
      }
    } else if (payload.items?.[0]) {
      payload.items[0].delivery_tier = "1080p";
    }
  }

  return payload;
}

async function fallbackPayload(env, now, screen = null) {
  const rows = await sb(
    env,
    `playlists?organization_id=eq.${ORG_ID}&name=eq.${encodeURIComponent("CoastLoop House Loop")}&status=eq.active&select=id&limit=1`
  );
  const id = rows?.[0]?.id;
  if (!id) return null;

  const payload = await playlistPayload(env, id, now, screen);
  if (!payload?.items?.length) return null;

  return {
    ...payload,
    fallback: true,
    fallback_reason: "house",
  };
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

  let payload = null;
  let fallbackReason = null;

  if (assignment) {
    payload = await playlistPayload(env, assignment.playlist_id, now, screen);

    if (payload?.items?.length &&
        payload?.playlist?.name !== "CoastLoop House Loop") {
      const house = await fallbackPayload(env, now, screen);
      const houseItem = house?.items?.[0];

      if (houseItem &&
          !payload.items.some(item => item.media_id === houseItem.media_id)) {
        payload.items.push({
          ...houseItem,
          position: payload.items.length,
          campaign_id: null,
          system_house: true,
        });
        payload.house_injected = true;
      }
    }

    if (!payload?.items?.length) fallbackReason = "assigned_playlist_empty";
  } else {
    fallbackReason = "no_assignment";
  }

  if (!payload?.items?.length) {
    const fallback = await fallbackPayload(env, now, screen);
    if (fallback) {
      payload = {
        ...fallback,
        fallback_reason: fallbackReason || fallback.fallback_reason,
      };
    }
  }

  if (!payload) {
    payload = {
      playlist: null,
      items: [],
      fallback: true,
      fallback_reason: fallbackReason || "house_unavailable",
    };
  }

  return json({
    paired: true,
    screen: { id: screen.id, name: screen.name },
    ...payload,
  }, 200, { "cache-control": "no-store" });
}

async function heartbeat(request, env) {
  const b = await bodyJson(request);
  const screen = await validateDevice(env, b.device_id, b.device_key);
  if (!screen) return json({ error: "invalid device" }, 401);

  await sb(env, `screens?id=eq.${screen.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      last_seen_at: new Date().toISOString(),
      app_version: b.app_version || screen.app_version,
      display_width: Number.isFinite(b.width) ? b.width : screen.display_width,
      display_height: Number.isFinite(b.height) ? b.height : screen.display_height,
      video_mode: String(b.video_mode || screen.video_mode || "").trim() || null,
      can_play_4k: typeof b.can_play_4k === "boolean" ? b.can_play_4k : Boolean(screen.can_play_4k),
      device_model: String(b.device_model || screen.device_model || "").trim() || null,
      device_display_name: String(b.device_display_name || screen.device_display_name || "").trim() || null,
      device_type: String(b.device_type || screen.device_type || "").trim() || null,
      device_vendor: String(b.device_vendor || screen.device_vendor || "").trim() || null,
      device_model_number: String(b.device_model_number || screen.device_model_number || "").trim() || null,
      device_screen_size: String(b.device_screen_size || screen.device_screen_size || "").trim() || null,
      lan_ip: String(b.lan_ip || screen.lan_ip || "").trim() || null,
    }),
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
      p_proof_id: String(b.proof_id || "").trim() || null,
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

async function serveMedia(request, env, mediaId) {
  const row = await mediaLookup(env, mediaId);
  if (!row?.storage_key)
    return new Response("Not found", { status: 404 });

  const head = await env.MEDIA.head(row.storage_key);
  if (!head)
    return new Response("Not found", { status: 404 });

  const size = head.size;
  const rangeHeader = request.headers.get("range");

  let start = 0;
  let end = size - 1;
  let status = 200;
  let object = null;

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());

    if (!match) {
      return new Response(null, {
        status: 416,
        headers: {
          "content-range": `bytes */${size}`,
          "accept-ranges": "bytes",
        },
      });
    }

    if (match[1] === "") {
      const suffix = Number(match[2]);
      if (!Number.isFinite(suffix) || suffix <= 0)
        return new Response(null, {
          status: 416,
          headers: {
            "content-range": `bytes */${size}`,
            "accept-ranges": "bytes",
          },
        });

      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Number(match[2]);
    }

    if (!Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        start >= size ||
        end < start) {
      return new Response(null, {
        status: 416,
        headers: {
          "content-range": `bytes */${size}`,
          "accept-ranges": "bytes",
        },
      });
    }

    end = Math.min(end, size - 1);
    object = await env.MEDIA.get(row.storage_key, {
      range: {
        offset: start,
        length: end - start + 1,
      },
    });
    status = 206;
  } else if (request.method !== "HEAD") {
    object = await env.MEDIA.get(row.storage_key);
  }

  const headers = new Headers();
  head.writeHttpMetadata(headers);
  headers.set("etag", head.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("accept-ranges", "bytes");
  headers.set("x-content-type-options", "nosniff");

  if (status === 206) {
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
    headers.set("content-length", String(end - start + 1));
  } else {
    headers.set("content-length", String(size));
  }

  return new Response(
    request.method === "HEAD" ? null : object?.body || null,
    { status, headers }
  );
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

const MEDIA_MAX_BYTES = 75 * 1024 * 1024;
const MEDIA_REQUEST_MAX_BYTES = 80 * 1024 * 1024;

const MEDIA_TYPES = new Map([
  ["image/jpeg", { kind: "image", ext: "jpg" }],
  ["image/png",  { kind: "image", ext: "png" }],
  ["image/gif",  { kind: "image", ext: "gif" }],
  ["video/mp4",  { kind: "video", ext: "mp4" }],
]);

function validMediaSignature(mime, bytes) {
  if (mime === "image/jpeg")
    return bytes.length >= 3 &&
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  if (mime === "image/png")
    return bytes.length >= 8 &&
      [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]
        .every((v,i) => bytes[i] === v);

  if (mime === "image/gif") {
    const sig = String.fromCharCode(...bytes.slice(0,6));
    return sig === "GIF87a" || sig === "GIF89a";
  }

  if (mime === "video/mp4") {
    const ascii = String.fromCharCode(...bytes);
    return ascii.includes("ftyp");
  }

  return false;
}

async function uploadMedia(request, env, auth = null) {
  if (requestTooLarge(request, MEDIA_REQUEST_MAX_BYTES))
    return json({ error: "upload too large; maximum media file is 75 MB" }, 413);

  const form = await request.formData();
  const file = form.get("file");
  const advertiserBusinessId =
    String(form.get("advertiser_business_id") || "").trim() || null;
  if (!(file instanceof File))
    return json({ error: "file required" }, 400);

  if (advertiserBusinessId) {
    const businesses = await sb(
      env,
      `businesses?id=eq.${encodeURIComponent(advertiserBusinessId)}&organization_id=eq.${ORG_ID}&is_advertiser=eq.true&select=id`
    );
    if (!businesses?.[0])
      return json({ error: "advertiser business not found" }, 400);
  }

  if (!file.size)
    return json({ error: "empty media file" }, 400);

  if (file.size > MEDIA_MAX_BYTES)
    return json({ error: "upload too large; maximum media file is 75 MB" }, 413);

  const mime = String(file.type || "").toLowerCase().split(";")[0].trim();
  const spec = MEDIA_TYPES.get(mime);
  if (!spec)
    return json({ error: "supported media: JPEG, PNG, GIF, and MP4" }, 415);

  const headBytes = new Uint8Array(
    await file.slice(0, 64).arrayBuffer()
  );
  if (!validMediaSignature(mime, headBytes))
    return json({ error: "file content does not match its media type" }, 415);

  const id = crypto.randomUUID();
  const key = `media/${id}.${spec.ext}`;
  const originalName = String(file.name || `media.${spec.ext}`)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 240) || `media.${spec.ext}`;
  const title =
    String(form.get("title") || originalName).trim().slice(0, 240)
    || originalName;

  const rawDuration = Number(
    form.get("duration_seconds") || (spec.kind === "image" ? 15 : 30)
  );
  const duration = Number.isFinite(rawDuration)
    ? Math.max(1, Math.min(300, rawDuration))
    : (spec.kind === "image" ? 15 : 30);

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: {
      contentType: mime,
      contentDisposition: "inline",
    },
  });

  try {
    const rows = await sb(env, "media_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_ID,
        advertiser_business_id: advertiserBusinessId,
        title,
        kind: spec.kind,
        storage_key: key,
        original_filename: originalName,
        mime_type: mime,
        byte_size: file.size,
        duration_seconds: duration,
        status: "ready",
        approval_status: "pending",
        created_by: auth?.user?.id || null,
      }),
    });

    if (!rows?.[0]?.id)
      throw new Error("media metadata insert returned no row");

    return json({ ok: true, id: rows[0].id });
  } catch (error) {
    await env.MEDIA.delete(key).catch(() => {});
    throw error;
  }
}

async function updateMediaApproval(request, env, auth, mediaId) {
  const rows = await sb(
    env,
    `media_assets?id=eq.${encodeURIComponent(mediaId)}&organization_id=eq.${ORG_ID}&select=*`
  );
  const media = rows?.[0];
  if (!media) return json({ error: "media not found" }, 404);

  const b = await bodyJson(request);
  const next = String(b.approval_status || "").trim().toLowerCase();
  if (!new Set(["pending", "approved", "rejected"]).has(next))
    return json({ error: "invalid approval status" }, 400);

  if (next === "approved" && media.status !== "ready")
    return json({ error: "only ready media can be approved" }, 409);

  const actorId = auth?.user?.id || null;
  const stamp = new Date().toISOString();
  const patch = {
    approval_status: next,
    updated_at: stamp,
  };

  if (next === "approved") {
    patch.approved_at = stamp;
    patch.approved_by = actorId;
    patch.rejected_at = null;
    patch.rejected_by = null;
    patch.rejection_reason = null;
  } else if (next === "rejected") {
    const reason = String(b.rejection_reason || "").trim().slice(0, 1000);
    if (!reason)
      return json({ error: "rejection reason required" }, 400);

    patch.approved_at = null;
    patch.approved_by = null;
    patch.rejected_at = stamp;
    patch.rejected_by = actorId;
    patch.rejection_reason = reason;
  } else {
    patch.approved_at = null;
    patch.approved_by = null;
    patch.rejected_at = null;
    patch.rejected_by = null;
    patch.rejection_reason = null;
  }

  const changed = await sb(
    env,
    `media_assets?id=eq.${encodeURIComponent(mediaId)}&organization_id=eq.${ORG_ID}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    }
  );

  return json({ ok: true, media: changed?.[0] || null });
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

  if (items.length > 200)
    return json({ error: "playlist cannot exceed 200 items" }, 400);

  const [playlistRows, mediaRows, campaignRows] = await Promise.all([
    sb(
      env,
      `playlists?id=eq.${encodeURIComponent(playlistId)}&organization_id=eq.${ORG_ID}&select=id,version`
    ),
    sb(
      env,
      `media_assets?organization_id=eq.${ORG_ID}&select=id,status,approval_status,advertiser_business_id`
    ),
    sb(
      env,
      `campaigns?organization_id=eq.${ORG_ID}&select=id,status,advertiser_business_id`
    ),
  ]);

  const playlist = playlistRows?.[0];
  if (!playlist)
    return json({ error: "playlist not found" }, 404);

  const mediaMap = new Map((mediaRows || []).map(x => [x.id, x]));
  const campaignMap = new Map((campaignRows || []).map(x => [x.id, x]));

  for (const item of items) {
    const mediaId = String(item?.media_id || "").trim();
    const campaignId = String(item?.campaign_id || "").trim() || null;
    const media = mediaMap.get(mediaId);

    if (!media || media.status !== "ready")
      return json({ error: "playlist media must exist and be ready" }, 400);

    if (campaignId) {
      const campaign = campaignMap.get(campaignId);
      if (!campaign)
        return json({ error: "campaign not found for playlist item" }, 400);

      if (["completed", "canceled"].includes(campaign.status))
        return json({ error: "terminal campaign cannot receive playlist media" }, 409);

      if (media.approval_status !== "approved")
        return json({ error: "campaign creative must be approved" }, 409);

      if (!media.advertiser_business_id)
        return json({
          error: "campaign creative must be assigned to its advertiser"
        }, 409);

      if (media.advertiser_business_id !== campaign.advertiser_business_id)
        return json({
          error: "creative advertiser does not match campaign advertiser"
        }, 409);
    } else if (media.advertiser_business_id) {
      return json({
        error: "advertiser creative requires campaign attribution"
      }, 409);
    }
  }

  await sb(
    env,
    `playlist_items?playlist_id=eq.${encodeURIComponent(playlistId)}&organization_id=eq.${ORG_ID}`,
    { method: "DELETE" }
  );

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

  await sb(
    env,
    `playlists?id=eq.${encodeURIComponent(playlistId)}&organization_id=eq.${ORG_ID}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        version: Number(playlist.version || 1) + 1,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  return json({ ok: true });
}

async function applyScreenAssignment(env, screen, b, markPaired = false) {
  const isTest = b.is_test !== undefined ? Boolean(b.is_test) : Boolean(screen.is_test);
  const locationId = String(b.location_id || "").trim() || null;
  const deploymentClass = String(b.deployment_class || screen.deployment_class || "unreviewed").trim();
  const certificationNote = String(b.certification_note ?? screen.certification_note ?? "").trim() || null;
  const allowedDeploymentClasses = new Set(["unreviewed", "lab_only", "pilot", "production"]);

  if (!allowedDeploymentClasses.has(deploymentClass))
    return json({ error: "invalid hardware deployment class" }, 400);

  if (!isTest && deploymentClass !== "production")
    return json({ error: "production-certified hardware required for commercial screen" }, 400);

  if (!isTest && !certificationNote)
    return json({ error: "hardware certification note required for commercial screen" }, 400);

  if (!isTest && !locationId)
    return json({ error: "location required for commercial screen" }, 400);

  let location = null;
  if (locationId) {
    const locations = await sb(
      env,
      `locations?id=eq.${encodeURIComponent(locationId)}&organization_id=eq.${ORG_ID}&select=id,host_annual_pay_cents`
    );
    location = locations?.[0] || null;
    if (!location) return json({ error: "invalid location" }, 400);
  }

  const hostAnnualPayCents = b.host_annual_pay_cents === undefined
    ? Number(location?.host_annual_pay_cents ?? screen.host_annual_pay_cents ?? 0)
    : validMoneyCents(b.host_annual_pay_cents, 59900);
  const hardwareCostCents = b.hardware_cost_cents === undefined
    ? Number(screen.hardware_cost_cents || 0)
    : validMoneyCents(b.hardware_cost_cents);
  const setupCostCents = b.setup_cost_cents === undefined
    ? Number(screen.setup_cost_cents || 0)
    : validMoneyCents(b.setup_cost_cents);

  if (hostAnnualPayCents === null || hardwareCostCents === null || setupCostCents === null)
    return json({ error: "invalid screen financial values" }, 400);

  const screenPatch = {
    name: String(b.name || "CoastLoop Screen").trim(),
    status: "active",
    location_id: locationId,
    is_test: isTest,
    deployment_class: deploymentClass,
    certification_note: certificationNote,
    host_annual_pay_cents: hostAnnualPayCents,
    hardware_cost_cents: hardwareCostCents,
    setup_cost_cents: setupCostCents,
  };

  if (markPaired) {
    screenPatch.paired_at = new Date().toISOString();
    screenPatch.pairing_code = null;
    screenPatch.pairing_expires_at = null;
  }

  await sb(env, `screens?id=eq.${screen.id}&organization_id=eq.${ORG_ID}`, {
    method: "PATCH",
    body: JSON.stringify(screenPatch),
  });

  await sb(env, `screen_playlist_assignments?screen_id=eq.${screen.id}`, {
    method: "DELETE",
  });

  if (b.playlist_id) {
    await sb(env, "screen_playlist_assignments", {
      method: "POST",
      body: JSON.stringify({
        organization_id: ORG_ID,
        screen_id: screen.id,
        playlist_id: b.playlist_id,
        priority: 100,
      }),
    });
  }

  return json({ ok: true, screen_id: screen.id });
}

async function pairScreen(request, env) {
  const b = await bodyJson(request);
  const code = String(b.pair_code || "").trim().toUpperCase();
  if (!code) return json({ error: "pair code required" }, 400);

  const rows = await sb(
    env,
    `screens?organization_id=eq.${ORG_ID}&pairing_code=eq.${encodeURIComponent(code)}&select=*`
  );
  const screen = rows?.[0];

  if (!screen) return json({ error: "pair code not found" }, 404);
  if (screen.paired_at) return json({ error: "screen already paired" }, 409);
  if (!screen.pairing_expires_at ||
      new Date(screen.pairing_expires_at).getTime() <= Date.now())
    return json({ error: "pair code expired; restart the CoastLoop player for a new code" }, 410);

  return applyScreenAssignment(env, screen, b, true);
}

async function assignScreen(request, env, screenId) {
  const b = await bodyJson(request);
  const rows = await sb(
    env,
    `screens?id=eq.${encodeURIComponent(screenId)}&organization_id=eq.${ORG_ID}&select=*`
  );
  const screen = rows?.[0];

  if (!screen) return json({ error: "screen not found" }, 404);
  if (!screen.paired_at)
    return json({ error: "unpaired screen must be paired by code first" }, 409);

  return applyScreenAssignment(env, screen, b, false);
}

async function resetTestScreenPairing(env, screenId) {
  const rows = await sb(
    env,
    `screens?id=eq.${encodeURIComponent(screenId)}&organization_id=eq.${ORG_ID}&select=*`
  );
  const screen = rows?.[0];

  if (!screen) return json({ error: "screen not found" }, 404);
  if (!screen.is_test)
    return json({ error: "pairing reset is restricted to test screens" }, 403);

  await sb(env, `screen_playlist_assignments?screen_id=eq.${screen.id}`, {
    method: "DELETE",
  });

  await sb(env, `screens?id=eq.${screen.id}&organization_id=eq.${ORG_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: "Unpaired screen",
      status: "unpaired",
      paired_at: null,
      pairing_code: null,
      pairing_expires_at: null,
      device_key_hash: null,
      location_id: null,
      is_test: true,
    }),
  });

  return json({ ok: true, screen_id: screen.id });
}


async function createPublicLead(request, env) {
  if (requestTooLarge(request, 32768))
    return json({ error: "request too large" }, 413);

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

  const contactIdentity = email
    ? `email:${email.toLowerCase()}`
    : `phone:${phone.replace(/\\D/g, "")}`;
  const contactKey = await sha256Hex(contactIdentity);
  const limited = await enforceRateLimit(
    request,
    env.PUBLIC_LEAD_RATE_LIMITER,
    [`contact:${contactKey}`]
  );
  if (limited) return limited;

  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const duplicateFilter = email
    ? `email=eq.${encodeURIComponent(email)}`
    : `phone=eq.${encodeURIComponent(phone)}`;
  const duplicates = await sb(
    env,
    `prospects?organization_id=eq.${ORG_ID}&source=eq.${encodeURIComponent("coastloop.site")}&${duplicateFilter}&created_at=gte.${encodeURIComponent(cutoff)}&select=id&limit=1`
  );
  if (duplicates?.[0])
    return json({ ok: true, id: duplicates[0].id, duplicate: true });

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

async function createAdminProspect(request, env, auth = null) {
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

  const hostAnnualPayCents = validMoneyCents(b.host_annual_pay_cents, 59900);
  if (hostAnnualPayCents === null)
    return json({ error: "host annual pay must be between $0 and $599 per TV" }, 400);

  const actorBrokerId = brokerIdFromAuth(auth);
  const requestedBrokerId = actorBrokerId || String(b.broker_user_id || "").trim() || null;
  if (requestedBrokerId && !(await brokerTerms(env, requestedBrokerId)))
    return json({ error: "invalid broker" }, 400);

  const rows = await sb(env, "prospects", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      name,
      category: String(b.category || "").trim().slice(0, 120) || null,
      stage: "new",
      broker_user_id: requestedBrokerId,
      host_annual_pay_cents: hostAnnualPayCents,
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

async function adminProspects(env, auth = null) {
  const brokerId = brokerIdFromAuth(auth);
  const scope = brokerId ? `&broker_user_id=eq.${encodeURIComponent(brokerId)}` : "";
  return await sb(
    env,
    `prospects?organization_id=eq.${ORG_ID}${scope}&select=*&order=created_at.desc`
  );
}

async function updateProspect(request, env, prospectId, auth = null) {
  const b = await bodyJson(request);
  const brokerId = brokerIdFromAuth(auth);
  const scope = brokerId ? `&broker_user_id=eq.${encodeURIComponent(brokerId)}` : "";
  const existing = await sb(
    env,
    `prospects?id=eq.${encodeURIComponent(prospectId)}&organization_id=eq.${ORG_ID}${scope}&select=id`
  );
  if (!existing?.[0]) return json({ error: "prospect not found" }, 404);
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

  if (b.broker_user_id !== undefined && !brokerId) {
    const nextBrokerId = String(b.broker_user_id || "").trim() || null;
    if (nextBrokerId && !(await brokerTerms(env, nextBrokerId)))
      return json({ error: "invalid broker" }, 400);
    patch.broker_user_id = nextBrokerId;
  }

  if (b.host_annual_pay_cents !== undefined) {
    const cents = validMoneyCents(b.host_annual_pay_cents, 59900);
    if (cents === null)
      return json({ error: "host annual pay must be between $0 and $599 per TV" }, 400);
    patch.host_annual_pay_cents = cents;
  }

  if (b.next_follow_up_at !== undefined)
    patch.next_follow_up_at = b.next_follow_up_at || null;

  await sb(env, `prospects?id=eq.${prospectId}&organization_id=eq.${ORG_ID}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  return json({ ok: true });
}



async function updateLocationSchedule(request, env, locationId, auth) {
  const rows = await sb(
    env,
    `locations?id=eq.${encodeURIComponent(locationId)}&organization_id=eq.${ORG_ID}&select=*`
  );
  const location = rows?.[0];
  if (!location) return json({ error: "location not found" }, 404);

  const brokerId = brokerIdFromAuth(auth);
  if (brokerId) {
    const businesses = await sb(
      env,
      `businesses?id=eq.${encodeURIComponent(location.business_id)}&organization_id=eq.${ORG_ID}&broker_user_id=eq.${encodeURIComponent(brokerId)}&select=id`
    );
    if (!businesses?.[0])
      return json({ error: "location not found" }, 404);
  }

  const b = await bodyJson(request);
  const patch = { updated_at: new Date().toISOString() };

  if (Object.prototype.hasOwnProperty.call(b, "timezone")) {
    const timezone = String(b.timezone || "").trim();
    if (!timezone || !validTimezone(timezone))
      return json({ error: "invalid timezone" }, 400);
    patch.timezone = timezone;
  }

  if (Object.prototype.hasOwnProperty.call(b, "operating_hours")) {
    const parsed = normalizeWeeklySchedule(
      b.operating_hours,
      "operating_hours"
    );
    if (parsed.error)
      return json({ error: parsed.error }, 400);
    patch.operating_hours = parsed.value;
  }

  if (Object.keys(patch).length === 1)
    return json({ error: "schedule fields required" }, 400);

  const changed = await sb(
    env,
    `locations?id=eq.${encodeURIComponent(locationId)}&organization_id=eq.${ORG_ID}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    }
  );

  return json({ ok: true, location: changed?.[0] || null });
}


async function adminBusinesses(env, auth = null) {
  const brokerId = brokerIdFromAuth(auth);
  const scope = brokerId ? `&broker_user_id=eq.${encodeURIComponent(brokerId)}` : "";
  const businesses = await sb(
    env,
    `businesses?organization_id=eq.${ORG_ID}${scope}&select=*&order=created_at.desc`
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

async function promoteProspect(request, env, prospectId, auth = null) {
  const brokerId = brokerIdFromAuth(auth);
  const scope = brokerId ? `&broker_user_id=eq.${encodeURIComponent(brokerId)}` : "";
  const rows = await sb(
    env,
    `prospects?id=eq.${prospectId}&organization_id=eq.${ORG_ID}${scope}&select=*`
  );
  const prospect = rows?.[0];
  if (!prospect) return json({ error: "prospect not found" }, 404);
  if (!prospect.host_interest && !prospect.advertiser_interest)
    return json({ error: "prospect must be host, advertiser, or both before promotion" }, 400);

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
        broker_user_id: prospect.broker_user_id || null,
        is_host: Boolean(prospect.host_interest),
        is_advertiser: Boolean(prospect.advertiser_interest),
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
          host_annual_pay_cents: Number(prospect.host_annual_pay_cents || 0),
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

async function adminCampaigns(env, auth = null) {
  const brokerId = brokerIdFromAuth(auth);
  const scope = brokerId ? `&broker_user_id=eq.${encodeURIComponent(brokerId)}` : "";
  return await sb(
    env,
    `campaigns?organization_id=eq.${ORG_ID}${scope}&select=*&order=created_at.desc`
  );
}

async function createCampaign(request, env, auth = null) {
  const b = await bodyJson(request);
  const businessId = String(b.advertiser_business_id || "").trim();
  const name = String(b.name || "").trim().slice(0, 180);

  if (!businessId || !name)
    return json({ error: "advertiser business and campaign name required" }, 400);

  const actorBrokerId = brokerIdFromAuth(auth);
  const businessScope = actorBrokerId
    ? `&broker_user_id=eq.${encodeURIComponent(actorBrokerId)}`
    : "";
  const business = await sb(
    env,
    `businesses?id=eq.${businessId}&organization_id=eq.${ORG_ID}&is_advertiser=eq.true${businessScope}&select=id,broker_user_id`
  );
  if (!business?.[0])
    return json({ error: "business not found" }, 404);

  const requestedStatus = String(b.status || "draft").trim().toLowerCase();
  const allowedCreate = actorBrokerId
    ? new Set(["draft", "scheduled"])
    : new Set(["draft", "scheduled", "active"]);

  if (!allowedCreate.has(requestedStatus)) {
    return json({
      error: actorBrokerId
        ? "brokers may create draft or scheduled campaigns"
        : "campaign must start as draft, scheduled, or active"
    }, actorBrokerId ? 403 : 400);
  }

  const parseCampaignDate = (value, label) => {
    if (value === undefined || value === null || value === "")
      return { value: null };

    const time = new Date(value).getTime();
    if (!Number.isFinite(time))
      return { error: `${label} must be a valid date` };

    return { value: new Date(time).toISOString() };
  };

  const parsedStart = parseCampaignDate(b.starts_at, "starts_at");
  if (parsedStart.error) return json({ error: parsedStart.error }, 400);

  const parsedEnd = parseCampaignDate(b.ends_at, "ends_at");
  if (parsedEnd.error) return json({ error: parsedEnd.error }, 400);

  if (parsedStart.value && parsedEnd.value &&
      new Date(parsedEnd.value).getTime() <= new Date(parsedStart.value).getTime())
    return json({ error: "ends_at must be after starts_at" }, 400);

  if (requestedStatus === "scheduled" && !parsedStart.value)
    return json({ error: "scheduled campaign requires starts_at" }, 400);

  let priceCents = null;
  if (b.price_cents !== undefined && b.price_cents !== "" && b.price_cents !== null) {
    priceCents = validMoneyCents(b.price_cents);
    if (priceCents === null)
      return json({ error: "price_cents must be a non-negative integer" }, 400);
  }

  let deliveryTargetPlays = null;
  if (b.delivery_target_plays !== undefined &&
      b.delivery_target_plays !== null &&
      b.delivery_target_plays !== "") {
    const value = Number(b.delivery_target_plays);
    if (!Number.isSafeInteger(value) || value <= 0)
      return json({ error: "delivery_target_plays must be a positive integer" }, 400);
    deliveryTargetPlays = value;
  }

  let makegoodPlays = 0;
  if (b.makegood_plays !== undefined &&
      b.makegood_plays !== null &&
      b.makegood_plays !== "") {
    const value = Number(b.makegood_plays);
    if (!Number.isSafeInteger(value) || value < 0)
      return json({ error: "makegood_plays must be a non-negative integer" }, 400);
    makegoodPlays = value;
  }

  if (makegoodPlays > 0 && deliveryTargetPlays === null)
    return json({ error: "makegood plays require a delivery target" }, 400);

  const requestedBrokerId = actorBrokerId
    || String(b.broker_user_id || "").trim()
    || business?.[0]?.broker_user_id
    || null;
  const terms = requestedBrokerId ? await brokerTerms(env, requestedBrokerId) : null;
  if (requestedBrokerId && !terms)
    return json({ error: "invalid broker" }, 400);
  const brokerCommissionPercent = Number(terms?.broker_commission_percent || 0);

  const rows = await sb(env, "campaigns", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_ID,
      advertiser_business_id: businessId,
      broker_user_id: requestedBrokerId,
      broker_commission_percent: brokerCommissionPercent,
      name,
      status: requestedStatus,
      starts_at: parsedStart.value,
      ends_at: parsedEnd.value,
      price_cents: priceCents,
      delivery_target_plays: deliveryTargetPlays,
      makegood_plays: makegoodPlays,
      billing_notes: String(b.billing_notes || "").slice(0, 2000) || null,
      notes: String(b.notes || "").slice(0, 4000) || null,
      updated_at: new Date().toISOString(),
    }),
  });

  return json({ ok: true, campaign: rows?.[0] || null });
}


async function updateCampaignStatus(request, env, campaignId) {
  const b = await bodyJson(request);
  const nextStatus = String(b.status || "").trim().toLowerCase();
  const statuses = new Set([
    "draft", "scheduled", "active", "paused", "completed", "canceled"
  ]);

  if (!statuses.has(nextStatus))
    return json({ error: "invalid campaign status" }, 400);

  const rows = await sb(
    env,
    `campaigns?id=eq.${encodeURIComponent(campaignId)}&organization_id=eq.${ORG_ID}&select=*`
  );
  const campaign = rows?.[0];

  if (!campaign)
    return json({ error: "campaign not found" }, 404);

  if (campaign.status === nextStatus)
    return json({ ok: true, campaign });

  const transitions = {
    draft: new Set(["scheduled", "active", "canceled"]),
    scheduled: new Set(["draft", "active", "canceled"]),
    active: new Set(["paused", "completed", "canceled"]),
    paused: new Set(["active", "completed", "canceled"]),
    completed: new Set(),
    canceled: new Set(),
  };

  if (!transitions[campaign.status]?.has(nextStatus))
    return json({
      error: `campaign cannot move from ${campaign.status} to ${nextStatus}`
    }, 409);

  if (nextStatus === "scheduled" && !campaign.starts_at)
    return json({ error: "scheduled campaign requires a start date" }, 409);

  if (nextStatus === "completed" && campaign.delivery_target_plays != null) {
    const required = Number(campaign.delivery_target_plays || 0)
      + Number(campaign.makegood_plays || 0);
    const delivered = await verifiedCampaignPlayCount(env, campaignId);

    if (delivered < required)
      return json({
        error: "campaign still owes verified delivery",
        delivered_plays: delivered,
        required_plays: required,
        remaining_plays: required - delivered,
      }, 409);
  }

  const changed = await sb(
    env,
    `campaigns?id=eq.${encodeURIComponent(campaignId)}&organization_id=eq.${ORG_ID}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  return json({ ok: true, campaign: changed?.[0] || null });
}


async function verifiedCampaignPlayCount(env, campaignId) {
  const [plays, screens] = await Promise.all([
    sb(
      env,
      `playback_daily?organization_id=eq.${ORG_ID}&campaign_id=eq.${encodeURIComponent(campaignId)}&select=screen_id,play_count`
    ),
    sb(
      env,
      `screens?organization_id=eq.${ORG_ID}&select=id,is_test`
    )
  ]);

  const screenMap = new Map((screens || []).map(x => [x.id, x]));
  return (plays || []).reduce((total, row) => {
    if (row.screen_id && screenMap.get(row.screen_id)?.is_test) return total;
    return total + Number(row.play_count || 0);
  }, 0);
}


async function updateCampaignDelivery(request, env, campaignId) {
  const rows = await sb(
    env,
    `campaigns?id=eq.${encodeURIComponent(campaignId)}&organization_id=eq.${ORG_ID}&select=*`
  );
  const campaign = rows?.[0];
  if (!campaign) return json({ error: "campaign not found" }, 404);

  if (campaign.status === "completed" || campaign.status === "canceled")
    return json({ error: "terminal campaigns cannot change delivery terms" }, 409);

  const b = await bodyJson(request);
  const patch = { updated_at: new Date().toISOString() };

  if (Object.prototype.hasOwnProperty.call(b, "dayparts")) {
    const parsed = normalizeWeeklySchedule(b.dayparts, "dayparts");
    if (parsed.error)
      return json({ error: parsed.error }, 400);
    patch.dayparts = parsed.value;
  }

  let target = campaign.delivery_target_plays == null
    ? null
    : Number(campaign.delivery_target_plays);
  let makegood = Number(campaign.makegood_plays || 0);

  if (Object.prototype.hasOwnProperty.call(b, "delivery_target_plays")) {
    if (b.delivery_target_plays === null || b.delivery_target_plays === "") {
      target = null;
      patch.delivery_target_plays = null;
    } else {
      const value = Number(b.delivery_target_plays);
      if (!Number.isSafeInteger(value) || value <= 0)
        return json({ error: "delivery_target_plays must be a positive integer" }, 400);
      target = value;
      patch.delivery_target_plays = value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(b, "makegood_plays")) {
    const value = Number(b.makegood_plays);
    if (!Number.isSafeInteger(value) || value < 0)
      return json({ error: "makegood_plays must be a non-negative integer" }, 400);
    makegood = value;
    patch.makegood_plays = value;
  }

  if (makegood > 0 && target === null)
    return json({ error: "makegood plays require a delivery target" }, 400);

  const parseDate = (value, label) => {
    if (value === null || value === "") return { value: null };
    const time = new Date(value).getTime();
    if (!Number.isFinite(time))
      return { error: `${label} must be a valid date` };
    return { value: new Date(time).toISOString() };
  };

  let startsAt = campaign.starts_at;
  let endsAt = campaign.ends_at;

  if (Object.prototype.hasOwnProperty.call(b, "starts_at")) {
    const parsed = parseDate(b.starts_at, "starts_at");
    if (parsed.error) return json({ error: parsed.error }, 400);
    startsAt = parsed.value;
    patch.starts_at = parsed.value;
  }

  if (Object.prototype.hasOwnProperty.call(b, "ends_at")) {
    const parsed = parseDate(b.ends_at, "ends_at");
    if (parsed.error) return json({ error: parsed.error }, 400);
    endsAt = parsed.value;
    patch.ends_at = parsed.value;
  }

  if (startsAt && endsAt &&
      new Date(endsAt).getTime() <= new Date(startsAt).getTime())
    return json({ error: "ends_at must be after starts_at" }, 400);

  if (campaign.status === "scheduled" && !startsAt)
    return json({ error: "scheduled campaign requires a start date" }, 409);

  if (campaign.status === "active" && endsAt &&
      new Date(endsAt).getTime() <= Date.now())
    return json({ error: "active campaign end must be in the future" }, 409);

  const changed = await sb(
    env,
    `campaigns?id=eq.${encodeURIComponent(campaignId)}&organization_id=eq.${ORG_ID}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    }
  );

  return json({ ok: true, campaign: changed?.[0] || null });
}


function campaignDeliverySnapshot(campaign, deliveredPlays, nowMs = Date.now()) {
  const baseTarget = campaign.delivery_target_plays == null
    ? null
    : Number(campaign.delivery_target_plays);
  const makegood = Number(campaign.makegood_plays || 0);
  const goal = baseTarget == null ? null : baseTarget + makegood;
  const delivered = Number(deliveredPlays || 0);

  if (!goal) {
    return {
      delivery_target_plays: baseTarget,
      makegood_plays: makegood,
      delivery_goal_plays: null,
      remaining_plays: null,
      delivery_percent: null,
      expected_plays_by_now: null,
      pace_percent: null,
      projected_total_plays: null,
      projected_shortfall: null,
      delivery_health: "not_targeted",
    };
  }

  const remaining = Math.max(goal - delivered, 0);
  const deliveryPercent = Math.round((delivered / goal) * 1000) / 10;
  const start = campaign.starts_at ? new Date(campaign.starts_at).getTime() : null;
  const end = campaign.ends_at ? new Date(campaign.ends_at).getTime() : null;

  let expected = null;
  let pace = null;
  let projected = null;
  let shortfall = null;
  let health = "tracking";

  if (delivered >= goal) {
    health = "delivered";
  } else if (start !== null && Number.isFinite(start) && nowMs < start) {
    health = "scheduled";
    expected = 0;
  } else if (end !== null && Number.isFinite(end) && nowMs >= end) {
    expected = goal;
    pace = Math.round((delivered / goal) * 1000) / 10;
    projected = delivered;
    shortfall = remaining;
    health = "under_delivered";
  } else if (start !== null && end !== null &&
             Number.isFinite(start) && Number.isFinite(end) && end > start) {
    const elapsed = Math.max(0, Math.min(1, (nowMs - start) / (end - start)));
    expected = Math.floor(goal * elapsed);

    if (elapsed > 0) {
      projected = Math.max(delivered, Math.round(delivered / elapsed));
      shortfall = Math.max(goal - projected, 0);
    }

    if (expected > 0) {
      pace = Math.round((delivered / expected) * 1000) / 10;
      health = pace < 90 ? "behind" : pace > 110 ? "ahead" : "on_pace";
    } else {
      health = "on_pace";
    }
  }

  return {
    delivery_target_plays: baseTarget,
    makegood_plays: makegood,
    delivery_goal_plays: goal,
    remaining_plays: remaining,
    delivery_percent: deliveryPercent,
    expected_plays_by_now: expected,
    pace_percent: pace,
    projected_total_plays: projected,
    projected_shortfall: shortfall,
    delivery_health: health,
  };
}


async function adminCampaignReports(env) {
  const [campaigns, businesses, plays, media, screens, locations, playlistItems] = await Promise.all([
    sb(env, `campaigns?organization_id=eq.${ORG_ID}&select=*&order=created_at.desc`),
    sb(env, `businesses?organization_id=eq.${ORG_ID}&select=id,name`),
    sb(env, `playback_daily?organization_id=eq.${ORG_ID}&campaign_id=not.is.null&select=campaign_id,screen_id,media_asset_id,play_date,play_count,seconds_played,first_played_at,last_played_at&order=play_date.asc`),
    sb(env, `media_assets?organization_id=eq.${ORG_ID}&select=id,title,kind`),
    sb(env, `screens?organization_id=eq.${ORG_ID}&select=id,name,location_id,is_test`),
    sb(env, `locations?organization_id=eq.${ORG_ID}&select=id,business_id,name,address_line1,city,state`),
    sb(env, `playlist_items?organization_id=eq.${ORG_ID}&campaign_id=not.is.null&select=campaign_id,media_asset_id`)
  ]);

  const businessMap = new Map((businesses || []).map(x => [x.id, x]));
  const mediaMap = new Map((media || []).map(x => [x.id, x]));
  const screenMap = new Map((screens || []).map(x => [x.id, x]));
  const locationMap = new Map((locations || []).map(x => [x.id, x]));
  const grouped = new Map();

  function ensureGroup(campaignId) {
    if (!grouped.has(campaignId)) {
      grouped.set(campaignId, {
        plays: 0,
        seconds: 0,
        screens: new Set(),
        first_played_at: null,
        last_played_at: null,
        daily: new Map(),
        creatives: new Map(),
        locations: new Map(),
      });
    }
    return grouped.get(campaignId);
  }

  function ensureCreative(g, mediaId) {
    if (!g.creatives.has(mediaId)) {
      const m = mediaMap.get(mediaId);
      g.creatives.set(mediaId, {
        media_id: mediaId,
        creative_name: m?.title || "Unknown creative",
        media_type: m?.kind || "unknown",
        plays: 0,
        seconds_played: 0,
        screens: new Set(),
        first_played_at: null,
        last_played_at: null,
      });
    }
    return g.creatives.get(mediaId);
  }

  for (const item of playlistItems || []) {
    if (!item.campaign_id || !item.media_asset_id) continue;
    ensureCreative(ensureGroup(item.campaign_id), item.media_asset_id);
  }

  for (const row of plays || []) {
    if (!row.campaign_id) continue;

    // Internal/demo screens retain proof-of-play, but never count toward
    // advertiser/customer-facing delivery metrics.
    if (row.screen_id && screenMap.get(row.screen_id)?.is_test) continue;

    const g = ensureGroup(row.campaign_id);
    const count = Number(row.play_count || 0);
    const seconds = Number(row.seconds_played || 0);

    g.plays += count;
    g.seconds += seconds;
    if (row.screen_id) g.screens.add(row.screen_id);

    if (row.first_played_at &&
        (!g.first_played_at || new Date(row.first_played_at) < new Date(g.first_played_at)))
      g.first_played_at = row.first_played_at;

    if (row.last_played_at &&
        (!g.last_played_at || new Date(row.last_played_at) > new Date(g.last_played_at)))
      g.last_played_at = row.last_played_at;

    const day = row.play_date;
    const d = g.daily.get(day) || { date: day, plays: 0, seconds: 0 };
    d.plays += count;
    d.seconds += seconds;
    g.daily.set(day, d);

    if (row.media_asset_id) {
      const c = ensureCreative(g, row.media_asset_id);
      c.plays += count;
      c.seconds_played += seconds;
      if (row.screen_id) c.screens.add(row.screen_id);

      if (row.first_played_at &&
          (!c.first_played_at || new Date(row.first_played_at) < new Date(c.first_played_at)))
        c.first_played_at = row.first_played_at;

      if (row.last_played_at &&
          (!c.last_played_at || new Date(row.last_played_at) > new Date(c.last_played_at)))
        c.last_played_at = row.last_played_at;
    }

    if (row.screen_id) {
      const screen = screenMap.get(row.screen_id);
      const location = screen?.location_id ? locationMap.get(screen.location_id) : null;
      const locationKey = location?.id || `screen:${row.screen_id}`;

      if (!g.locations.has(locationKey)) {
        const host = location?.business_id ? businessMap.get(location.business_id) : null;
        g.locations.set(locationKey, {
          location_id: location?.id || null,
          location_name: location?.name || screen?.name || "Unassigned screen",
          business_name: host?.name || null,
          address: location
            ? [location.address_line1, location.city, location.state].filter(Boolean).join(", ")
            : null,
          plays: 0,
          seconds_played: 0,
          screens: new Set(),
          first_played_at: null,
          last_played_at: null,
        });
      }

      const l = g.locations.get(locationKey);
      l.plays += count;
      l.seconds_played += seconds;
      l.screens.add(row.screen_id);

      if (row.first_played_at &&
          (!l.first_played_at || new Date(row.first_played_at) < new Date(l.first_played_at)))
        l.first_played_at = row.first_played_at;

      if (row.last_played_at &&
          (!l.last_played_at || new Date(row.last_played_at) > new Date(l.last_played_at)))
        l.last_played_at = row.last_played_at;
    }
  }

  return (campaigns || []).map(c => {
    const g = grouped.get(c.id);
    const advertiser = businessMap.get(c.advertiser_business_id);
    const delivery = campaignDeliverySnapshot(c, g?.plays || 0);

    return {
      campaign_id: c.id,
      campaign_name: c.name,
      advertiser_business_id: c.advertiser_business_id,
      advertiser_name: advertiser?.name || null,
      status: c.status,
      price_cents: c.price_cents,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      plays: g?.plays || 0,
      seconds_played: g?.seconds || 0,
      screen_count: g?.screens?.size || 0,
      first_played_at: g?.first_played_at || null,
      last_played_at: g?.last_played_at || null,
      ...delivery,
      daily: g ? Array.from(g.daily.values()).sort((a,b) => String(a.date).localeCompare(String(b.date))) : [],
      creatives: g ? Array.from(g.creatives.values())
        .map(x => ({
          media_id: x.media_id,
          creative_name: x.creative_name,
          media_type: x.media_type,
          plays: x.plays,
          seconds_played: x.seconds_played,
          screen_count: x.screens.size,
          first_played_at: x.first_played_at,
          last_played_at: x.last_played_at,
        }))
        .sort((a,b) => b.plays - a.plays) : [],
      locations: g ? Array.from(g.locations.values())
        .map(x => ({
          location_id: x.location_id,
          location_name: x.location_name,
          business_name: x.business_name,
          address: x.address,
          plays: x.plays,
          seconds_played: x.seconds_played,
          screen_count: x.screens.size,
          first_played_at: x.first_played_at,
          last_played_at: x.last_played_at,
        }))
        .sort((a,b) => b.plays - a.plays) : [],
    };
  });
}

async function financeSnapshot(env, auth = null) {
  const brokerId = brokerIdFromAuth(auth);
  const campaignScope = brokerId ? `&broker_user_id=eq.${encodeURIComponent(brokerId)}` : "";
  const campaigns = await sb(
    env,
    `campaigns?organization_id=eq.${ORG_ID}${campaignScope}&select=price_cents,broker_commission_percent,status`
  );

  const booked = (campaigns || []).filter(c =>
    ["scheduled","active","paused","completed"].includes(c.status)
  );
  const bookedRevenueCents = booked.reduce((n,c)=>n+Number(c.price_cents||0),0);
  const brokerCommissionCents = booked.reduce(
    (n,c)=>n+Math.round(Number(c.price_cents||0)*Number(c.broker_commission_percent||0)/100),0
  );

  let hostAnnualCommitmentCents = 0;
  let hardwareCostCents = 0;
  let setupCostCents = 0;

  if (!brokerId) {
    const screens = await sb(
      env,
      `screens?organization_id=eq.${ORG_ID}&is_test=eq.false&select=host_annual_pay_cents,hardware_cost_cents,setup_cost_cents`
    );
    hostAnnualCommitmentCents = (screens || []).reduce((n,x)=>n+Number(x.host_annual_pay_cents||0),0);
    hardwareCostCents = (screens || []).reduce((n,x)=>n+Number(x.hardware_cost_cents||0),0);
    setupCostCents = (screens || []).reduce((n,x)=>n+Number(x.setup_cost_cents||0),0);
  }

  const cash = await billingFinanceSnapshot(env, brokerId);

  return {
    booked_revenue_cents: bookedRevenueCents,
    broker_commission_cents: brokerCommissionCents,
    broker_commission_booked_cents: brokerCommissionCents,
    host_annual_commitment_cents: hostAnnualCommitmentCents,
    hardware_cost_cents: hardwareCostCents,
    setup_cost_cents: setupCostCents,
    contribution_cents:
      bookedRevenueCents - brokerCommissionCents -
      hostAnnualCommitmentCents - hardwareCostCents - setupCostCents,
    ...cash,
  };
}

async function publicNetworkStats(env) {
  const [screens, locations, campaigns, plays] = await Promise.all([
    sb(env, `screens?organization_id=eq.${ORG_ID}&select=id,location_id,last_seen_at,is_test,status,deployment_class`),
    sb(env, `locations?organization_id=eq.${ORG_ID}&select=id,host_status`),
    sb(env, `campaigns?organization_id=eq.${ORG_ID}&select=id,status,starts_at,ends_at`),
    sb(env, `playback_daily?organization_id=eq.${ORG_ID}&select=screen_id,play_date,play_count,last_played_at`),
  ]);

  const now = Date.now();
  const onlineCutoff = now - 120000;
  const dayCutoff = now - 86400000;

  const commercialScreens = (screens || []).filter(s =>
    !s.is_test &&
    s.status === "active" &&
    ["pilot", "production"].includes(s.deployment_class)
  );
  const commercialIds = new Set(commercialScreens.map(s => s.id));
  const commercialLocationIds = new Set(
    commercialScreens.map(s => s.location_id).filter(Boolean)
  );

  const activeCampaigns = (campaigns || []).filter(c => {
    const starts = c.starts_at ? new Date(c.starts_at).getTime() : null;
    const ends = c.ends_at ? new Date(c.ends_at).getTime() : null;
    if (starts !== null && (!Number.isFinite(starts) || starts > now)) return false;
    if (ends !== null && (!Number.isFinite(ends) || ends <= now)) return false;
    return c.status === "active" || (
      c.status === "scheduled" && starts !== null && starts <= now
    );
  });

  const recentRows = (plays || []).filter(p =>
    commercialIds.has(p.screen_id) &&
    p.last_played_at &&
    new Date(p.last_played_at).getTime() > dayCutoff
  );

  const lastVerifiedAt = recentRows
    .map(p => p.last_played_at)
    .filter(Boolean)
    .sort()
    .pop() || null;

  const dailyPlays = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(now - offset * 86400000).toISOString().slice(0, 10);
    dailyPlays.push({
      date: d,
      plays: (plays || [])
        .filter(p => commercialIds.has(p.screen_id) && p.play_date === d)
        .reduce((n, p) => n + Number(p.play_count || 0), 0),
    });
  }

  return {
    network_state: commercialScreens.length ? "live" : "commissioning",
    screens: commercialScreens.length,
    online: commercialScreens.filter(s =>
      s.last_seen_at &&
      new Date(s.last_seen_at).getTime() > onlineCutoff
    ).length,
    locations: commercialLocationIds.size,
    active_campaigns: activeCampaigns.length,
    plays_24h: recentRows.reduce(
      (n, p) => n + Number(p.play_count || 0), 0
    ),
    last_verified_at: lastVerifiedAt,
    daily_plays: dailyPlays,
  };
}

async function stats(env) {
  const [screens, media, plays] = await Promise.all([
    sb(env, `screens?organization_id=eq.${ORG_ID}&select=id,last_seen_at,is_test`),
    sb(env, `media_assets?organization_id=eq.${ORG_ID}&status=eq.ready&select=id`),
    sb(env, `playback_daily?organization_id=eq.${ORG_ID}&select=screen_id,play_count,last_played_at`),
  ]);

  const cutoff = Date.now() - 120000;
  const dayCutoff = Date.now() - 86400000;

  const commercialScreens = (screens || []).filter(s => !s.is_test);
  const commercialIds = new Set(commercialScreens.map(s => s.id));

  return {
    screens: commercialScreens.length,
    online: commercialScreens
      .filter(s => s.last_seen_at && new Date(s.last_seen_at).getTime() > cutoff)
      .length,
    media: media?.length || 0,
    plays_24h: (plays || [])
      .filter(p =>
        commercialIds.has(p.screen_id) &&
        p.last_played_at &&
        new Date(p.last_played_at).getTime() > dayCutoff
      )
      .reduce((n, p) => n + Number(p.play_count || 0), 0),
    test_screens: (screens || []).filter(s => s.is_test).length,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/billing/webhook/stripe" && request.method === "POST")
        return stripeWebhook(request, env);

      const jsonGuard = await validateJsonMutation(request, url);
      if (jsonGuard) return jsonGuard;

      const authRoute = await handleAuthRoute(request, env, url);
      if (authRoute) return authRoute;

      if (url.pathname === "/api/portal/overview" && request.method === "GET")
        return portalOverview(request, env);

      if (url.pathname === "/api/health")
        return json({ ok: true, service: "coastloop", version: "0.27.7" });

      if (url.pathname === "/api/player/boot" && request.method === "POST")
        return bootPlayer(request, env);

      if (url.pathname === "/api/player/config" && request.method === "POST")
        return playerConfig(request, env);

      if (url.pathname === "/api/player/heartbeat" && request.method === "POST")
        return heartbeat(request, env);

      if (url.pathname === "/api/player/proof" && request.method === "POST")
        return proof(request, env);

      if (url.pathname.startsWith("/media/") &&
          (request.method === "GET" || request.method === "HEAD"))
        return serveMedia(request, env, url.pathname.split("/").pop());

      if (url.pathname === "/api/onboarding/session" && request.method === "GET")
        return venueOnboardingSession(request, env);

      if (url.pathname === "/api/onboarding/viewed" && request.method === "POST")
        return markVenueOnboardingViewed(request, env);

      if (url.pathname === "/api/onboarding/accept" && request.method === "POST")
        return acceptVenueOnboarding(request, env);

      if (url.pathname === "/api/onboarding/executed" && request.method === "GET")
        return executedVenueAgreement(request, env);

      if (url.pathname === "/api/public/packages" && request.method === "GET")
        return publicAdvertisingPackages(env);

      if (url.pathname === "/api/onboarding/advertiser/start" && request.method === "POST")
        return startAdvertiserCheckout(request, env);

      if (url.pathname === "/api/onboarding/advertiser/session" && request.method === "GET")
        return advertiserCheckoutSession(request, env);

      if (url.pathname === "/api/onboarding/advertiser/accept" && request.method === "POST")
        return acceptAdvertiserCheckout(request, env);

      if (url.pathname === "/api/onboarding/advertiser/executed" && request.method === "GET")
        return executedAdvertiserAgreement(request, env);

      if (url.pathname === "/api/public/network" && request.method === "GET")
        return json(await publicNetworkStats(env));

      if (url.pathname === "/api/public/lead" && request.method === "POST")
        return createPublicLead(request, env);

      if (url.pathname.startsWith("/api/broker/")) {
        const brokerAuth = await requireBrokerAccess(request, env);
        if (!brokerAuth)
          return json({ error: "unauthorized" }, 401);

        if (url.pathname === "/api/broker/prospects" && request.method === "GET")
          return json(await adminProspects(env, brokerAuth));

        if (url.pathname === "/api/broker/prospects" && request.method === "POST")
          return auditMutation(request, env, brokerAuth,
            { action: "prospect.create", entity_type: "prospect" },
            () => createAdminProspect(request, env, brokerAuth));

        const brokerPromote = url.pathname.match(/^\/api\/broker\/prospects\/([^/]+)\/promote$/);
        if (brokerPromote && request.method === "POST")
          return auditMutation(request, env, brokerAuth,
            { action: "prospect.promote", entity_type: "prospect", entity_id: brokerPromote[1] },
            () => promoteProspect(request, env, brokerPromote[1], brokerAuth));

        const brokerProspect = url.pathname.match(/^\/api\/broker\/prospects\/([^/]+)$/);
        if (brokerProspect && request.method === "PUT")
          return auditMutation(request, env, brokerAuth,
            { action: "prospect.update", entity_type: "prospect", entity_id: brokerProspect[1] },
            () => updateProspect(request, env, brokerProspect[1], brokerAuth));

        if (url.pathname === "/api/broker/businesses" && request.method === "GET")
          return json(await adminBusinesses(env, brokerAuth));

        if (url.pathname === "/api/broker/campaigns" && request.method === "GET")
          return json(await adminCampaigns(env, brokerAuth));

        if (url.pathname === "/api/broker/campaigns" && request.method === "POST")
          return auditMutation(request, env, brokerAuth,
            { action: "campaign.create", entity_type: "campaign" },
            () => createCampaign(request, env, brokerAuth));

        if (url.pathname === "/api/broker/finance" && request.method === "GET")
          return json(await financeSnapshot(env, brokerAuth));
      }

      if (url.pathname.startsWith("/api/admin/")) {
        const adminAuth = await requireAdminAccess(request, env);
        if (!adminAuth)
          return json({ error: "unauthorized" }, 401);

        if (url.pathname === "/api/admin/audit" && request.method === "GET")
          return json(await adminAuditEvents(env, url));

        if (url.pathname === "/api/admin/users" && request.method === "GET")
          return json(await adminUserDirectory(env));

        if (url.pathname === "/api/admin/users/invite" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "access.invitation.create", entity_type: "invitation" },
            () => createUserInvitation(request, env, adminAuth));

        const userAccess = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/access$/);
        if (userAccess && request.method === "PUT")
          return auditMutation(request, env, adminAuth,
            { action: "access.user.update", entity_type: "user", entity_id: userAccess[1] },
            () => updateUserAccess(request, env, adminAuth, userAccess[1]));

        const invitation = url.pathname.match(/^\/api\/admin\/invitations\/([^/]+)$/);
        if (invitation && request.method === "DELETE")
          return auditMutation(request, env, adminAuth,
            { action: "access.invitation.revoke", entity_type: "invitation", entity_id: invitation[1] },
            () => revokeUserInvitation(request, env, adminAuth, invitation[1]));

        if (url.pathname === "/api/admin/stats" && request.method === "GET")
          return json(await stats(env));

        if (url.pathname === "/api/admin/finance" && request.method === "GET")
          return json(await financeSnapshot(env, adminAuth));

        if (url.pathname === "/api/admin/billing/config" && request.method === "GET")
          return json(await billingConfig(env));

        if (url.pathname === "/api/admin/billing/invoices" && request.method === "GET")
          return json(await adminBillingInvoices(env));

        if (url.pathname === "/api/admin/billing/invoices" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "billing.invoice.create", entity_type: "invoice" },
            () => createBillingInvoice(request, env, adminAuth?.user?.id || null));

        const sendInvoice = url.pathname.match(/^\/api\/admin\/billing\/invoices\/([^/]+)\/send$/);
        if (sendInvoice && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "billing.invoice.send", entity_type: "invoice", entity_id: sendInvoice[1] },
            () => sendBillingInvoice(request, env, sendInvoice[1]));

        const recordPayment = url.pathname.match(/^\/api\/admin\/billing\/invoices\/([^/]+)\/payments$/);
        if (recordPayment && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "billing.payment.record", entity_type: "invoice", entity_id: recordPayment[1] },
            () => recordBillingPayment(request, env, recordPayment[1], adminAuth?.user?.id || null));

        const recordRefund = url.pathname.match(/^\/api\/admin\/billing\/invoices\/([^/]+)\/refunds$/);
        if (recordRefund && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "billing.refund.record", entity_type: "invoice", entity_id: recordRefund[1] },
            () => recordBillingRefund(request, env, recordRefund[1], adminAuth?.user?.id || null));

        if (url.pathname === "/api/admin/billing/transactions" && request.method === "GET")
          return json(await adminBillingTransactions(env));

        if (url.pathname === "/api/admin/billing/payouts" && request.method === "GET")
          return json(await adminBillingPayouts(env));

        if (url.pathname === "/api/admin/billing/broker-payouts" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "billing.broker_payout.create", entity_type: "broker_payout" },
            () => createBrokerPayout(request, env, adminAuth?.user?.id || null));

        const brokerPayout = url.pathname.match(/^\/api\/admin\/billing\/broker-payouts\/([^/]+)$/);
        if (brokerPayout && request.method === "PUT")
          return auditMutation(request, env, adminAuth,
            { action: "billing.broker_payout.update", entity_type: "broker_payout", entity_id: brokerPayout[1] },
            () => updateBrokerPayout(request, env, brokerPayout[1]));

        if (url.pathname === "/api/admin/billing/host-payouts" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "billing.host_payout.create", entity_type: "host_payout" },
            () => createHostPayout(request, env, adminAuth?.user?.id || null));

        const hostPayout = url.pathname.match(/^\/api\/admin\/billing\/host-payouts\/([^/]+)$/);
        if (hostPayout && request.method === "PUT")
          return auditMutation(request, env, adminAuth,
            { action: "billing.host_payout.update", entity_type: "host_payout", entity_id: hostPayout[1] },
            () => updateHostPayout(request, env, hostPayout[1]));

        if (url.pathname === "/api/admin/screens" && request.method === "GET")
          return json(await adminScreens(env));

        if (url.pathname === "/api/admin/screens/pair" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "screen.pair", entity_type: "screen" },
            () => pairScreen(request, env));

        if (url.pathname === "/api/admin/onboarding/packages" && request.method === "GET")
          return json(await adminAdvertisingPackages(env));

        if (url.pathname === "/api/admin/onboarding/packages" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "onboarding.package.create", entity_type: "advertising_package" },
            () => createAdvertisingPackage(request, env, adminAuth));

        if (url.pathname === "/api/admin/onboarding" && request.method === "GET")
          return json(await adminOnboarding(env));

        if (url.pathname === "/api/admin/onboarding/venue-invites" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "onboarding.venue_invite.create", entity_type: "agreement" },
            () => createVenueInvite(request, env, adminAuth));

        if (url.pathname === "/api/admin/prospects" && request.method === "GET")
          return json(await adminProspects(env, adminAuth));

        if (url.pathname === "/api/admin/prospects" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "prospect.create", entity_type: "prospect" },
            () => createAdminProspect(request, env, adminAuth));

        const promote = url.pathname.match(/^\/api\/admin\/prospects\/([^/]+)\/promote$/);
        if (promote && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "prospect.promote", entity_type: "prospect", entity_id: promote[1] },
            () => promoteProspect(request, env, promote[1], adminAuth));

        const prospect = url.pathname.match(/^\/api\/admin\/prospects\/([^/]+)$/);
        if (prospect && request.method === "PUT")
          return auditMutation(request, env, adminAuth,
            { action: "prospect.update", entity_type: "prospect", entity_id: prospect[1] },
            () => updateProspect(request, env, prospect[1], adminAuth));

        if (url.pathname === "/api/admin/businesses" && request.method === "GET")
          return json(await adminBusinesses(env, adminAuth));

        const locationSchedule = url.pathname.match(
          /^\/api\/admin\/locations\/([^/]+)\/schedule$/
        );
        if (locationSchedule && request.method === "PUT")
          return auditMutation(request, env, adminAuth,
            {
              action: "location.schedule.update",
              entity_type: "location",
              entity_id: locationSchedule[1],
            },
            () => updateLocationSchedule(
              request, env, locationSchedule[1], adminAuth
            ));

        if (url.pathname === "/api/admin/campaigns" && request.method === "GET")
          return json(await adminCampaigns(env, adminAuth));

        if (url.pathname === "/api/admin/reports/campaigns" && request.method === "GET")
          return json(await adminCampaignReports(env));

        if (url.pathname === "/api/admin/campaigns" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "campaign.create", entity_type: "campaign" },
            () => createCampaign(request, env, adminAuth));

        const campaignDeliveryMatch = url.pathname.match(
          /^\/api\/admin\/campaigns\/([^/]+)\/delivery$/
        );
        if (campaignDeliveryMatch && request.method === "PATCH")
          return auditMutation(request, env, adminAuth,
            {
              action: "campaign.delivery.update",
              entity_type: "campaign",
              entity_id: campaignDeliveryMatch[1],
            },
            () => updateCampaignDelivery(
              request, env, campaignDeliveryMatch[1]
            ));

        const campaignStatus = url.pathname.match(/^\/api\/admin\/campaigns\/([^/]+)\/status$/);
        if (campaignStatus && request.method === "PUT")
          return auditMutation(request, env, adminAuth,
            { action: "campaign.status", entity_type: "campaign", entity_id: campaignStatus[1] },
            () => updateCampaignStatus(request, env, campaignStatus[1]));

        if (url.pathname === "/api/admin/media" && request.method === "GET")
          return json(await adminMedia(env));

        if (url.pathname === "/api/admin/media" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "media.upload", entity_type: "media" },
            () => uploadMedia(request, env, adminAuth));

        const mediaApproval = url.pathname.match(
          /^\/api\/admin\/media\/([^/]+)\/approval$/
        );
        if (mediaApproval && request.method === "PUT")
          return auditMutation(request, env, adminAuth,
            {
              action: "media.approval.update",
              entity_type: "media",
              entity_id: mediaApproval[1],
            },
            () => updateMediaApproval(
              request, env, adminAuth, mediaApproval[1]
            ));

        if (url.pathname === "/api/admin/playlists" && request.method === "GET")
          return json(await listPlaylists(env));

        if (url.pathname === "/api/admin/playlists" && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "playlist.create", entity_type: "playlist" },
            () => createPlaylist(request, env));

        const assign = url.pathname.match(/^\/api\/admin\/screens\/([^/]+)\/assign$/);
        if (assign && request.method === "PUT")
          return auditMutation(request, env, adminAuth,
            { action: "screen.assign", entity_type: "screen", entity_id: assign[1] },
            () => assignScreen(request, env, assign[1]));

        const resetPairing = url.pathname.match(/^\/api\/admin\/screens\/([^/]+)\/reset-pairing$/);
        if (resetPairing && request.method === "POST")
          return auditMutation(request, env, adminAuth,
            { action: "screen.reset_pairing", entity_type: "screen", entity_id: resetPairing[1] },
            () => resetTestScreenPairing(env, resetPairing[1]));

        const items = url.pathname.match(/^\/api\/admin\/playlists\/([^/]+)\/items$/);
        if (items && request.method === "PUT")
          return auditMutation(request, env, adminAuth,
            { action: "playlist.items.set", entity_type: "playlist", entity_id: items[1] },
            () => setPlaylistItems(request, env, items[1]));
      }

      return json({ error: "not found" }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "server error" }, 500);
    }
  },
};
