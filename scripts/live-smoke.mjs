import fs from "node:fs";

function vars(path) {
  const out = {};
  if (!fs.existsSync(path)) return out;
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    out[line.slice(0, i).trim()] = value;
  }
  return out;
}

const env = vars(".dev.vars");
const base = process.env.COASTLOOP_URL || "https://coastloop.site";
const token = process.env.ADMIN_TOKEN || env.ADMIN_TOKEN;

async function request(name, path, expected, auth = false) {
  const headers = {};
  if (auth) {
    if (!token) throw new Error("ADMIN_TOKEN unavailable");
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(base + path, {
    headers,
    signal: AbortSignal.timeout(8000),
  });

  if (response.status !== expected)
    throw new Error(`${name}: expected ${expected}, got ${response.status}`);

  console.log(`${name}=PASS`);
  return response;
}

try {
  const health = await request("HEALTH", "/api/health", 200);
  const healthData = await health.json();
  if (healthData.version !== "0.26.5")
    throw new Error(`unexpected version ${healthData.version}`);
  console.log("VERSION_0_26_5=PASS");

  await request("ADMIN_GUARD", "/api/admin/billing/invoices", 401);

  const config = await request(
    "BILLING_CONFIG",
    "/api/admin/billing/config",
    200,
    true
  );
  const configData = await config.json();

  await request("INVOICES", "/api/admin/billing/invoices", 200, true);
  await request("TRANSACTIONS", "/api/admin/billing/transactions", 200, true);
  await request("PAYOUTS", "/api/admin/billing/payouts", 200, true);
  await request("FINANCE", "/api/admin/finance", 200, true);
  await request("AUDIT", "/api/admin/audit?limit=1", 200, true);

  console.log(`STRIPE=${configData.stripe_configured ? "CONNECTED" : "NOT_CONNECTED"}`);
  console.log(`STRIPE_WEBHOOK=${configData.stripe_webhook_configured ? "CONNECTED" : "NOT_CONNECTED"}`);
  console.log("LIVE_SMOKE=PASS");
} catch (error) {
  console.error("LIVE_SMOKE=FAIL", error.message);
  process.exit(1);
}
