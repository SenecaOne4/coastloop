(() => {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const token = params.get("t") || "";
  let session = null;

  const esc = (v) => String(v ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");

  const human = (v, fallback = "None") => {
    if (v === null || v === undefined || v === "") return fallback;
    if (typeof v === "string" || typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (Array.isArray(v)) return v.length ? v.join(", ") : fallback;
    if (typeof v === "object") {
      if (Number.isInteger(v.amount_cents)) {
        const amount = `$${(v.amount_cents / 100).toFixed(2)}`;
        return v.schedule ? `${amount} — ${v.schedule}` : amount;
      }
      return Object.entries(v).map(([k,val]) =>
        `${k.replaceAll("_"," ")}: ${human(val,"")}`).join("; ");
    }
    return String(v);
  };

  const api = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: { "content-type":"application/json", ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  };

  function showFatal(message) {
    $("loading").classList.add("ob-hidden");
    $("app").classList.add("ob-hidden");
    $("complete").classList.add("ob-hidden");
    $("fatal").textContent = message;
    $("fatal").classList.remove("ob-hidden");
  }

  function field(id, value) { $(id).value = value || ""; }

  function renderPlacements(rows) {
    $("placements").innerHTML = rows.map((p) => `
      <div class="ob-placement">
        <h3>${esc(p.zone_label || p.screen_label || "CoastLoop placement")}</h3>
        <dl class="ob-kv">
          <dt>Screen</dt><dd>${esc(p.screen_label || "Placement screen")}</dd>
          <dt>Screen count</dt><dd>${esc(p.screen_count)}</dd>
          <dt>Operating mode</dt><dd>${esc(String(p.operating_mode || "").replaceAll("_"," "))}</dd>
          <dt>Schedule</dt><dd>${esc(human(p.operating_schedule,"As agreed"))}</dd>
          <dt>Notes</dt><dd>${esc(p.notes || "None")}</dd>
        </dl>
      </div>`).join("");
  }

  function renderTerms(t) {
    const rows = [
      ["Term", t.term_type],
      ["Your house content", t.house_inventory],
      ["Host compensation", t.host_compensation],
      ["Compensation schedule", t.compensation_schedule],
      ["Equipment / network", t.equipment_network_responsibility],
      ["Category exclusions", t.category_exclusions],
      ["Public venue listing", t.public_venue_listing],
      ["Approved placement photography", t.venue_photo_permission],
    ];
    $("termsSummary").innerHTML = rows.map(([k,v]) =>
      `<dt>${esc(k)}</dt><dd>${esc(human(v))}</dd>`).join("");
  }

  function showComplete(url) {
    $("loading").classList.add("ob-hidden");
    $("app").classList.add("ob-hidden");
    $("fatal").classList.add("ob-hidden");
    $("complete").classList.remove("ob-hidden");
    if (url) {
      $("executedLink").href = url;
      $("executedLink").classList.remove("ob-hidden");
    } else {
      $("executedLink").classList.add("ob-hidden");
    }
  }

  async function load() {
    if (!token) return showFatal("This CoastLoop placement link is incomplete.");

    try {
      session = await api(`/api/onboarding/session?token=${encodeURIComponent(token)}`);
      if (session.completed) return showComplete(session.executed_url);

      const v = session.venue || {};
      field("legalName", v.organization_legal_name);
      field("venueName", v.venue_display_name);
      field("address1", v.venue_address_line1);
      field("city", v.venue_city);
      field("state", v.venue_state);
      field("postal", v.venue_postal_code);
      field("signerName", v.signer_name);
      field("signerTitle", v.signer_title);
      field("signerEmail", v.signer_email);
      field("signerMobile", v.signer_mobile);
      field("signature", v.signer_name);

      $("intro").innerHTML =
        `We've prepared the placement for <strong>${esc(v.venue_display_name || "your venue")}</strong>. ` +
        `Confirm the TVs, commercial terms, and agreement below.`;

      renderPlacements(session.placements || []);
      renderTerms(session.commercial_terms || {});

      const placementText = (session.placements || []).map((p) => {
        const name = p.screen_label || p.zone_label || "screen";
        return `${p.screen_count} × ${name}`;
      }).join(", ") || "the prepared CoastLoop screen placement";
      $("agreementSummary").textContent = `You're authorizing CoastLoop on: ${placementText}.`;

      $("termsVersion").textContent =
        `${session.template.title} · version ${session.template.version}`;
      const content = session.template.full_terms || "<p>Agreement content unavailable.</p>";
      $("termsFrame").srcdoc = session.template.content_type === "text/plain"
        ? `<pre style="white-space:pre-wrap;font:15px/1.55 system-ui;padding:20px">${esc(content)}</pre>`
        : content;

      if (!session.can_sign) {
        $("legalGate").classList.remove("ob-hidden");
        $("signButton").disabled = true;
        $("signButton").textContent = "Counsel approval required before signing";
      }

      $("loading").classList.add("ob-hidden");
      $("app").classList.remove("ob-hidden");

      api("/api/onboarding/viewed", {
        method: "POST",
        body: JSON.stringify({ token }),
      }).catch(() => {});
    } catch (error) {
      showFatal(error.message);
    }
  }

  $("viewTerms").addEventListener("click", () => {
    const open = $("fullTerms").classList.toggle("open");
    $("viewTerms").textContent = open ? "Hide full agreement" : "View full agreement";
  });

  $("signerName").addEventListener("input", () => {
    if (!$("signature").dataset.edited) $("signature").value = $("signerName").value;
  });
  $("signature").addEventListener("input", () => {
    $("signature").dataset.edited = "1";
  });

  $("signButton").addEventListener("click", async () => {
    $("signError").classList.add("ob-hidden");
    $("signButton").disabled = true;
    $("signButton").textContent = "Approving placement…";

    const payload = {
      token,
      organization_legal_name: $("legalName").value,
      venue_display_name: $("venueName").value,
      venue_address_line1: $("address1").value,
      venue_city: $("city").value,
      venue_state: $("state").value,
      venue_postal_code: $("postal").value,
      signer_name: $("signerName").value,
      signer_title: $("signerTitle").value,
      signer_email: $("signerEmail").value,
      signer_mobile: $("signerMobile").value,
      signature_representation: $("signature").value,
      consent_to_electronic_records: $("cElectronic").checked,
      authority_confirmation: $("cAuthority").checked,
      reviewed_full_agreement: $("cReviewed").checked,
    };

    try {
      const result = await api("/api/onboarding/accept", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showComplete(result.executed_url);
    } catch (error) {
      $("signError").textContent = error.message;
      $("signError").classList.remove("ob-hidden");
      $("signButton").disabled = !session?.can_sign;
      $("signButton").textContent = "Sign & approve placement";
    }
  });

  load();
})();
