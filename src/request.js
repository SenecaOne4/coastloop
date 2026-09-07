const response = (message, status) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export async function jsonBody(request) {
  if (!request.body) return {};
  try {
    const data = await request.json();
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export async function validateJsonMutation(request, url) {
  if (!["POST", "PUT", "PATCH"].includes(request.method))
    return null;

  if (url.pathname === "/api/billing/webhook/stripe" ||
      url.pathname === "/api/admin/media")
    return null;

  if (!url.pathname.startsWith("/api/"))
    return null;

  if (!request.body)
    return null;

  const maxBytes =
    url.pathname === "/api/player/boot" ? 16 * 1024 :
    url.pathname === "/api/public/lead" ? 32 * 1024 :
    256 * 1024;

  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes)
    return response("request body too large", 413);

  const clone = request.clone();
  const reader = clone.body?.getReader();
  if (!reader)
    return null;

  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return response("request body too large", 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  if (total === 0)
    return null;

  const type = String(request.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!(type === "application/json" || type.endsWith("+json")))
    return response("application/json required", 415);

  const text = new TextDecoder().decode(bytes);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return response("invalid JSON body", 400);
  }

  if (!data || typeof data !== "object" || Array.isArray(data))
    return response("JSON object required", 400);

  return null;
}
