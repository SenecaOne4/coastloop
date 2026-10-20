import { api as sessionApi, readSession, logout as sessionLogout } from '/session.js';

const $ = s => document.querySelector(s);

function creativeAdminBuilding(job){
  return ['queued','claimed','rendering','processing']
    .includes(String(job?.status||'').toLowerCase());
}

function creativeAdminProgress(job){
  if(!creativeAdminBuilding(job)) return '';

  const status=String(job?.status||'queued').toLowerCase();
  const working=['claimed','rendering','processing'].includes(status);
  const pct=working ? 72 : 22;
  const label=working
    ? 'GENNY is crafting this campaign'
    : 'Queued for GENNY';

  return `
    <div class="genny-admin-build">
      <div class="genny-admin-build-head">
        <strong>${label}</strong>
        <small>${working?'Signature render in progress':'Preparing luxury render'}</small>
      </div>
      <div class="genny-admin-progress"
           role="progressbar"
           aria-label="${label}">
        <div class="genny-admin-progress-fill"
             style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

function normalizeCreativeAdminPayload(payload){
  if(Array.isArray(payload)) return payload;
  if(Array.isArray(payload?.jobs)) return payload.jobs;
  if(Array.isArray(payload?.creative_jobs)) return payload.creative_jobs;
  return [];
}


let creativeStudioFilter='review';

function creativeStudioReleaseState(job){
  const md=job?.metadata && typeof job.metadata==='object' ? job.metadata : {};
  const revision=Number(job?.revision_number||md.revision_number||1);
  const releaseRevision=Number(md.client_review_release_revision||0);
  const explicitlyReleased=Boolean(
    md.client_review_released_at &&
    releaseRevision===revision
  );
  const historicallyReviewed=
    job?.review_status==='approved' ||
    job?.review_status==='changes_requested';

  return {
    md,
    revision,
    explicitlyReleased,
    releasedToClient:explicitlyReleased||historicallyReviewed
  };
}

function creativeStudioGroups(){
  const groups=new Map();

  for(const job of state.creativeJobs||[]){
    const root=String(job.parent_job_id||job.id);
    if(!groups.has(root)) groups.set(root,[]);
    groups.get(root).push(job);
  }

  return [...groups.entries()].map(([root,versions])=>{
    versions.sort((a,b)=>
      Number(b.revision_number||1)-Number(a.revision_number||1) ||
      String(b.created_at||'').localeCompare(String(a.created_at||''))
    );
    return {root,versions,latest:versions[0]};
  }).sort((a,b)=>
    String(b.latest.created_at||'').localeCompare(
      String(a.latest.created_at||'')
    )
  );
}

function creativeStudioBucket(job){
  const release=creativeStudioReleaseState(job);
  const building=creativeAdminBuilding(job);
  const needsReview=
    job.status==='completed' &&
    Boolean(job.output_asset_id) &&
    job.review_status==='pending' &&
    !release.releasedToClient;

  if(building || needsReview) return 'review';
  if(release.explicitlyReleased && job.review_status==='pending') return 'client';
  if(job.review_status==='approved') return 'approved';
  return 'history';
}

function creativeStudioStatus(job){
  const release=creativeStudioReleaseState(job);

  if(creativeAdminBuilding(job))
    return ['GENNY CREATING','creating'];

  if(
    job.status==='completed' &&
    job.output_asset_id &&
    job.review_status==='pending' &&
    !release.releasedToClient
  )
    return ['INTERNAL REVIEW','review'];

  if(release.explicitlyReleased && job.review_status==='pending')
    return ['WITH CLIENT','client'];

  if(job.review_status==='approved')
    return ['APPROVED','approved'];

  if(job.review_status==='changes_requested')
    return ['CHANGES REQUESTED','changes'];

  if(job.status==='failed')
    return ['FAILED','failed'];

  return [String(job.status||'').toUpperCase()||'CREATIVE','neutral'];
}

function renderCreativeStudioTabs(){
  const host=$('#creativeStudioTabs');
  if(!host) return;

  const groups=creativeStudioGroups();
  const counts={review:0,client:0,approved:0,history:0};

  for(const group of groups)
    counts[creativeStudioBucket(group.latest)]++;

  const tabs=[
    ['review','Needs review'],
    ['client','With client'],
    ['approved','Approved'],
    ['history','History']
  ];

  host.innerHTML=tabs.map(([key,label])=>`
    <button
      type="button"
      class="creative-studio-tab ${creativeStudioFilter===key?'is-active':''}"
      data-creative-filter="${key}">
      <span>${label}</span>
      <b>${counts[key]||0}</b>
    </button>
  `).join('');
}

function creativeStudioHistory(group){
  if(group.versions.length<2) return '';

  return `
    <details class="creative-studio-tech creative-studio-history">
      <summary>Version history · ${group.versions.length}</summary>
      <div class="creative-studio-history-list">
        ${group.versions.map(v=>{
          const status=creativeStudioStatus(v)[0];
          return `
            <div>
              <span>Revision ${Number(v.revision_number||1)}</span>
              <small>${esc(status)}</small>
            </div>
          `;
        }).join('')}
      </div>
    </details>
  `;
}

function creativeStudioCard(group){
  const j=group.latest;
  const release=creativeStudioReleaseState(j);
  const md=release.md;
  const [statusLabel,statusTone]=creativeStudioStatus(j);

  const advertiser=state.businesses.find(
    b=>b.id===j.advertiser_business_id
  );

  const needsInternalReview=
    j.status==='completed' &&
    Boolean(j.output_asset_id) &&
    j.review_status==='pending' &&
    !release.releasedToClient;

  const preview=j.output_asset_id
    ? `<button
         type="button"
         class="creative-studio-thumb creative-open-preview"
         data-job="${esc(j.id)}"
         data-asset="${esc(j.output_asset_id)}"
         data-kind="${esc(j.job_type||'image')}"
         data-title="${esc(md.title||'CoastLoop creative')}">
         ${
           j.job_type==='video'
             ? `<video
                  src="/media/${encodeURIComponent(j.output_asset_id)}"
                  muted
                  playsinline
                  preload="metadata"
                ></video>`
             : `<img
                  src="/media/${encodeURIComponent(j.output_asset_id)}"
                  alt="${esc(md.title||'CoastLoop creative')}"
                >`
         }
         <span>Open full review</span>
       </button>`
    : `<div class="creative-studio-thumb is-empty">
         <span>${creativeAdminBuilding(j)?'Crafting campaign':'No preview'}</span>
       </div>`;

  const actions=needsInternalReview
    ? `<div class="creative-studio-actions">
         <button
           type="button"
           class="creative-release-client creative-primary"
           data-job="${esc(j.id)}">
           Release to client
         </button>
         <button
           type="button"
           class="secondary creative-internal-refine"
           data-job="${esc(j.id)}">
           Refine internally
         </button>
       </div>
       <form
         class="creative-internal-revision-form"
         data-job="${esc(j.id)}"
         hidden>
         <label>
           <span>Internal art-direction notes</span>
           <textarea
             name="notes"
             maxlength="1200"
             required
             placeholder="Example: The steak should be a spectacular prime-steak hero with a perfect exterior sear. The current meat texture looks like mold."
           ></textarea>
         </label>
         <div class="creative-studio-form-actions">
           <button type="submit">Create refined version</button>
           <button type="button" class="secondary creative-internal-cancel">Cancel</button>
         </div>
       </form>`
    : '';

  const technical=`
    <details class="creative-studio-tech">
      <summary>Generation details</summary>
      <dl>
        <div><dt>Status</dt><dd>${esc(j.status||'')}</dd></div>
        <div><dt>Revision</dt><dd>${release.revision}</dd></div>
        <div><dt>Worker</dt><dd>${esc(j.claimed_by||'not assigned')}</dd></div>
        <div><dt>Attempts</dt><dd>${Number(j.attempt_count||0)}/${Number(j.max_attempts||0)}</dd></div>
        <div><dt>Quality</dt><dd>${esc(md.quality_profile||'legacy')}</dd></div>
        <div><dt>Steps</dt><dd>${esc(md.steps||'default')}</dd></div>
      </dl>
      <div class="creative-studio-prompt-detail">
        <strong>Positive prompt</strong>
        <p>${esc(String(md.positive_prompt||j.prompt||''))}</p>
      </div>
      ${md.negative_prompt?`
        <div class="creative-studio-prompt-detail">
          <strong>Negative prompt</strong>
          <p>${esc(String(md.negative_prompt))}</p>
        </div>
      `:''}
    </details>
  `;

  return `
    <article class="creative-studio-card ${needsInternalReview?'needs-review':''}">
      ${preview}
      <div class="creative-studio-card-body">
        <div class="creative-studio-card-top">
          <div>
            <strong>${esc(md.title||'CoastLoop creative')}</strong>
            <span>
              ${esc(advertiser?.name||md.business_name||'House / internal')}
              · Revision ${release.revision}
            </span>
          </div>
          <span class="creative-studio-status ${statusTone}">
            ${esc(statusLabel)}
          </span>
        </div>

        ${creativeAdminProgress(j)}

        ${needsInternalReview?`
          <p class="creative-studio-review-note">
            Private CoastLoop quality control. The client cannot see this render until you release it.
          </p>
        `:''}

        ${actions}
        ${technical}
        ${creativeStudioHistory(group)}
      </div>
    </article>
  `;
}

function renderCreativeStudio(){
  renderCreativeStudioTabs();

  const host=$('#creativeJobs');
  if(!host) return;

  const groups=creativeStudioGroups();
  const visible=groups.filter(
    g=>creativeStudioBucket(g.latest)===creativeStudioFilter
  );

  host.innerHTML=visible.length
    ? `<div class="creative-studio-grid">${visible.map(creativeStudioCard).join('')}</div>`
    : `<div class="creative-studio-empty">
         <strong>Nothing here right now.</strong>
         <span>Creative will appear automatically as it moves through the workflow.</span>
       </div>`;
}

const isCommercialScreen = s => Boolean(
  s &&
  !s.is_test &&
  ['pilot','production'].includes(s.deployment_class) &&
  s.location_id &&
  s.paired_at &&
  s.status !== 'retired'
);
const state = {
  token: sessionStorage.getItem('adminToken') || '',
  screens:[], media:[], creativeJobs:[], playlists:[], prospects:[], businesses:[],
  campaigns:[], campaignReports:[],
  userDirectory:{users:[],invitations:[]},
  finance:{},
  billingConfig:{},
  billingInvoices:[],
  billingTransactions:[],
  billingPayouts:{broker:[],host:[]},
  auditEvents:[],
  authConfig:{},
  currentInternalRole:null
};

if($('#token')) $('#token').value = state.token;

function authHeaders(extra={}) {
  return { authorization:`Bearer ${state.token}`, ...extra };
}

async function api(path, options={}) {
  if(!state.token) return sessionApi(path, options);

  const res = await fetch(path, {
    ...options,
    headers: authHeaders(options.headers || {})
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
}
function esc(v=''){ return String(v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function money(cents){ return '$'+(Number(cents||0)/100).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2}); }
function renderOpsCommandCenter(stats){
  const commercialScreens=(state.screens||[]).filter(isCommercialScreen);
  const attentionScreens=commercialScreens.filter(s=>
    s.status!=='active' || !online(s.last_seen_at)
  );

  const activeCampaigns=(state.campaigns||[]).filter(c=>c.status==='active');
  const targetedReports=(state.campaignReports||[]).filter(r=>
    Number(r.delivery_goal_plays||0)>0
  );

  const riskReports=targetedReports.filter(r=>{
    const h=String(r.delivery_health||'').toLowerCase();
    const pace=r.pace_percent==null?null:Number(r.pace_percent);
    return (
      h.includes('risk') ||
      h.includes('behind') ||
      h.includes('shortfall') ||
      (pace!==null && Number.isFinite(pace) && pace<80)
    );
  });

  const healthyReports=targetedReports.filter(r=>
    !riskReports.includes(r) &&
    (
      Number(r.delivery_percent||0)>=100 ||
      Number(r.pace_percent||0)>=95
    )
  );

  const finance=state.finance||{};
  const collected=Number(finance.net_collected_cents||0);
  const booked=Number(finance.booked_revenue_cents||0);
  const receivable=Number(finance.receivable_cents||0);
  const hostDue=Number(finance.host_payout_due_cents||0);
  const brokerDue=Number(finance.broker_payout_due_cents||0);

  const stateLabel=commercialScreens.length
    ? (attentionScreens.length ? 'NETWORK NEEDS ATTENTION' : 'NETWORK HEALTHY')
    : 'COMMERCIAL NETWORK · COMMISSIONING';

  const stateEl=$('#opsNetworkState');
  if(stateEl){
    stateEl.textContent=stateLabel;
    stateEl.className='ops-state '+(
      !commercialScreens.length ? 'commissioning' :
      attentionScreens.length ? 'risk' : 'good'
    );
  }

  const riskCards=riskReports
    .sort((a,b)=>Number(a.pace_percent||0)-Number(b.pace_percent||0))
    .slice(0,5)
    .map(r=>`
      <div class="ops-alert-row">
        <div>
          <strong>${esc(r.advertiser_name||'Advertiser')} · ${esc(r.campaign_name||'Campaign')}</strong>
          <small>${esc(String(r.delivery_health||'delivery watch').replaceAll('_',' '))}</small>
        </div>
        <div><strong>${r.delivery_percent==null?'—':Number(r.delivery_percent).toFixed(1)+'%'}</strong><small>delivered</small></div>
        <div><strong>${r.pace_percent==null?'—':Number(r.pace_percent).toFixed(1)+'%'}</strong><small>pace</small></div>
        <div><strong>${r.remaining_plays==null?'—':Number(r.remaining_plays).toLocaleString()}</strong><small>remaining</small></div>
      </div>
    `).join('');

  const screenCards=attentionScreens.slice(0,5).map(screen=>`
    <div class="ops-alert-row">
      <div>
        <strong>${esc(screen.name||'Screen')}</strong>
        <small>${esc(screen.status||'unknown')} · ${esc(screen.deployment_class||'unclassified')}</small>
      </div>
      <div><strong>${online(screen.last_seen_at)?'ONLINE':'OFFLINE'}</strong><small>health</small></div>
      <div><strong>${screen.last_seen_at?age(screen.last_seen_at):'Never'}</strong><small>last seen</small></div>
    </div>
  `).join('');

  $('#opsCommandCenter').innerHTML=`
    <div class="ops-scoreboard">
      <div><strong>${Number(stats.online||0)} / ${Number(stats.screens||0)}</strong><span>commercial screens online</span></div>
      <div><strong>${Number(stats.plays_24h||0).toLocaleString()}</strong><span>verified plays · 24h</span></div>
      <div><strong>${activeCampaigns.length}</strong><span>active campaigns</span></div>
      <div><strong>${riskReports.length}</strong><span>delivery risks</span></div>
      <div><strong>${money(booked)}</strong><span>booked revenue</span></div>
      <div><strong>${money(collected)}</strong><span>net collected</span></div>
      <div><strong>${money(receivable)}</strong><span>receivable</span></div>
      <div><strong>${money(hostDue)}</strong><span>host payouts due</span></div>
    </div>

    <div class="ops-strip">
      <span><b>${healthyReports.length}</b> targeted campaigns healthy</span>
      <span><b>${attentionScreens.length}</b> screens need attention</span>
      <span><b>${money(brokerDue)}</b> broker payouts due</span>
      <span><b>${money(finance.contribution_cents||0)}</b> modeled contribution</span>
    </div>

    <div class="ops-panels">
      <div class="ops-panel">
        <div class="ops-panel-head"><span>DELIVERY WATCH</span><strong>${riskReports.length}</strong></div>
        ${riskCards||'<div class="ops-empty">No campaign delivery risks detected.</div>'}
      </div>
      <div class="ops-panel">
        <div class="ops-panel-head"><span>SCREEN ATTENTION</span><strong>${attentionScreens.length}</strong></div>
        ${screenCards||'<div class="ops-empty">No commercial screens need attention.</div>'}
      </div>
    </div>
  `;
}



async function hydratePackageZoneEditors(){
  const editors=[...document.querySelectorAll('[data-package-zone-editor]')];
  if(!editors.length) return;

  let zones=[];
  try{
    const geography=await api('/api/admin/geography');
    zones=Array.isArray(geography?.zones)?geography.zones:[];
  }catch(error){
    editors.forEach(editor=>{
      editor.innerHTML=`<div class="muted tiny">Zone geography unavailable · ${esc(error.message||'request failed')}</div>`;
    });
    return;
  }

  for(const editor of editors){
    const packageId=editor.dataset.packageZoneEditor;
    if(!packageId) continue;

    try{
      const current=await api(`/api/admin/onboarding/packages/${encodeURIComponent(packageId)}/zones`);
      const memberships=Array.isArray(current)?current:(Array.isArray(current?.zones)?current.zones:[]);
      const selected=new Set(memberships.map(x=>String(x.zone_id)));
      const editable=editor.dataset.packageZoneEditable==='1';

      const zoneNames=new Map(zones.map(z=>{
        const props=z?.properties||z||{};
        const id=String(props.id||z.id||'');
        return [id,props.name||z.name||'Unnamed Zone'];
      }));

      if(!zones.length){
        editor.innerHTML=`
          <div class="row">
            <div>
              <strong>Zone coverage</strong>
              <div class="muted tiny">No CoastLoop Zones exist yet. Geography must exist before this package can be assigned to Zones.</div>
            </div>
          </div>`;
        continue;
      }

      if(!editable){
        const names=memberships
          .map(m=>zoneNames.get(String(m.zone_id)))
          .filter(Boolean);

        editor.innerHTML=`
          <div class="row">
            <div>
              <strong>Zone coverage</strong>
              <div class="muted tiny">Active package geography is read-only.</div>
              <div style="margin-top:8px">${names.length ? names.map(name=>esc(name)).join(' · ') : '<span class="muted">No Zone membership recorded.</span>'}</div>
            </div>
          </div>`;
        continue;
      }

      editor.innerHTML=`
        <div class="row">
          <div>
            <strong>Zone coverage</strong>
            <div class="muted tiny">Choose the Zones included in this draft package.</div>
          </div>
          <button type="button" class="button secondary" data-save-package-zones="${esc(packageId)}">Save Zones</button>
        </div>
        <div class="package-zone-options" style="margin-top:10px">
          ${zones.map(z=>{
            const props=z?.properties||z||{};
            const id=String(props.id||z.id||'');
            const name=props.name||z.name||'Unnamed Zone';
            return `<label class="check-row">
              <input type="checkbox" value="${esc(id)}" data-package-zone-choice="${esc(packageId)}" ${selected.has(id)?'checked':''}>
              <span>${esc(name)}</span>
            </label>`;
          }).join('')}
        </div>`;
    }catch(error){
      editor.innerHTML=`<div class="muted tiny">Zone membership unavailable · ${esc(error.message||'request failed')}</div>`;
    }
  }
}

function renderDigitalOnboarding(){
  const box=$('#digitalOnboarding');
  if(!box) return;

  const packages=Array.isArray(state.onboardingPackages)?state.onboardingPackages:[];
  const agreements=Array.isArray(state.onboarding?.agreements)?state.onboarding.agreements:[];
  const tasks=Array.isArray(state.onboarding?.tasks)?state.onboarding.tasks:[];

  const businessOptions=(state.businesses||[]).map(b=>
    `<option value="${b.id}">${esc(b.name)}</option>`).join('');

  const locationOptions=(state.businesses||[]).flatMap(b=>
    (b.locations||[]).map(l=>
      `<option value="${l.id}" data-business="${b.id}">${esc(b.name)} — ${esc(l.name||l.address_line1||'Location')}</option>`
    )).join('');

  const packageRows=packages.length ? packages.map(p=>{
    const coverageMode=String(p.coverage_mode||'legacy');
    const packageId=p.id||p.package_id||'';
    const isZonePackage=coverageMode==='zones';
    const canEditZones=String(p.status||'').toLowerCase()==='draft' && isZonePackage;
    const coverageLabel=
      coverageMode==='network' ? 'Network' :
      coverageMode==='zones' ? 'Selected Zones' :
      'Legacy';
    return `
    <tr>
      <td>${esc(p.name)}</td>
      <td>${esc(p.package_key)} v${esc(p.version)}</td>
      <td>${money(p.price_cents||0)}</td>
      <td>${esc(p.market||'—')}</td>
      <td>${esc(coverageLabel)}</td>
      <td>${esc(p.status)}</td>
      <td>${esc(p.availability_status||'—')}</td>
    </tr>
    ${isZonePackage ? `
    <tr class="package-zone-editor-row">
      <td colspan="7">
        <div
          class="package-zone-editor"
          data-package-zone-editor="${esc(packageId)}"
          data-package-zone-editable="${canEditZones?'1':'0'}">
          <div class="row">
            <div>
              <strong>Zone coverage</strong>
              <div class="muted tiny">Loading current Zone membership…</div>
            </div>
          </div>
        </div>
      </td>
    </tr>` : ''}`;
  }).join('') :
    `<tr><td colspan="7" class="muted">No advertising packages yet. Public advertiser flow will remain in an honest zero-state.</td></tr>`;

  const agreementRows=agreements.length ? agreements.slice(0,20).map(a=>{
    const b=(state.businesses||[]).find(x=>x.id===a.business_id);
    return `<tr>
      <td>${esc(b?.name||'Business')}</td>
      <td>${esc(a.template_family)}</td>
      <td>${esc(a.status)}</td>
      <td>${esc(a.signer_legal_name||'—')}</td>
      <td>${esc(a.signed_at?new Date(a.signed_at).toLocaleString():(a.first_viewed_at?'Viewed':'Sent'))}</td>
    </tr>`;
  }).join('') :
    `<tr><td colspan="5" class="muted">No onboarding agreements yet.</td></tr>`;

  const openTasks=tasks.filter(t=>t.status==='open'||t.status==='in_progress');

  box.innerHTML=`
    <div class="row">
      <div>
        <h2>Digital onboarding</h2>
        <p class="muted">Create package versions and one-tap venue approval links. Locked legal templates are required before a real signature can complete.</p>
      </div>
      <div class="metric">${agreements.length}</div>
    </div>

    <div class="admin-grid" style="margin-top:16px">
      <form id="packageCreateForm" class="card inset">
        <h3>New advertising package</h3>
        <label>Name<input name="name" required placeholder="Founding Local"></label>
        <label>Package key<input name="package_key" required placeholder="founding-local"></label>
        <div class="row">
          <label>Version<input name="version" type="number" min="1" value="1" required></label>
          <label>Price cents<input name="price_cents" type="number" min="0" required></label>
        </div>
        <label>Market<input name="market" placeholder="North Myrtle Beach"></label>
        <label>Coverage
          <select name="coverage_mode" required>
            <option value="" selected disabled>Choose coverage…</option>
            <option value="network">Network</option>
            <option value="zones">Selected Zones</option>
            <option value="legacy">Legacy</option>
          </select>
        </label>
        <div class="row">
          <label>Term days<input name="term_days" type="number" min="1"></label>
          <label>Ad seconds<input name="ad_length_seconds" type="number" min="1" value="15"></label>
        </div>
        <label>Frequency label<input name="frequency_label" placeholder="Example: once per loop"></label>
        <div class="row">
          <label>Screen count<input name="screen_count" type="number" min="1"></label>
          <label>Projected plays<input name="projected_plays" type="number" min="1"></label>
        </div>
        <label>Projection days<input name="projection_period_days" type="number" min="1"></label>
        <button class="button" type="submit">Create draft package</button>
        <p class="muted tiny">Draft packages are never public. No invented metrics.</p>
      </form>

      <form id="venueInviteForm" class="card inset">
        <h3>Venue approval link</h3>
        <label>Business<select name="business_id" required><option value="">Choose business</option>${businessOptions}</select></label>
        <label>Location<select name="location_id" required><option value="">Choose location</option>${locationOptions}</select></label>
        <label>Legal entity<input name="organization_legal_name" required></label>
        <label>Signer name<input name="signer_name"></label>
        <label>Signer title<input name="signer_title"></label>
        <label>Signer email<input name="signer_email" type="email"></label>
        <label>Signer mobile<input name="signer_mobile"></label>
        <label>Placement / zone<input name="zone_label" required placeholder="Main bar"></label>
        <label>Screen label<input name="screen_label" required placeholder="55-inch TV above bar"></label>
        <label>Screen count<input name="screen_count" type="number" min="1" value="1" required></label>
        <label>Operating mode
          <select name="operating_mode">
            <option value="dedicated_coastloop">Dedicated CoastLoop</option>
            <option value="scheduled_coastloop">Scheduled CoastLoop</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>Operating schedule<input name="schedule_label" placeholder="During normal business hours"></label>
        <label>Term<input name="term_type" required placeholder="12 months"></label>
        <label>Venue house inventory<input name="house_inventory" required placeholder="Venue house content included"></label>
        <label>Host compensation
  <select name="host_compensation_type">
    <option value="waived">No cash compensation</option>
    <option value="cash">Cash compensation</option>
    <option value="other">Other agreed consideration</option>
  </select>
</label>
<label>Cash compensation cents
  <input name="host_compensation_cents" type="number" min="0" value="0">
</label>
<label>Compensation terms
  <input name="compensation_schedule" placeholder="Optional terms or description">
</label>
        <label>Equipment / network responsibility<input name="equipment_network_responsibility" required placeholder="CoastLoop equipment; venue power/network access"></label>
        <label>Category exclusions<input name="category_exclusions" placeholder="Optional"></label>
        <label><input name="public_venue_listing" type="checkbox"> Allow public venue listing</label>
        <label><input name="venue_photo_permission" type="checkbox"> Allow approved placement photography</label>
        <label><input name="preview" type="checkbox"> Preview-only link while agreement is in counsel review</label>
        <button class="button" type="submit">Create approval link</button>
        <div id="venueInviteResult" class="muted tiny"></div>
      </form>
    </div>

    <h3 style="margin-top:22px">Package versions</h3>
    <div style="overflow:auto"><table><thead><tr><th>Package</th><th>Version</th><th>Price</th><th>Market</th><th>Coverage</th>
              <th>Status</th><th>Availability</th></tr></thead><tbody>${packageRows}</tbody></table></div>

    <h3 style="margin-top:22px">Recent agreements</h3>
    <div style="overflow:auto"><table><thead><tr><th>Business</th><th>Family</th><th>Status</th><th>Signer</th><th>Progress</th></tr></thead><tbody>${agreementRows}</tbody></table></div>

    <p class="muted" style="margin-top:14px">${openTasks.length} open onboarding task${openTasks.length===1?'':'s'}.</p>
  `;

  const businessSelect=box.querySelector('#venueInviteForm [name="business_id"]');
  const locationSelect=box.querySelector('#venueInviteForm [name="location_id"]');
  businessSelect?.addEventListener('change',()=>{
    const id=businessSelect.value;
    [...locationSelect.options].forEach((o,i)=>{
      if(i===0) return;
      o.hidden=!!id && o.dataset.business!==id;
    });
    if(locationSelect.selectedOptions[0]?.hidden) locationSelect.value='';
  });
}

function campaignActions(c){
  const actions={
    draft:[["scheduled","Schedule"],["active","Activate"],["canceled","Cancel"]],
    scheduled:[["draft","Back to draft"],["active","Activate"],["canceled","Cancel"]],
    active:[["paused","Pause"],["completed","Complete"],["canceled","Cancel"]],
    paused:[["active","Resume"],["completed","Complete"],["canceled","Cancel"]],
    completed:[],
    canceled:[]
  };
  return (actions[c.status]||[])
    .map(([status,label])=>`<button class="secondary campaign-state" data-campaign="${c.id}" data-status="${status}" type="button">${label}</button>`)
    .join('');
}
function brokerUsers(){
  return (state.userDirectory.users||[]).filter(u=>u.internal_role==='broker');
}
function brokerOptions(selected=''){
  return '<option value="">No broker / house lead</option>'+
    brokerUsers().map(u=>`<option value="${u.user_id}" ${u.user_id===selected?'selected':''}>${esc(u.full_name||u.email)}</option>`).join('');
}
function online(ts){ return ts && (Date.now() - new Date(ts).getTime()) < 120000; }

function age(ts){
  if(!ts) return 'Never';
  const sec=Math.max(0,Math.floor((Date.now()-new Date(ts).getTime())/1000));
  if(sec<60) return `${sec}s ago`;
  if(sec<3600) return `${Math.floor(sec/60)}m ago`;
  if(sec<86400) return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}
function duration(seconds){
  const s=Math.round(Number(seconds||0));
  if(s<60) return `${s}s`;
  if(s<3600) return `${Math.floor(s/60)}m ${s%60}s`;
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
  return `${h}h ${m}m`;
}
function resolution(s){
  const ui=s.display_width && s.display_height ? `${s.display_width}×${s.display_height} UI` : 'UI —';
  const video=s.video_mode ? `${s.video_mode} video` : 'video —';
  const tier=s.can_play_4k ? '4K capable' : '1080p tier';
  return `${video} · ${ui} · ${tier}`;
}
function hardwareLabel(s){
  const vendor=s.device_vendor||'Unknown vendor';
  const model=s.device_model_number||s.device_model||s.device_display_name||'unknown model';
  const size=s.device_screen_size ? `${s.device_screen_size}"` : '';
  return [vendor,model,size,s.device_type||''].filter(Boolean).join(' · ');
}
function deploymentOptions(v='unreviewed'){
  const labels={
    unreviewed:'UNREVIEWED',
    lab_only:'LAB ONLY',
    pilot:'PILOT',
    production:'PRODUCTION'
  };
  return Object.entries(labels).map(([k,label])=>`<option value="${k}" ${v===k?'selected':''}>${label}</option>`).join('');
}

function allLocations(){
  return state.businesses.flatMap(b=>(b.locations||[]).map(l=>({...l,business_name:b.name})));
}

function locationOptions(selected=''){
  const options=allLocations().map(l=>{
    const label=[l.business_name,l.name && l.name!==l.business_name?l.name:null,l.address_line1,l.city].filter(Boolean).join(' · ');
    return `<option value="${l.id}" ${l.id===selected?'selected':''}>${esc(label)}</option>`;
  }).join('');
  return `<option value="">Unassigned${options?' / choose location':''}</option>${options}`;
}



const scheduleDayOrder=[
  ['sun','Sun'],['mon','Mon'],['tue','Tue'],['wed','Wed'],
  ['thu','Thu'],['fri','Fri'],['sat','Sat']
];

function scheduleText(schedule){
  if(!schedule || typeof schedule!=='object' || Array.isArray(schedule)) return '';
  return scheduleDayOrder
    .filter(([k])=>Object.prototype.hasOwnProperty.call(schedule,k))
    .map(([k,label])=>{
      const windows=Array.isArray(schedule[k])?schedule[k]:[];
      if(!windows.length) return `${label} closed`;
      return `${label} ${windows.map(w=>`${w[0]}-${w[1]}`).join(', ')}`;
    }).join('\n');
}

function parseScheduleText(text){
  const raw=String(text||'').trim();
  if(!raw) return {};
  const days=Object.fromEntries(scheduleDayOrder.map(([k,l])=>[l.toLowerCase(),k]));
  const out={};

  for(const source of raw.split(/\n+/)){
    const line=source.trim();
    if(!line) continue;
    const m=/^([A-Za-z]{3})\s+(.+)$/.exec(line);
    if(!m) throw new Error(`Invalid schedule line: ${line}`);
    const day=days[m[1].toLowerCase()];
    if(!day) throw new Error(`Invalid weekday: ${m[1]}`);

    const body=m[2].trim();
    if(body.toLowerCase()==='closed'){
      out[day]=[];
      continue;
    }

    out[day]=body.split(',').map(part=>{
      const pair=/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(part.trim());
      if(!pair) throw new Error(`Invalid time window: ${part.trim()}`);
      return [pair[1],pair[2]];
    });
  }
  return out;
}

function renderScheduling(){
  const host=document.querySelector('#scheduling');
  if(!host) return;

  const locations=allLocations();
  const campaigns=state.campaigns.filter(c=>!['completed','canceled'].includes(c.status));

  host.innerHTML=`
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px">
      <div>
        <h3 style="margin-top:0">Location operating hours</h3>
        <p class="muted">Blank = unrestricted. Times use the location timezone.</p>
        ${locations.map(l=>`
          <div class="media-item schedule-location" data-location="${l.id}">
            <strong>${esc(l.business_name||l.name||'Location')}</strong>
            <div class="muted">${esc([l.address_line1,l.city,l.state].filter(Boolean).join(', '))}</div>
            <input class="schedule-timezone" value="${esc(l.timezone||'America/New_York')}" style="width:100%;margin-top:8px">
            <textarea class="schedule-hours" rows="5" style="width:100%;margin-top:8px" placeholder="Mon 09:00-17:00&#10;Fri 17:00-02:00">${esc(scheduleText(l.operating_hours||{}))}</textarea>
            <button type="button" class="secondary save-location-schedule" style="margin-top:8px">Save hours</button>
          </div>
        `).join('') || '<div class="muted">No locations yet.</div>'}
      </div>
      <div>
        <h3 style="margin-top:0">Campaign dayparts</h3>
        <p class="muted">Blank = run whenever the host location is open.</p>
        ${campaigns.map(c=>{
          const b=state.businesses.find(x=>x.id===c.advertiser_business_id);
          return `
            <div class="media-item schedule-campaign" data-campaign="${c.id}">
              <strong>${esc(b?.name||'Advertiser')} — ${esc(c.name)}</strong>
              <div class="muted">${esc(c.status||'')}</div>
              <textarea class="schedule-dayparts" rows="5" style="width:100%;margin-top:8px" placeholder="Mon 11:00-14:00, 17:00-21:00">${esc(scheduleText(c.dayparts||{}))}</textarea>
              <button type="button" class="secondary save-campaign-dayparts" style="margin-top:8px">Save dayparts</button>
            </div>`;
        }).join('') || '<div class="muted">No campaign schedules.</div>'}
      </div>
    </div>`;
}

let prospectMap=null;
let prospectLayer=null;
let zoneLayer=null;
let networkLocationLayer=null;
let planningGridLayer=null;
let networkMapData={areas:[],zones:[],locations:[],screens:[],totals:{}};
let networkMapLoaded=false;
let networkMapLoading=false;
let selectedZoneId=null;
let selectedMarketId=null;
let mapInitialFitDone=false;
let geographyPackageMemberships=new Map();
const mapVisibility={zones:false,network:true,leads:false,grid:true};

function prospectAddress(p){
  return [p.address_line1,p.city,p.state,p.postal_code].filter(Boolean).join(', ');
}

function networkLocationAddress(location){
  return [
    location.address_line1,
    location.city,
    location.state,
    location.postal_code
  ].filter(Boolean).join(', ');
}

function zoneMapSummary(){
  const el=$('#zoneMapSummary');
  if(!el) return;

  if(networkMapLoading && !networkMapLoaded){
    el.textContent='Loading CoastLoop geography…';
    return;
  }

  const zones=networkMapData.zones||[];
  const locations=networkMapData.locations||[];

  if(!zones.length){
    el.innerHTML='<strong>No CoastLoop Zones defined yet.</strong> Activate the first Zone boundary in Supabase and it will appear here automatically. The planning grid is a visual drafting aid only.';
    return;
  }

  const selected=zones.find(zone=>zone.id===selectedZoneId);
  if(selected){
    el.innerHTML=
      `<strong>${esc(selected.name)}</strong>`+
      ` · ${selected.location_count||0} locations`+
      ` · ${selected.commercial_screen_count||0} commercial screens`+
      ` · ${selected.online_screen_count||0} online`+
      ` · boundary v${selected.boundary_version||'—'} ${esc(selected.boundary_status||'unmapped')}`;
    return;
  }

  const mapped=zones.filter(zone=>zone.boundary_geojson).length;
  const assigned=locations.filter(location=>location.zone_id).length;
  el.innerHTML=
    `<strong>${zones.length} Zones</strong>`+
    ` · ${mapped} mapped`+
    ` · ${assigned} assigned locations`+
    ` · select a Zone for inventory detail`;
}

function zoneStyle(feature){
  const props=feature?.properties||{};
  const selected=String(props.id||'')===String(selectedZoneId||'');
  const active=String(props.status||'')==='active';

  if(!mapVisibility.zones){
    return {
      color:'transparent',
      weight:0,
      opacity:0,
      fillColor:'transparent',
      fillOpacity:0
    };
  }

  return selected
    ?{
        color:'#d8b66f',
        weight:2,
        opacity:.92,
        dashArray:'7 5',
        fillColor:'#d8b66f',
        fillOpacity:.055
      }
    :active
    ?{
        color:'#a88d5b',
        weight:1.25,
        opacity:.70,
        dashArray:'6 5',
        fillColor:'#a88d5b',
        fillOpacity:.03
      }
    :{
        color:'#77777d',
        weight:1,
        opacity:.55,
        dashArray:'5 5',
        fillColor:'#77777d',
        fillOpacity:.02
      };
}

function pointInRing(lat,lon,ring){
  if(!Array.isArray(ring) || ring.length<3) return false;
  let inside=false;

  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=Number(ring[i]?.[0]);
    const yi=Number(ring[i]?.[1]);
    const xj=Number(ring[j]?.[0]);
    const yj=Number(ring[j]?.[1]);

    if(![xi,yi,xj,yj].every(Number.isFinite)) continue;

    const crosses=((yi>lat)!==(yj>lat)) &&
      (lon < (xj-xi)*(lat-yi)/((yj-yi)||Number.EPSILON)+xi);

    if(crosses) inside=!inside;
  }

  return inside;
}

function pointInGeometry(lat,lon,geometry){
  if(!geometry) return false;

  if(geometry.type==='Polygon'){
    const rings=geometry.coordinates||[];
    if(!rings.length || !pointInRing(lat,lon,rings[0])) return false;

    for(let i=1;i<rings.length;i++){
      if(pointInRing(lat,lon,rings[i])) return false;
    }

    return true;
  }

  if(geometry.type==='MultiPolygon'){
    return (geometry.coordinates||[]).some(poly=>
      pointInGeometry(lat,lon,{type:'Polygon',coordinates:poly})
    );
  }

  return false;
}

function zonesForGridPoint(lat,lon){
  return (networkMapData.zones||[]).filter(zone=>
    String(zone.status||'')==='active' &&
    zone.boundary_geojson &&
    pointInGeometry(lat,lon,zone.boundary_geojson)
  );
}

function gridCellStyle(memberships,hover=false){
  const zoom=prospectMap?.getZoom?.()||0;
  const local=zoom>=10;
  const selected=Boolean(
    selectedZoneId &&
    memberships.some(zone=>String(zone.id)===String(selectedZoneId))
  );

  if(!local){
    return {
      color:'#6f6044',
      weight:0,
      opacity:0,
      fillColor:selected?'#b99a61':'#766547',
      fillOpacity:selected?.68:.52
    };
  }

  if(hover){
    return {
      color:'#d8b66f',
      weight:1.15,
      opacity:.90,
      fillColor:selected?'#b99a61':'#88734e',
      fillOpacity:selected?.76:.66
    };
  }

  return selected
    ?{
        color:'#b59a68',
        weight:.46,
        opacity:.34,
        fillColor:'#9b7f4d',
        fillOpacity:.66
      }
    :{
        color:'#88775a',
        weight:.38,
        opacity:.22,
        fillColor:'#625640',
        fillOpacity:.52
      };
}

function renderPlanningGrid(){
  if(!planningGridLayer || !prospectMap || !window.L) return;

  planningGridLayer.clearLayers();
  if(!mapVisibility.grid) return;

  const GRID_RADIUS_M=750;
  const zones=(networkMapData.zones||[]).filter(zone=>
    String(zone.status||'')==='active' &&
    zone.boundary_geojson
  );

  if(!zones.length) return;

  const crs=L.CRS.EPSG3857;
  const r=GRID_RADIUS_M;
  const xStep=1.5*r;
  const yStep=Math.sqrt(3)*r;

  const geometryMeterBounds=geometry=>{
    let minX=Infinity;
    let minY=Infinity;
    let maxX=-Infinity;
    let maxY=-Infinity;

    const walk=value=>{
      if(!Array.isArray(value)) return;

      if(
        value.length>=2 &&
        Number.isFinite(Number(value[0])) &&
        Number.isFinite(Number(value[1]))
      ){
        const p=crs.project(
          L.latLng(Number(value[1]),Number(value[0]))
        );
        minX=Math.min(minX,p.x);
        minY=Math.min(minY,p.y);
        maxX=Math.max(maxX,p.x);
        maxY=Math.max(maxY,p.y);
        return;
      }

      value.forEach(walk);
    };

    walk(geometry?.coordinates);

    return Number.isFinite(minX)
      ?{minX,minY,maxX,maxY}
      :null;
  };

  const candidateIds=new Set();

  zones.forEach(zone=>{
    const b=geometryMeterBounds(zone.boundary_geojson);
    if(!b) return;

    const colMin=Math.floor((b.minX-r)/xStep)-1;
    const colMax=Math.ceil((b.maxX+r)/xStep)+1;

    for(let col=colMin;col<=colMax;col++){
      const rowOffset=(Math.abs(col)%2)*0.5;
      const rowMin=Math.floor((b.minY-r)/yStep-rowOffset)-1;
      const rowMax=Math.ceil((b.maxY+r)/yStep-rowOffset)+1;

      for(let row=rowMin;row<=rowMax;row++){
        candidateIds.add(`${col}:${row}`);
      }
    }
  });

  const cells=[];

  candidateIds.forEach(key=>{
    const [col,row]=key.split(':').map(Number);
    const rowOffset=(Math.abs(col)%2)*0.5;
    const x=col*xStep;
    const y=(row+rowOffset)*yStep;
    const center=crs.unproject(L.point(x,y));

    // Deterministic membership rule:
    // A permanent wm750 cell belongs to every active Zone whose
    // active canonical boundary contains that cell's fixed center point.
    const memberships=zonesForGridPoint(center.lat,center.lng);
    if(!memberships.length) return;

    const points=[];
    for(let i=0;i<6;i++){
      const angle=Math.PI/180*(60*i);
      const p=crs.unproject(L.point(
        x+r*Math.cos(angle),
        y+r*Math.sin(angle)
      ));
      points.push([p.lat,p.lng]);
    }

    cells.push({
      id:`wm750:${col}:${row}`,
      col,
      row,
      center,
      points,
      memberships
    });
  });

  cells.sort((a,b)=>
    a.col-b.col ||
    a.row-b.row
  );

  const perimeterEdges=new Map();

  const vertexKey=point=>
    `${Number(point[0]).toFixed(8)},${Number(point[1]).toFixed(8)}`;

  cells.forEach(cell=>{
    const membershipMetadata=cell.memberships.map(zone=>({
      zoneId:zone.id,
      boundaryVersion:zone.boundary_version??null
    }));

    const layer=L.polygon(
      cell.points,
      {
        ...gridCellStyle(cell.memberships,false),
        coastloopCellId:cell.id,
        coastloopMemberships:membershipMetadata
      }
    ).addTo(planningGridLayer);

    layer.bindTooltip(
      cell.memberships.map(zone=>esc(zone.name)).join(' · '),
      {sticky:true,direction:'top'}
    );

    layer.on('mouseover',()=>{
      layer.setStyle(gridCellStyle(cell.memberships,true));
    });

    layer.on('mouseout',()=>{
      layer.setStyle(gridCellStyle(cell.memberships,false));
    });

    layer.on('click',()=>{
      if(cell.memberships.length!==1) return;
      const zone=cell.memberships[0];
      selectedZoneId=zone.id;
      selectedMarketId=zone.parent_area_id||null;
      renderGeographyControlCenter();
      renderProspectMap();
      requestAnimationFrame(()=>{
        if(!prospectMap) return;
        prospectMap.invalidateSize();
        constrainMapToGeography();
        fitSelectedZone();
      });
    });

    cell.memberships.forEach(zone=>{
      for(let i=0;i<6;i++){
        const a=cell.points[i];
        const b=cell.points[(i+1)%6];
        const ka=vertexKey(a);
        const kb=vertexKey(b);
        const pair=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
        const edgeKey=`${zone.id}|${pair}`;
        const prior=perimeterEdges.get(edgeKey);

        if(prior){
          prior.count++;
        }else{
          perimeterEdges.set(edgeKey,{
            count:1,
            zone,
            points:[a,b]
          });
        }
      }
    });
  });

  const zoom=prospectMap.getZoom();
  perimeterEdges.forEach(edge=>{
    if(edge.count!==1) return;

    const selected=
      String(edge.zone.id||'')===String(selectedZoneId||'');

    L.polyline(edge.points,{
      interactive:false,
      color:selected?'#d8b66f':'#9b845d',
      weight:selected?(zoom>=10?1.8:1.45):(zoom>=10?1.2:1.0),
      opacity:selected?.90:.62,
      coastloopMosaicPerimeter:true,
      coastloopZoneId:edge.zone.id
    }).addTo(planningGridLayer);
  });
}

function applyMapLayerVisibility(){
  if(!prospectMap) return;

  if(zoneLayer?.setStyle){
    zoneLayer.setStyle(zoneStyle);
  }

  const layers={
    zones:zoneLayer,
    network:networkLocationLayer,
    leads:prospectLayer,
    grid:planningGridLayer
  };

  Object.entries(layers).forEach(([key,layer])=>{
    if(!layer) return;
    const has=prospectMap.hasLayer(layer);
    if(mapVisibility[key] && !has) layer.addTo(prospectMap);
    if(!mapVisibility[key] && has) prospectMap.removeLayer(layer);
  });

  document.querySelectorAll('.zone-map-toggle').forEach(button=>{
    const key=button.dataset.mapLayer;
    const active=Boolean(mapVisibility[key]);
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',String(active));
  });

  renderPlanningGrid();
}

function fitZoneMap(){
  if(!prospectMap) return false;

  selectedZoneId=null;
  selectedMarketId=null;
  renderGeographyControlCenter();

  prospectMap.setMaxBounds(null);

  const b=geographyLayerBounds(
    props=>String(props.status||'')==='active'
  );

  if(b){
    prospectMap.fitBounds(b,{
      padding:[42,42],
      maxZoom:10,
      animate:false
    });
    return true;
  }

  if(fitLatLngs(geographyLatLngs(),10)) return true;

  prospectMap.setView([31.9,-79.7],6,{animate:false});
  return false;
}

function bindZoneMapControls(){
  document.querySelectorAll('.zone-map-toggle').forEach(button=>{
    if(button.dataset.bound==='1') return;
    button.dataset.bound='1';
    button.addEventListener('click',()=>{
      const key=button.dataset.mapLayer;
      if(!(key in mapVisibility)) return;
      mapVisibility[key]=!mapVisibility[key];
      applyMapLayerVisibility();
    });
  });

  const fit=$('#fitZoneMap');
  if(fit && fit.dataset.bound!=='1'){
    fit.dataset.bound='1';
    fit.addEventListener('click',fitZoneMap);
  }
}

async function loadGeographyPackageMemberships(){
  geographyPackageMemberships=new Map();
  const packages=Array.isArray(state.onboardingPackages)?state.onboardingPackages:[];

  await Promise.all(packages.map(async pkg=>{
    if(String(pkg.coverage_mode||'')!=='zones') return;
    try{
      const current=await api(
        `/api/admin/onboarding/packages/${encodeURIComponent(pkg.id)}/zones`
      );
      const rows=Array.isArray(current)
        ? current
        : (Array.isArray(current?.zones)?current.zones:[]);

      rows.forEach(row=>{
        const zoneId=String(row.zone_id||'');
        if(!zoneId) return;
        if(!geographyPackageMemberships.has(zoneId)){
          geographyPackageMemberships.set(zoneId,[]);
        }
        geographyPackageMemberships.get(zoneId).push(pkg);
      });
    }catch(error){
      console.warn('Package geography unavailable',pkg?.id,error);
    }
  }));
}

function geographyMarkets(){
  return (networkMapData.areas||[]).filter(
    area=>String(area.area_type||'')==='market'
  );
}

function geographyZonesForMarket(marketId){
  return (networkMapData.zones||[]).filter(
    zone=>String(zone.parent_area_id||'')===String(marketId||'')
  );
}

function geographyLocationsForZone(zoneId){
  return (networkMapData.locations||[]).filter(
    location=>String(location.zone_id||'')===String(zoneId||'')
  );
}

function geographyPackagesForZone(zoneId){
  return geographyPackageMemberships.get(String(zoneId||''))||[];
}

function geographyPackageLabel(pkg){
  const name=String(pkg.name||pkg.package_key||'Package');
  const version=pkg.version==null?'':` v${pkg.version}`;
  return `${name}${version}`;
}

function geographyMarketMetrics(market){
  const zones=geographyZonesForMarket(market.id);
  const zoneIds=new Set(zones.map(zone=>String(zone.id)));
  const locations=(networkMapData.locations||[]).filter(
    location=>zoneIds.has(String(location.zone_id||''))
  );

  return {
    zones:zones.length,
    locations:locations.length,
    eligibleScreens:zones.reduce(
      (sum,zone)=>sum+Number(zone.metrics?.eligible_screen_count||0),0
    ),
    boundaries:zones.filter(zone=>zone.boundary?.geojson).length
  };
}

function renderGeographyOverview(){
  const el=$('#geoOverview');
  if(!el) return;

  const markets=geographyMarkets();
  const zones=networkMapData.zones||[];
  const mapped=zones.filter(zone=>zone.boundary?.geojson).length;
  const eligible=zones.reduce(
    (sum,zone)=>sum+Number(zone.metrics?.eligible_screen_count||0),0
  );

  el.innerHTML=`
    <div><strong>${markets.length}</strong><span>Markets</span></div>
    <div><strong>${zones.length}</strong><span>Zones</span></div>
    <div><strong>${mapped}</strong><span>Boundaries</span></div>
    <div><strong>${eligible}</strong><span>Eligible screens</span></div>`;
}

function renderGeographyTree(){
  const el=$('#geoTree');
  if(!el) return;

  const markets=geographyMarkets();

  if(!markets.length){
    el.innerHTML='<div class="muted">No Markets exist yet.</div>';
    return;
  }

  el.innerHTML=markets.map(market=>{
    const zones=geographyZonesForMarket(market.id);
    const metrics=geographyMarketMetrics(market);
    const marketSelected=String(selectedMarketId||'')===String(market.id);

    return `
      <div class="geo-market">
        <button type="button"
          class="geo-market-button ${marketSelected?'is-selected':''}"
          data-geo-market="${esc(market.id)}">
          <span class="geo-market-title">
            <strong>${esc(market.name||'Unnamed Market')}</strong>
            <span class="geo-meta">
              ${esc(market.status||'unknown')} ·
              ${metrics.zones} Zone${metrics.zones===1?'':'s'} ·
              ${metrics.locations} location${metrics.locations===1?'':'s'} ·
              ${metrics.eligibleScreens} eligible screen${metrics.eligibleScreens===1?'':'s'}
            </span>
          </span>
          <span class="geo-chip">${metrics.boundaries}/${metrics.zones} mapped</span>
        </button>
        <div class="geo-zone-list">
          ${zones.map(zone=>{
            const selected=String(selectedZoneId||'')===String(zone.id);
            const hasBoundary=Boolean(zone.boundary?.geojson);
            const metrics=zone.metrics||{};
            const packages=geographyPackagesForZone(zone.id);

            return `
              <button type="button"
                class="geo-zone-button ${selected?'is-selected':''}"
                data-geo-zone="${esc(zone.id)}">
                <span class="geo-zone-title">
                  <strong>${esc(zone.name||'Unnamed Zone')}</strong>
                  <span class="geo-meta">
                    ${esc(zone.status||'unknown')} ·
                    ${Number(metrics.location_count||0)} location${Number(metrics.location_count||0)===1?'':'s'} ·
                    ${Number(metrics.eligible_screen_count||0)} eligible screen${Number(metrics.eligible_screen_count||0)===1?'':'s'}
                  </span>
                </span>
                <span class="geo-zone-flags">
                  <span class="geo-chip ${hasBoundary?'good':'muted'}">
                    ${hasBoundary?'Boundary defined':'Boundary not defined'}
                  </span>
                  ${packages.length
                    ? `<span class="geo-chip">${packages.length} package${packages.length===1?'':'s'}</span>`
                    : ''}
                </span>
              </button>`;
          }).join('') || '<div class="muted tiny" style="padding:12px">No Zones in this Market.</div>'}
        </div>
      </div>`;
  }).join('');
}

function renderGeographySelection(){
  const el=$('#geoSelection');
  if(!el) return;

  const zone=(networkMapData.zones||[]).find(
    item=>String(item.id)===String(selectedZoneId||'')
  );

  if(zone){
    const market=(networkMapData.areas||[]).find(
      area=>String(area.id)===String(zone.parent_area_id||'')
    );
    const metrics=zone.metrics||{};
    const packages=geographyPackagesForZone(zone.id);
    const locations=geographyLocationsForZone(zone.id);
    const hasBoundary=Boolean(zone.boundary?.geojson);

    el.innerHTML=`
      <div class="geo-selection-grid">
        <div>
          <div class="ops-kicker">ZONE</div>
          <h3>${esc(zone.name||'Unnamed Zone')}</h3>
          <div class="muted">
            ${esc(market?.name||'No parent Market')} ·
            ${esc(zone.status||'unknown')}
          </div>
          <div class="geo-detail-metrics">
            <div><strong>${Number(metrics.location_count||0)}</strong><span>Locations</span></div>
            <div><strong>${Number(metrics.eligible_screen_count||0)}</strong><span>Eligible screens</span></div>
            <div><strong>${Number(metrics.online_screen_count||0)}</strong><span>Online screens</span></div>
          </div>
        </div>
        <div>
          <strong>Boundary</strong>
          <div class="muted" style="margin-top:5px">
            ${hasBoundary
              ? `Defined · active version ${esc(zone.boundary?.version??'—')}`
              : 'Boundary not defined'}
          </div>
          <strong style="display:block;margin-top:14px">Included in packages</strong>
          <div class="geo-package-list">
            ${packages.length
              ? packages.map(pkg=>`<span class="geo-chip">${esc(geographyPackageLabel(pkg))}</span>`).join('')
              : '<span class="muted tiny">No Zone-based package memberships.</span>'}
          </div>
          <strong style="display:block;margin-top:14px">Inventory</strong>
          <div class="muted tiny" style="margin-top:5px">
            ${locations.length
              ? locations.map(location=>esc(location.name||'Unnamed location')).join(' · ')
              : 'No locations assigned to this Zone.'}
          </div>
        </div>
      </div>`;
    return;
  }

  const market=(networkMapData.areas||[]).find(
    area=>String(area.id)===String(selectedMarketId||'')
  );

  if(market){
    const metrics=geographyMarketMetrics(market);
    el.innerHTML=`
      <div class="ops-kicker">MARKET</div>
      <h3>${esc(market.name||'Unnamed Market')}</h3>
      <div class="muted">${esc(market.status||'unknown')}</div>
      <div class="geo-detail-metrics">
        <div><strong>${metrics.zones}</strong><span>Zones</span></div>
        <div><strong>${metrics.locations}</strong><span>Locations</span></div>
        <div><strong>${metrics.eligibleScreens}</strong><span>Eligible screens</span></div>
      </div>`;
    return;
  }

  el.innerHTML='<div class="muted">Select a Market or Zone to inspect its inventory and package relationships.</div>';
}

function hydrateGeographyCreateForms(){
  const marketForm=$('#newGeographyMarket');
  const zoneForm=$('#newGeographyZone');
  if(!marketForm||!zoneForm) return;

  const areas=(networkMapData.areas||[]).filter(
    area=>String(area.status||'')!=='retired'
  );
  const markets=geographyMarkets().filter(
    market=>String(market.status||'')!=='retired'
  );

  const parentSelect=marketForm.elements.parent_id;
  const zoneMarketSelect=zoneForm.elements.parent_area_id;

  if(parentSelect){
    parentSelect.innerHTML=
      '<option value="">No parent area</option>'+
      areas.map(area=>
        `<option value="${esc(area.id)}">${esc(area.name)} · ${esc(area.area_type)}</option>`
      ).join('');
  }

  if(zoneMarketSelect){
    zoneMarketSelect.innerHTML=
      '<option value="">Choose Market…</option>'+
      markets.map(market=>
        `<option value="${esc(market.id)}">${esc(market.name)}</option>`
      ).join('');
  }
}

function renderGeographyControlCenter(){
  renderGeographyOverview();
  renderGeographyTree();
  renderGeographySelection();
  hydrateGeographyCreateForms();
  bindGeographyControls();
}

function geographyLatLngs(zoneId=null,marketId=null){
  const zoneIds=marketId
    ?new Set((networkMapData.zones||[])
      .filter(z=>String(z.parent_area_id||'')===String(marketId))
      .map(z=>String(z.id)))
    :null;
  return (networkMapData.locations||[]).flatMap(location=>{
    if(zoneId && String(location.zone_id||'')!==String(zoneId)) return [];
    if(zoneIds && !zoneIds.has(String(location.zone_id||''))) return [];
    const lat=Number(location.latitude);
    const lon=Number(location.longitude);
    return Number.isFinite(lat)&&Number.isFinite(lon)?[[lat,lon]]:[];
  });
}

function geographyLayerBounds(filterFn=null){
  if(!zoneLayer || !window.L) return null;
  let bounds=null;
  zoneLayer.eachLayer(layer=>{
    const props=layer.feature?.properties||{};
    if(filterFn && !filterFn(props)) return;
    const b=layer.getBounds?.();
    if(!b?.isValid?.()) return;
    if(!bounds) bounds=L.latLngBounds(b);
    else bounds.extend(b);
  });
  return bounds?.isValid?.()?bounds:null;
}

function fitLatLngs(points,maxZoom=14){
  if(!prospectMap || !window.L || !points.length) return false;
  if(points.length===1){
    prospectMap.setView(points[0],Math.min(maxZoom,13),{animate:false});
    return true;
  }
  const bounds=L.latLngBounds(points);
  if(!bounds.isValid()) return false;
  prospectMap.fitBounds(bounds,{padding:[52,52],maxZoom,animate:false});
  return true;
}

function fitSelectedMarket(){
  if(!selectedMarketId) return false;
  const b=geographyLayerBounds(
    props=>String(props.parent_area_id||'')===String(selectedMarketId)
  );
  if(b){
    prospectMap.fitBounds(b,{padding:[52,52],maxZoom:13,animate:false});
    return true;
  }
  return fitLatLngs(geographyLatLngs(null,selectedMarketId),13);
}

function fitGeographyContext(){
  if(!prospectMap) return false;
  if(fitSelectedZone()) return true;
  if(fitSelectedMarket()) return true;
  const b=geographyLayerBounds();
  if(b){
    prospectMap.fitBounds(b,{padding:[56,56],maxZoom:12,animate:false});
    return true;
  }
  if(fitLatLngs(geographyLatLngs(),12)) return true;
  prospectMap.setView([33.816,-78.680],11,{animate:false});
  return false;
}

function constrainMapToGeography(){
  if(!prospectMap || !window.L) return;
  let bounds=selectedMarketId
    ?geographyLayerBounds(props=>String(props.parent_area_id||'')===String(selectedMarketId))
    :geographyLayerBounds();
  const points=geographyLatLngs(null,selectedMarketId||null);
  if(!bounds && points.length) bounds=L.latLngBounds(points);
  else if(bounds && points.length) points.forEach(point=>bounds.extend(point));
  prospectMap.setMaxBounds(bounds?.isValid?.()?bounds.pad(.40):null);
}

function bindGeographyControls(){
  const tree=$('#geoTree');
  const marketForm=$('#newGeographyMarket');
  const zoneForm=$('#newGeographyZone');

  if(tree && !tree.dataset.geoBound){
    tree.dataset.geoBound='1';
    tree.addEventListener('click',event=>{
      const zoneButton=event.target.closest('[data-geo-zone]');
      const marketButton=event.target.closest('[data-geo-market]');
      if(zoneButton){
        const zone=(networkMapData.zones||[]).find(
          row=>String(row.id)===String(zoneButton.dataset.geoZone||'')
        );
        if(!zone) return;
        selectedZoneId=zone.id;
        selectedMarketId=zone.parent_area_id||null;
      }else if(marketButton){
        selectedMarketId=marketButton.dataset.geoMarket||null;
        selectedZoneId=null;
      }else return;

      renderGeographyControlCenter();
      renderProspectMap();
      requestAnimationFrame(()=>{
        if(!prospectMap) return;
        prospectMap.invalidateSize();
        constrainMapToGeography();
        fitGeographyContext();
      });
    });
  }

  if(marketForm && !marketForm.dataset.geoBound){
    marketForm.dataset.geoBound='1';
    marketForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const message=marketForm.querySelector('[data-geo-message="market"]');
      const form=new FormData(marketForm);
      const parent=String(form.get('parent_id')||'').trim()||null;
      const payload={
        name:String(form.get('name')||'').trim(),
        area_type:'market',
        status:String(form.get('status')||'draft'),
        parent_id:parent,
        parent_area_id:parent
      };
      if(!payload.name){
        if(message) message.textContent='Market name is required.';
        return;
      }
      try{
        if(message) message.textContent='Creating Market…';
        await api('/api/admin/geography/areas',{
          method:'POST',body:JSON.stringify(payload)
        });
        marketForm.reset();
        if(message) message.textContent='Market created.';
        await loadNetworkMap(true);
      }catch(error){
        if(message) message.textContent=error.message||'Unable to create Market.';
      }
    });
  }

  if(zoneForm && !zoneForm.dataset.geoBound){
    zoneForm.dataset.geoBound='1';
    zoneForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const message=zoneForm.querySelector('[data-geo-message="zone"]');
      const form=new FormData(zoneForm);
      const payload={
        parent_area_id:String(form.get('parent_area_id')||'').trim(),
        name:String(form.get('name')||'').trim(),
        status:String(form.get('status')||'draft')
      };
      if(!payload.parent_area_id || !payload.name){
        if(message) message.textContent='Market and Zone name are required.';
        return;
      }
      try{
        if(message) message.textContent='Creating Zone…';
        await api('/api/admin/geography/zones',{
          method:'POST',body:JSON.stringify(payload)
        });
        zoneForm.reset();
        if(message) message.textContent='Zone created. Boundary not defined.';
        await loadNetworkMap(true);
      }catch(error){
        if(message) message.textContent=error.message||'Unable to create Zone.';
      }
    });
  }
}

function fitSelectedZone(){
  if(!prospectMap||!selectedZoneId) return false;
  const b=geographyLayerBounds(
    props=>String(props.id||'')===String(selectedZoneId)
  );
  if(b){
    prospectMap.fitBounds(b,{padding:[52,52],maxZoom:15,animate:false});
    return true;
  }
  return fitLatLngs(geographyLatLngs(selectedZoneId,null),14);
}

async function loadNetworkMap(force=false){
  if(force){
    networkMapLoaded=false;
    mapInitialFitDone=false;
  }
  if(networkMapLoaded || networkMapLoading) return;

  networkMapLoading=true;
  zoneMapSummary();

  try{
    const [geography,mapProjection]=await Promise.all([
      api('/api/admin/geography'),
      api('/api/admin/network-map')
    ]);

    const projectedZones=new Map(
      (Array.isArray(mapProjection?.zones)?mapProjection.zones:[])
        .map(zone=>[String(zone.id),zone])
    );

    networkMapData={
      areas:Array.isArray(geography?.areas)?geography.areas:[],
      zones:(Array.isArray(geography?.zones)?geography.zones:[]).map(zone=>{
        const projected=projectedZones.get(String(zone.id))||{};
        return {
          ...zone,
          boundary_geojson:projected.boundary_geojson||zone.boundary?.geojson||null,
          boundary_version:projected.boundary_version??zone.boundary?.version??null,
          boundary_status:projected.boundary_status??zone.boundary?.status??null,
          draft_version:projected.draft_version??null,
          location_count:projected.location_count??zone.metrics?.location_count??0,
          screen_count:projected.screen_count??0,
          commercial_screen_count:projected.commercial_screen_count??zone.metrics?.eligible_screen_count??0,
          online_screen_count:projected.online_screen_count??zone.metrics?.online_screen_count??0
        };
      }),
      locations:Array.isArray(mapProjection?.locations)
        ?mapProjection.locations
        :(Array.isArray(geography?.locations)?geography.locations:[]),
      screens:Array.isArray(geography?.screens)?geography.screens:[],
      totals:geography?.totals||{}
    };

    const markets=geographyMarkets();
    if(selectedMarketId && !markets.some(m=>String(m.id)===String(selectedMarketId))){
      selectedMarketId=null;
      selectedZoneId=null;
    }

    await loadGeographyPackageMemberships();
    networkMapLoaded=true;
    renderGeographyControlCenter();
  }catch(error){
    const el=$('#zoneMapSummary');
    if(el) el.textContent=`Zone geography unavailable · ${error.message}`;
    const tree=$('#geoTree');
    if(tree) tree.innerHTML=`<div class="muted">Geography unavailable · ${esc(error.message||'request failed')}</div>`;
  }finally{
    networkMapLoading=false;
    renderProspectMap();
  }
}

function renderProspectMap(){
  const mapEl=document.querySelector('#prospectMap');
  if(!window.L || !mapEl) return;
  if(!prospectMap && (!mapEl.offsetWidth || !mapEl.offsetHeight)) return;

  if(!prospectMap){
    prospectMap=L.map('prospectMap',{
      zoomControl:true,
      inertia:false,
      worldCopyJump:false,
      maxBoundsViscosity:1,
      zoomAnimation:false,
      fadeAnimation:false,
      markerZoomAnimation:false
    }).setView([33.816,-78.680],11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'&copy; OpenStreetMap'
    }).addTo(prospectMap);

    zoneLayer=L.geoJSON([],{
      style:zoneStyle,
      onEachFeature:(feature,layer)=>{
        const props=feature.properties||{};
        layer.bindTooltip(props.name||'CoastLoop Zone',{
          permanent:true,
          direction:'center',
          className:'zone-map-label'
        });
        layer.on('click',()=>{
          selectedZoneId=props.id;
          selectedMarketId=props.parent_area_id||null;
          renderGeographyControlCenter();
          renderProspectMap();
          requestAnimationFrame(()=>{
            if(!prospectMap) return;
            prospectMap.invalidateSize();
            constrainMapToGeography();
            fitSelectedZone();
          });
        });
      }
    }).addTo(prospectMap);

    networkLocationLayer=L.layerGroup().addTo(prospectMap);
    prospectLayer=L.layerGroup().addTo(prospectMap);
    planningGridLayer=L.layerGroup();

    prospectMap.on('zoomend',()=>{
      if(mapVisibility.grid) renderPlanningGrid();
    });
  }

  bindZoneMapControls();

  zoneLayer.clearLayers();
  (networkMapData.zones||[]).forEach(zone=>{
    if(!zone.boundary_geojson) return;
    zoneLayer.addData({
      type:'Feature',
      geometry:zone.boundary_geojson,
      properties:{
        id:zone.id,
        name:zone.name,
        status:zone.status,
        parent_area_id:zone.parent_area_id||null,
        boundary_status:zone.boundary_status
      }
    });
  });

  if(mapVisibility.grid) renderPlanningGrid(); // GRID_SNAP_REPAINT_V79

  networkLocationLayer.clearLayers();
  (networkMapData.locations||[]).forEach(location=>{
    const lat=Number(location.latitude);
    const lon=Number(location.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) return;

    const assignedZone=(networkMapData.zones||[]).find(
      zone=>String(zone.id||'')===String(location.zone_id||'')
    )||null;

    const spatialZone=(networkMapData.zones||[]).find(
      zone=>zone.boundary_geojson &&
        pointInGeometry(lat,lon,zone.boundary_geojson)
    )||null;

    const businessName=location.business_name||location.name||'CoastLoop location';
    const screenCount=Number(location.screen_count||0);
    const commercialCount=Number(location.commercial_screen_count||0);
    const onlineCount=Number(location.online_screen_count||0);

    const markerColor=assignedZone
      ?'#67d391'
      :(spatialZone?'#d8b66f':'#8ebcf5');

    const marker=L.circleMarker([lat,lon],{
      radius:Math.min(10,6+Math.sqrt(Math.max(0,screenCount))),
      weight:2,
      color:markerColor,
      fillColor:markerColor,
      fillOpacity:.78
    }).addTo(networkLocationLayer);

    const roles=[
      location.business_is_host?'Host':null,
      location.business_is_advertiser?'Advertiser':null
    ].filter(Boolean).join(' + ')||'Business';

    marker.bindTooltip(esc(businessName),{
      direction:'top',
      offset:[0,-6]
    });

    marker.bindPopup(
      `<strong>${esc(businessName)}</strong><br>`+
      `${location.business_category?`${esc(location.business_category)} · `:''}${esc(roles)}<br>`+
      `${esc(networkLocationAddress(location)||'Address not set')}<br>`+
      `<span class="pill">Spatial: ${esc(spatialZone?.name||'Outside mapped Zones')}</span> `+
      `<span class="pill">Sellable Zone: ${esc(assignedZone?.name||'Unassigned')}</span><br>`+
      `${screenCount} screen${screenCount===1?'':'s'} · `+
      `${commercialCount} commercial · ${onlineCount} online`+
      `${location.host_status?`<br>Host status: ${esc(location.host_status)}`:''}`
    );
  });

  prospectLayer.clearLayers();
  const prospectPoints=[];
  (state.prospects||[]).forEach(p=>{
    const lat=Number(p.latitude);
    const lon=Number(p.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) return;

    const marker=L.marker([lat,lon]).addTo(prospectLayer);
    marker.bindPopup(
      `<strong>${esc(p.name)}</strong><br>`+
      `${esc(prospectAddress(p))}<br>`+
      `<span class="pill">${esc(p.stage)}</span> Score ${p.score??'—'}<br>`+
      `<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat+','+lon)}">Navigate</a>`
    );
    prospectPoints.push([lat,lon]);
  });

  zoneMapSummary();
  applyMapLayerVisibility();

  if(networkMapLoaded && !mapInitialFitDone){
    fitZoneMap();
    mapInitialFitDone=true;
  }

  if(!networkMapLoaded && !networkMapLoading) loadNetworkMap();

  setTimeout(()=>prospectMap.invalidateSize(),50);
}

function routeProspects(){
  const chosen=state.prospects
    .filter(p=>p.stage==='hot'||p.stage==='follow_up'||Number(p.score)>=70)
    .slice(0,10);

  if(!chosen.length){
    $('#error').textContent='Mark prospects hot, follow-up, or score them 70+ first.';
    return;
  }

  const places=chosen.map(p=>{
    if(Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude)))
      return `${p.latitude},${p.longitude}`;
    return prospectAddress(p);
  }).filter(Boolean);

  if(!places.length){
    $('#error').textContent='Selected prospects need addresses or map coordinates.';
    return;
  }

  const destination=places.pop();
  let url=`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destination)}`;
  if(places.length) url+=`&waypoints=${encodeURIComponent(places.join('|'))}`;
  window.open(url,'_blank','noopener');
}

async function load(){
  if(!state.token && !readSession()?.access_token){
    location.replace('/login.html');
    return;
  }

  $('#error').textContent='';

  try {
    const [
      stats,screens,media,creativeJobs,playlists,prospects,businesses,onboarding,onboardingPackages,
      campaigns,campaignReports,userDirectory,finance,
      billingConfig,billingInvoices,billingTransactions,billingPayouts,auditEvents,authConfig
    ] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/screens'),
      api('/api/admin/media'),
      api('/api/admin/creative-jobs'),
      api('/api/admin/playlists'),
      api('/api/admin/prospects'),
      api('/api/admin/businesses'),
      api('/api/admin/onboarding'),
      api('/api/admin/onboarding/packages'),
      api('/api/admin/campaigns'),
      api('/api/admin/reports/campaigns'),
      api('/api/admin/users'),
      api('/api/admin/finance'),
      api('/api/admin/billing/config'),
      api('/api/admin/billing/invoices'),
      api('/api/admin/billing/transactions'),
      api('/api/admin/billing/payouts'),
      api('/api/admin/audit?limit=75'),
      fetch('/api/auth/config').then(r=>r.json())
    ]);

    Object.assign(state,{
      screens,media,creativeJobs,playlists,prospects,businesses,onboarding,onboardingPackages,
      campaigns,campaignReports,userDirectory,finance,
      billingConfig,billingInvoices,billingTransactions,billingPayouts,auditEvents,authConfig
    });

    renderOpsCommandCenter(stats);

    $('#mScreens').textContent=stats.screens;
    $('#mOnline').textContent=stats.online;
    $('#mMedia').textContent=stats.media;
    $('#mPlays').textContent=stats.plays_24h;
    $('#mProspects').textContent=prospects.length;
    $('#mBusinesses').textContent=businesses.length;
    renderDigitalOnboarding();
    await hydratePackageZoneEditors();
    $('#mUsers').textContent=(userDirectory.users||[]).length;
    $('#fRevenue').textContent=money(finance.booked_revenue_cents);
    $('#fCommission').textContent=money(finance.broker_commission_cents);
    $('#fHost').textContent=money(finance.host_annual_commitment_cents);
    $('#fHardware').textContent=money(finance.hardware_cost_cents);
    $('#fSetup').textContent=money(finance.setup_cost_cents);
    $('#fContribution').textContent=money(finance.contribution_cents);
    $('#fInvoiced').textContent=money(finance.invoiced_cents);
    $('#fCollected').textContent=money(finance.net_collected_cents);
    $('#fReceivable').textContent=money(finance.receivable_cents);
    $('#fRefunded').textContent=money(finance.refunded_cents);
    $('#fCommissionEarned').textContent=money(finance.broker_commission_earned_cents);
    $('#fBrokerDue').textContent=money(finance.broker_payout_due_cents);
    $('#fHostDue').textContent=money(finance.host_payout_due_cents);

    $('#adminMode').textContent=state.token?'RECOVERY KEY':'OWNER LOGIN';
    $('#ownerSetup').hidden=!(authConfig.bootstrap_required && state.token);

    if(!state.token && readSession()?.access_token){
      try{
        const me=await sessionApi('/api/auth/me');
        state.currentInternalRole=me.access?.internal_role||null;
        $('#adminWho').textContent=me.user?.full_name||me.user?.email||'';
      }catch{}
    }else{
      state.currentInternalRole='owner';
      $('#adminWho').textContent='Bootstrap / recovery access';
    }

    render();
    renderUsers();
    renderAudit();
    renderProspectMap();
  } catch(e){
    $('#error').textContent=e.message;
    if(!state.token && String(e.message).includes('401'))
      location.replace('/login.html');
  }
}

function playlistOptions(selected=''){
  return `<option value="">No playlist</option>` + state.playlists.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');
}
function prospectInterest(p){
  const bits=[];
  if(p.advertiser_interest) bits.push('AD');
  if(p.host_interest) bits.push('HOST');
  return bits.join(' + ') || '—';
}
function stageOptions(selected='new'){
  return ['new','researched','contacted','follow_up','hot','won','lost','do_not_contact']
    .map(v=>`<option value="${v}" ${v===selected?'selected':''}>${v.replaceAll('_',' ')}</option>`).join('');
}

function ownerControlsAllowed(){
  return Boolean(state.token || state.currentInternalRole==='owner');
}
function internalRoleOptions(selected=''){
  const roles=['',...((ownerControlsAllowed()||selected==='owner')?['owner']:[]),'admin','broker','creative','viewer'];
  return roles.map(v=>`<option value="${v}" ${v===selected?'selected':''} ${v==='owner'&&!ownerControlsAllowed()?'disabled':''}>${v||'No internal access'}</option>`).join('');
}

function inviteRoleOptions(type){
  return (type==='internal'
    ? ['admin','broker','creative','viewer']
    : ['owner','manager','viewer'])
    .map(v=>`<option value="${v}">${v}</option>`).join('');
}

function refreshInviteControls(){
  const type=$('#inviteType').value;
  $('#inviteBusiness').disabled=type==='internal';
  $('#inviteBusiness').style.opacity=type==='internal'?'.45':'1';
  $('#inviteRole').innerHTML=inviteRoleOptions(type);
}

function businessAccessEditor(user){
  const memberships=user.businesses||[];
  return `
    <div class="user-business-access">
      ${state.businesses.map(b=>{
        const m=memberships.find(x=>x.business_id===b.id);
        return `<label style="display:flex;align-items:center;gap:6px;margin:4px 0;white-space:nowrap">
          <input class="u-business" type="checkbox" data-business="${b.id}" style="width:auto" ${m?'checked':''}>
          <span>${esc(b.name)}</span>
          <select class="u-business-role" data-business="${b.id}" style="width:auto" ${m?'':'disabled'}>
            ${['owner','manager','viewer'].map(r=>`<option value="${r}" ${(m?.role||'viewer')===r?'selected':''}>${r}</option>`).join('')}
          </select>
        </label>`;
      }).join('')||'<span class="muted">No businesses yet</span>'}
    </div>`;
}

function renderUsers(){
  const directory=state.userDirectory||{users:[],invitations:[]};
  const users=directory.users||[];
  const invitations=(directory.invitations||[]).filter(x=>x.status==='pending');

  $('#inviteBusiness').innerHTML=
    '<option value="">Choose business…</option>'+
    state.businesses.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');
  if($('#prospectBroker')) $('#prospectBroker').innerHTML=brokerOptions();
  refreshInviteControls();

  $('#users').innerHTML=users.map(u=>{
    const protectedOwner=u.internal_role==='owner'&&!ownerControlsAllowed();
    return `
    <tr data-user="${u.user_id}">
      <td>
        <strong>${esc(u.full_name||u.email)}</strong>
        <div class="muted">${esc(u.email)}</div>
      </td>
      <td>
        <select class="u-internal" ${protectedOwner?'disabled':''}>${internalRoleOptions(u.internal_role||'')}</select>
        <label class="broker-rate ${u.internal_role==='broker'?'':'is-hidden'}">
          <span>Commission %</span>
          <input class="u-broker-rate" type="number" min="0" max="100" step="0.25" value="${Number(u.broker_commission_percent||0)}">
        </label>
      </td>
      <td>${businessAccessEditor(u)}</td>
      <td>${age(u.last_login_at)}</td>
      <td><button class="save-user-access" ${protectedOwner?'disabled':''}>${protectedOwner?'Owner protected':'Save access'}</button></td>
    </tr>
  `}).join('')||'<tr><td colspan="5" class="muted">No activated users yet.</td></tr>';

  $('#invitations').innerHTML=invitations.map(i=>{
    const b=state.businesses.find(x=>x.id===i.business_id);
    const link=`${location.origin}/login.html?invite=${encodeURIComponent(i.email)}`;
    return `<div class="media-item" data-invite="${i.id}">
      <div class="row">
        <div>
          <strong>${esc(i.email)}</strong>
          <div class="muted">${esc(i.account_type)} · ${esc(i.role)}${b?' · '+esc(b.name):''}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="secondary copy-invite" data-link="${esc(link)}">Copy activation link</button>
          <button class="secondary revoke-invite">Revoke</button>
        </div>
      </div>
    </div>`;
  }).join('')||'<div class="muted">No pending invitations.</div>';
}

function renderAudit(){
  const box=$('#auditEvents');
  if(!box)return;

  const rows=state.auditEvents||[];
  if($('#mAudit'))$('#mAudit').textContent=rows.length;

  box.innerHTML=rows.map(e=>{
    const actor=e.actor_type==='legacy_admin'
      ? 'RECOVERY OWNER'
      : String(e.actor_role||e.actor_type||'system').toUpperCase();
    const target=[e.entity_type,e.entity_id?String(e.entity_id).slice(0,12):null]
      .filter(Boolean).join(' · ');
    const result=e.succeeded?`OK ${e.status_code}`:`FAILED ${e.status_code}`;

    return `<div class="media-item">
      <div class="row">
        <div>
          <strong>${esc(e.action)}</strong>
          <div class="muted">${esc(actor)}${target?' · '+esc(target):''}</div>
        </div>
        <div style="text-align:right">
          <span class="pill">${esc(result)}</span>
          <div class="muted">${age(e.created_at)}</div>
        </div>
      </div>
      <div class="muted" style="margin-top:7px">${esc(e.request_method)} ${esc(e.request_path)}</div>
    </div>`;
  }).join('')||'<div class="muted">No operator activity recorded yet.</div>';
}



function ensureTodayOperatorPanel(){
  if(document.getElementById('todayPriorityStrip'))return;

  const anchor=document.getElementById('today');
  if(!anchor)return;

  const strip=document.createElement('div');
  strip.id='todayPriorityStrip';
  strip.className='today-priority-strip';
  strip.innerHTML=`
    <div class="today-priority primary">
      <div class="label">Next move</div>
      <div class="value" id="todayNextMove">Loading operations…</div>
      <div class="sub" id="todayNextMoveSub">
        CoastLoop is checking what needs attention first.
      </div>
    </div>
    <div class="today-priority">
      <div class="label">Screens</div>
      <div class="value" id="todayScreens">-</div>
      <div class="sub">commercial online</div>
    </div>
    <div class="today-priority">
      <div class="label">Campaigns</div>
      <div class="value" id="todayCampaigns">-</div>
      <div class="sub">active now</div>
    </div>
    <div class="today-priority">
      <div class="label">Queue</div>
      <div class="value" id="todayQueue">-</div>
      <div class="sub">items needing action</div>
    </div>`;

  const actions=document.createElement('div');
  actions.className='today-quick-actions';
  actions.innerHTML=`
    <button type="button" class="primary"
      data-today-go="network">Screens</button>
    <button type="button"
      data-today-go="sales">Advertisers</button>
    <button type="button"
      data-today-go="creative">Creative</button>
    <button type="button"
      data-today-go="finance">Finance</button>`;

  anchor.insertAdjacentElement('afterend',strip);
  strip.insertAdjacentElement('afterend',actions);

  actions.querySelectorAll('[data-today-go]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const key=btn.dataset.todayGo;
      const nav=document.querySelector(
        `.admin-nav a[href="#${key}"]`
      );
      if(nav)nav.click();
    });
  });
}

function renderTodayOperatorPanel(){
  ensureTodayOperatorPanel();

  const commercial=(state.screens||[]).filter(isCommercialScreen);
  const onlineScreens=commercial.filter(
    x=>online(x.last_seen_at)
  );

  const campaigns=state.campaigns||[];
  const activeCampaigns=campaigns.filter(
    x=>String(x.status||'').toLowerCase()==='active'
  );

  const media=state.media||[];
  const pendingMedia=media.filter(x=>{
    const v=String(
      x.approval_status||x.status||''
    ).toLowerCase();
    return v==='pending'||v==='review';
  });

  const tasks=(state.tasks||[]).filter(x=>{
    const v=String(x.status||'').toLowerCase();
    return v==='open'||v==='in_progress';
  });

  const offline=Math.max(
    0,
    commercial.length-onlineScreens.length
  );

  const queue=offline+pendingMedia.length+tasks.length;

  const set=(id,value)=>{
    const el=document.getElementById(id);
    if(el)el.textContent=value;
  };

  set('todayScreens',
    `${onlineScreens.length}/${commercial.length}`);
  set('todayCampaigns',String(activeCampaigns.length));
  set('todayQueue',String(queue));

  let move='Network is healthy';
  let sub='No immediate operational exception is showing.';

  if(offline>0){
    move=`Restore ${offline} offline screen${offline===1?'':'s'}`;
    sub='Screen delivery health is the first operational priority.';
  }else if(pendingMedia.length>0){
    move=`Review ${pendingMedia.length} creative asset${
      pendingMedia.length===1?'':'s'
    }`;
    sub='Creative is waiting before it can move into delivery.';
  }else if(tasks.length>0){
    move=`Clear ${tasks.length} open task${tasks.length===1?'':'s'}`;
    sub='The operations queue has follow-up waiting.';
  }else if(activeCampaigns.length===0){
    move='Activate the first campaign';
    sub='Infrastructure is ready; revenue delivery is the next move.';
  }

  set('todayNextMove',move);
  set('todayNextMoveSub',sub);
}
function renderCommandCenter(){
  const screens=state.screens||[];
  const commercial=screens.filter(isCommercialScreen);
  const onlineScreens=commercial.filter(s=>online(s.last_seen_at));
  const campaigns=state.campaigns||[];
  const active=campaigns.filter(c=>c.status==='active');
  const tasks=state.tasks||[];
  const openTasks=tasks.filter(t=>t.status==='open'||t.status==='in_progress');
  const prospects=state.prospects||[];

  const set=(id,v)=>{
    const e=document.getElementById(id);
    if(e)e.textContent=v;
  };
  const put=(id,html)=>{
    const e=document.getElementById(id);
    if(e)e.innerHTML=html;
  };
  const item=(title,detail,value='')=>`
    <div class="command-item">
      <div><strong>${esc(title)}</strong><small>${esc(detail||'')}</small></div>
      <div class="command-value">${esc(String(value||''))}</div>
    </div>`;

  set('mCampaigns',active.length);
  set('mAttention',openTasks.length);
  set('mScreenDetail',`${onlineScreens.length} of ${commercial.length} commercial screens`);
  set('mCampaignDetail',`${campaigns.length} total campaigns`);

  const offline=commercial.filter(s=>!online(s.last_seen_at));
  const health=offline.length
    ? `${offline.length} screen${offline.length===1?'':'s'} offline`
    : commercial.length
      ? 'Network healthy'
      : 'Ready for first screen';
  set('commandHealth',health);

  const attention=[];
  offline.slice(0,4).forEach(x=>
    attention.push(item(x.name||'Screen offline',
      x.last_seen_at?`Last seen ${age(x.last_seen_at)}`:'Never checked in',
      'OFFLINE')));
  openTasks.slice(0,6-attention.length).forEach(x=>
    attention.push(item(x.title||x.task_type||'Open task',
      x.status||'open',
      'ACTION')));
  put('commandAttention',
    attention.join('')||
    '<div class="command-empty">Nothing urgent right now.</div>');

  put('commandScreens',
    commercial.slice(0,5).map(x=>item(
      x.name||'Screen',
      x.location_name||x.status||'CoastLoop screen',
      online(x.last_seen_at)?'ONLINE':'OFFLINE'
    )).join('')||
    '<div class="command-empty">No commercial screens paired yet.</div>');

  put('commandCampaigns',
    active.slice(0,5).map(x=>item(
      x.name||x.campaign_name||'Campaign',
      x.business_name||x.status||'active',
      'ACTIVE'
    )).join('')||
    '<div class="command-empty">No active campaigns yet.</div>');

  const hot=prospects.filter(x=>
    !['won','lost','closed'].includes(String(x.status||'').toLowerCase()));
  put('commandSales',
    hot.slice(0,5).map(x=>item(
      x.business_name||x.name||'Prospect',
      x.status||'prospect',
      x.value_cents?money(x.value_cents):''
    )).join('')||
    '<div class="command-empty">No open sales prospects yet.</div>');
}

function render(){
  renderCommandCenter();
  $('#prospects').innerHTML = state.prospects.map(p=>`<tr data-id="${p.id}">
    <td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.city||'')}${p.state?', '+esc(p.state):''}</div></td>
    <td><span class="pill">${prospectInterest(p)}</span></td>
    <td>${esc(p.contact_name||'')}<div class="muted">${esc(p.phone||p.email||'')}</div></td>
    <td>
      <select class="p-stage">${stageOptions(p.stage)}</select>
      <select class="p-broker compact-select">${brokerOptions(p.broker_user_id||'')}</select>
    </td>
    <td>
      <input class="p-score" type="number" min="0" max="100" value="${p.score??''}">
      ${p.host_interest?`<input class="p-host-pay" type="number" min="0" max="599" step="1" value="${Number(p.host_annual_pay_cents||0)/100}" title="Annual host pay per TV">`:''}
    </td>
    <td><input class="p-follow" type="datetime-local" value="${p.next_follow_up_at ? new Date(p.next_follow_up_at).toISOString().slice(0,16) : ''}"></td>
    <td><div class="row"><button class="save-prospect">Save</button>${p.stage==='won'?'':`<button class="secondary promote-prospect">Promote</button>`}</div></td>
  </tr>`).join('') || '<tr><td colspan="7" class="muted">No prospects yet.</td></tr>';
  const capabilityAgreements=Array.isArray(state.onboarding?.agreements)
    ? state.onboarding.agreements : [];
  const capabilityOrders=Array.isArray(state.onboarding?.advertiser_orders)
    ? state.onboarding.advertiser_orders : [];

  $('#businesses').innerHTML = state.businesses.map(b=>{
    const hostAgreement=capabilityAgreements.find(a=>
      a.business_id===b.id &&
      a.template_family==="venue_partner"
    );
    const advertiserOrder=capabilityOrders.find(o=>
      o.advertiser_business_id===b.id
    );

    const hostPending=!b.is_host &&
      hostAgreement &&
      !hostAgreement.signed_at &&
      ["prepared","sent","viewed"].includes(hostAgreement.status);

    const advertiserPending=!b.is_advertiser &&
      advertiserOrder &&
      ["prepared","sent","viewed","accepted","payment_pending"].includes(advertiserOrder.status);

    const hostStatus=b.is_host?"ACTIVE":hostPending?"PENDING":"OFF";
    const advertiserStatus=b.is_advertiser?"ACTIVE":advertiserPending?"PENDING":"OFF";

    const hostSource=hostAgreement
      ? `Venue agreement · ${esc(hostAgreement.status||"unknown")}`
      : "No venue agreement";

    const advertiserSource=advertiserOrder
      ? `Advertising order · ${esc(advertiserOrder.status||"unknown")}`
      : "No advertising order";

    return `
    <div class="media-item">
      <div class="row">
        <div>
          <strong>${esc(b.name)}</strong>
          <span class="pill">${esc(b.category||'business')}</span>
          <span class="pill">HOST ${hostStatus}</span>
          <span class="pill">ADVERTISER ${advertiserStatus}</span>
          <div class="muted">${esc(b.contact_name||'')}${b.phone?' · '+esc(b.phone):''}${b.email?' · '+esc(b.email):''}</div>
          <div class="muted">${hostSource} · ${advertiserSource}</div>
        </div>
        <div class="muted">${(b.locations||[]).length} location${(b.locations||[]).length===1?'':'s'}</div>
      </div>
      ${(b.locations||[]).map(l=>`<div class="muted">${esc([l.address_line1,l.city,l.state].filter(Boolean).join(', '))} · ${esc(l.host_status||'')}</div>`).join('')}
    </div>`;
  }).join('') || '<div class="muted">No customers yet. Promote a prospect when they convert.</div>';

  $('#campaignBusiness').innerHTML = '<option value="">Choose advertiser…</option>' +
    state.businesses.filter(b=>b.is_advertiser).map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');

  $('#mediaBusiness').innerHTML = '<option value="">House / internal</option>' +
    state.businesses.filter(b=>b.is_advertiser).map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');

  $('#creativeBusiness').innerHTML = '<option value="">House / internal</option>' +
    state.businesses.filter(b=>b.is_advertiser).map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');

  renderCreativeStudio();

  renderScheduling();

  $('#pairLocation').innerHTML = locationOptions();
  $('#pairPlaylist').innerHTML = '<option value="">No playlist yet</option>' +
    state.playlists.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');

  $('#campaigns').innerHTML = state.campaigns.map(c=>{
    const b=state.businesses.find(x=>x.id===c.advertiser_business_id);
    const r=state.campaignReports.find(x=>x.campaign_id===c.id) || {};
    const price=c.price_cents==null?'—':('$'+(Number(c.price_cents)/100).toLocaleString());
    const seconds=Number(r.seconds_played||0);
    const delivered=seconds>=3600 ? `${(seconds/3600).toFixed(1)} hr` : `${Math.round(seconds/60)} min`;
    const last=r.last_played_at ? new Date(r.last_played_at).toLocaleString() : 'Not yet';
    const goal=Number(r.delivery_goal_plays||0);
    const remaining=r.remaining_plays==null ? null : Number(r.remaining_plays);
    const deliveryPct=r.delivery_percent==null ? null : Number(r.delivery_percent);
    const pacePct=r.pace_percent==null ? null : Number(r.pace_percent);
    const health=String(r.delivery_health||'not_targeted').replaceAll('_',' ');
    const dateValue=v=>{
      if(!v) return '';
      const d=new Date(v);
      if(Number.isNaN(d.getTime())) return '';
      const shifted=new Date(d.getTime()-d.getTimezoneOffset()*60000);
      return shifted.toISOString().slice(0,16);
    };
    return `<div class="media-item">
      <div class="row">
        <div><strong>${esc(c.name)}</strong><div class="muted">${esc(b?.name||'Unknown advertiser')}</div></div>
        <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
          <span class="pill">${esc(c.status)}</span>
          <strong>${price}</strong>
          <button class="secondary view-report" data-campaign="${c.id}" type="button">View report</button>
          ${campaignActions(c)}
        </div>
      </div>
      <div class="row" style="margin-top:12px">
        <div><strong>${Number(r.plays||0).toLocaleString()}</strong><div class="muted">plays</div></div>
        <div><strong>${Number(r.screen_count||0)}</strong><div class="muted">screens</div></div>
        <div><strong>${delivered}</strong><div class="muted">delivered</div></div>
        <div><strong>${esc(last)}</strong><div class="muted">last play</div></div>
      </div>
      <div class="row" style="margin-top:10px">
        <div><strong>${goal ? goal.toLocaleString() : '—'}</strong><div class="muted">delivery goal</div></div>
        <div><strong>${remaining==null ? '—' : remaining.toLocaleString()}</strong><div class="muted">remaining</div></div>
        <div><strong>${deliveryPct==null ? '—' : deliveryPct.toFixed(1)+'%'}</strong><div class="muted">goal delivered</div></div>
        <div><strong>${pacePct==null ? esc(health) : pacePct.toFixed(1)+'%'}</strong><div class="muted">${pacePct==null ? 'delivery health' : esc(health)+' pace'}</div></div>
      </div>
      <div class="row" style="margin-top:10px;align-items:end">
        <label class="muted">Start
          <input class="campaign-delivery-start" data-campaign="${c.id}" type="datetime-local" value="${esc(dateValue(c.starts_at))}">
        </label>
        <label class="muted">End
          <input class="campaign-delivery-end" data-campaign="${c.id}" type="datetime-local" value="${esc(dateValue(c.ends_at))}">
        </label>
        <label class="muted">Target plays
          <input class="campaign-delivery-target" data-campaign="${c.id}" type="number" min="1" step="1" value="${c.delivery_target_plays==null?'':Number(c.delivery_target_plays)}" placeholder="No guarantee">
        </label>
        <label class="muted">Makegood
          <input class="campaign-delivery-makegood" data-campaign="${c.id}" type="number" min="0" step="1" value="${Number(c.makegood_plays||0)}">
        </label>
        <button class="secondary save-campaign-delivery" data-campaign="${c.id}" type="button">Save delivery</button>
      </div>
    </div>`;
  }).join('') || '<div class="muted">No campaigns yet.</div>';


  if($('#billingStatus')){
    const stripe=state.billingConfig.stripe_configured;
    const hook=state.billingConfig.stripe_webhook_configured;
    $('#billingStatus').textContent = stripe
      ? `STRIPE ${hook?'READY':'KEY SET · WEBHOOK NEEDED'}`
      : 'MANUAL LEDGER · STRIPE NOT CONNECTED';
    $('#billingStatus').className='pill';
  }

  if($('#billingCampaign')){
    $('#billingCampaign').innerHTML='<option value="">Choose campaign…</option>'+
      state.campaigns
        .filter(c=>!['canceled'].includes(c.status))
        .map(c=>{
          const b=state.businesses.find(x=>x.id===c.advertiser_business_id);
          return `<option value="${c.id}">${esc(b?.name||'Advertiser')} — ${esc(c.name)} · ${money(c.price_cents)}</option>`;
        }).join('');
  }

  if($('#billingProvider')){
    const stripeOption=$('#billingProvider').querySelector('option[value="stripe"]');
    if(stripeOption){
      stripeOption.disabled=!state.billingConfig.stripe_configured;
      stripeOption.textContent=state.billingConfig.stripe_configured
        ? 'Stripe hosted invoice · Stripe-enabled methods'
        : 'Stripe hosted invoice · connect Stripe first';
    }
  }

  if($('#billingInvoices')){
    $('#billingInvoices').innerHTML=state.billingInvoices.map(inv=>{
      const c=state.campaigns.find(x=>x.id===inv.campaign_id);
      const b=state.businesses.find(x=>x.id===inv.advertiser_business_id);
      const due=inv.due_at ? new Date(inv.due_at).toLocaleDateString() : '—';
      const provider=String(inv.provider||'manual').toUpperCase();
      const actions=[];
      if(inv.status==='draft')
        actions.push(`<button class="secondary billing-send" data-id="${inv.id}">Send / open</button>`);
      if(inv.provider==='manual' && inv.status==='open' && Number(inv.amount_due_cents||0)>0)
        actions.push(`<button class="secondary billing-pay" data-id="${inv.id}" data-amount="${Number(inv.amount_due_cents||0)}">Record ${money(inv.amount_due_cents)} paid</button>`);
      if(inv.provider==='manual' && inv.status==='paid' &&
         Number(inv.amount_paid_cents||0)>Number(inv.amount_refunded_cents||0))
        actions.push(`<button class="secondary billing-refund" data-id="${inv.id}" data-amount="${Number(inv.amount_paid_cents||0)-Number(inv.amount_refunded_cents||0)}">Record refund</button>`);
      if(inv.hosted_invoice_url)
        actions.push(`<a class="button-link" href="${esc(inv.hosted_invoice_url)}" target="_blank" rel="noopener">Open hosted invoice</a>`);

      return `<div class="media-item" data-invoice="${inv.id}">
        <div class="row">
          <div>
            <strong>${esc(b?.name||'Advertiser')} · ${esc(c?.name||'Campaign')}</strong>
            <div class="muted">${provider} · ${esc(inv.invoice_number||inv.id.slice(0,8))} · due ${esc(due)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            <span class="pill">${esc(inv.status)}</span>
            <strong>${money(inv.total_cents)}</strong>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <div><strong>${money(inv.amount_paid_cents)}</strong><div class="muted">paid</div></div>
          <div><strong>${money(inv.amount_due_cents)}</strong><div class="muted">due</div></div>
          <div><strong>${money(inv.amount_refunded_cents)}</strong><div class="muted">refunded</div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${actions.join('')}</div>
        </div>
      </div>`;
    }).join('') || '<div class="muted">No invoices yet. Create one from a campaign.</div>';
  }

  $('#screens').innerHTML = state.screens.map(s=>`<tr data-id="${s.id}">
    <td><span class="pill ${online(s.last_seen_at)?'online':'offline'}">${online(s.last_seen_at)?'ONLINE':'OFFLINE'}</span></td>
    <td>
      <input class="s-name" value="${esc(s.name||'')}" style="min-width:165px">
      ${s.is_test ? '<div class="muted" style="margin-top:4px">INTERNAL / TEST</div>' : ''}
    </td>
    <td>
      <label style="display:flex;align-items:center;gap:7px;white-space:nowrap">
        <input class="s-test" type="checkbox" style="width:auto" ${s.is_test?'checked':''}>
        <span class="muted">Exclude</span>
      </label>
    </td>
    <td>
      <select class="s-location">${locationOptions(s.location_id||'')}</select>
      <div class="muted">${esc(s.address||'No physical location linked')}</div>
    </td>
    <td><select class="s-playlist">${playlistOptions(s.playlist_id)}</select></td>
    <td>
      <strong>${Number(s.plays_today||0).toLocaleString()}</strong>
      <div class="muted">plays</div>
    </td>
    <td>
      <strong>${duration(s.seconds_today)}</strong>
      <div class="muted">today</div>
    </td>
    <td>
      <strong>${Number(s.plays_total||0).toLocaleString()}</strong>
      <div class="muted">${duration(s.seconds_total)} delivered</div>
    </td>
    <td>${age(s.last_played_at)}</td>
    <td>
      <strong>${age(s.last_seen_at)}</strong>
      <div class="muted">${esc(s.app_version||'unknown version')}</div>
    </td>
    <td>
      <strong>${resolution(s)}</strong>
      <div class="muted">${esc(hardwareLabel(s))}</div>
      <select class="s-deployment" style="margin-top:6px">${deploymentOptions(s.deployment_class||'unreviewed')}</select>
      <input class="s-cert-note" value="${esc(s.certification_note||'')}" placeholder="Hardware certification note" style="margin-top:6px;min-width:220px">
    </td>
    <td><input class="s-host-pay" type="number" min="0" max="599" step="1" value="${Number(s.host_annual_pay_cents||0)/100}"></td>
    <td><input class="s-hardware" type="number" min="0" step="1" value="${Number(s.hardware_cost_cents||0)/100}"></td>
    <td><input class="s-setup" type="number" min="0" step="1" value="${Number(s.setup_cost_cents||0)/100}"></td>
    <td><strong>${esc(s.pair_code||'—')}</strong></td>
    <td>
      ${s.lan_ip
        ? `<button class="secondary relaunch-screen" data-ip="${esc(s.lan_ip)}">▶ Relaunch</button>
           <div class="muted" style="margin-top:4px">${esc(s.lan_ip)}</div>`
        : '<span class="muted">No LAN IP</span>'}
    </td>
    <td>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="save-screen" ${s.paired_at?'':'disabled'}>Save</button>
        ${s.is_test && s.paired_at ? '<button class="secondary reset-pairing" type="button">Reset pairing</button>' : ''}
      </div>
    </td>
  </tr>`).join('');
  $('#media').innerHTML = state.media.map(m=>{
    const advertiser=state.businesses.find(b=>b.id===m.advertiser_business_id);
    const approval=m.approval_status||'pending';
    const reason=m.rejection_reason ? `<div class="error" style="margin-top:6px">${esc(m.rejection_reason)}</div>` : '';
    const mediaType=String(m.mime_type||m.media_type||m.kind||'').toLowerCase();
    const isVideo=mediaType.includes('video') || String(m.original_filename||m.name||'').toLowerCase().endsWith('.mp4');
    const mediaUrl=`/media/${encodeURIComponent(m.id)}`;
    const preview=isVideo
      ? `<video class="creative-preview-media" src="${mediaUrl}" controls preload="metadata" playsinline></video>`
      : `<button class="creative-preview-open" data-preview-media="${m.id}" type="button" aria-label="Open ${esc(m.name||'creative')} preview"><img class="creative-preview-media" src="${mediaUrl}" alt="${esc(m.name||'Creative preview')}" loading="lazy"></button>`;
    return `<div class="media-item creative-review-item" data-media="${m.id}">
      <div class="creative-review-grid">
        <div class="creative-preview-frame">
          ${preview}
          <button class="secondary open-media-preview" data-preview-media="${m.id}" type="button">Open large preview</button>
        </div>
        <div class="creative-review-copy">
          <div class="creative-review-title">
            <strong>${esc(m.name||m.title||'Untitled creative')}</strong>
            <span class="pill">${esc(m.media_type||m.kind||mediaType||'media')}</span>
            <span class="pill">${esc(approval)}</span>
          </div>
          <div class="muted">${advertiser ? 'Advertiser: '+esc(advertiser.name) : 'House / internal'} · ${Number(m.duration_seconds||0)}s · ${(Number(m.bytes||m.byte_size||0)/1024/1024).toFixed(2)} MB</div>
          ${reason}
          <div class="creative-review-actions">
            ${approval!=='approved' ? `<button class="approve-media" data-media="${m.id}" type="button">Approve</button>` : ''}
            ${approval!=='rejected' ? `<button class="secondary reject-media" data-media="${m.id}" type="button">Reject</button>` : ''}
            ${approval!=='pending' ? `<button class="secondary reset-media-review" data-media="${m.id}" type="button">Re-review</button>` : ''}
          </div>
          <div class="muted creative-id">${m.id}</div>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="muted">No media yet.</div>';
  $('#playlists').innerHTML = state.playlists.map(p=>`<div class="playlist" data-id="${p.id}">
    <div class="row">
      <div><strong>${esc(p.name)}</strong><div class="muted">Revision ${p.revision}</div></div>
      <button class="secondary add-media">Add selected media</button>
    </div>
    <div class="row" style="margin-top:10px">
      <select class="media-picker">${state.media.filter(m=>m.status==='ready').map(m=>{
        const advertiser=state.businesses.find(b=>b.id===m.advertiser_business_id);
        const review=m.approval_status||'pending';
        return `<option value="${m.id}">${esc(m.name)} · ${esc(review)}${advertiser?' · '+esc(advertiser.name):' · house'}</option>`;
      }).join('')}</select>
      <select class="campaign-picker">
        <option value="">House / no campaign</option>
        ${state.campaigns.filter(c=>!['completed','canceled'].includes(c.status)).map(c=>{
          const b=state.businesses.find(x=>x.id===c.advertiser_business_id);
          return `<option value="${c.id}">${esc(b?.name||'Advertiser')} — ${esc(c.name)}</option>`;
        }).join('')}
      </select>
    </div>
    <ol>${(p.items||[]).map(i=>{
      const c=state.campaigns.find(x=>x.id===i.campaign_id);
      const b=c ? state.businesses.find(x=>x.id===c.advertiser_business_id) : null;
      const label=c ? `${b?.name||'Advertiser'} — ${c.name}` : 'House';
      return `<li>${esc(i.name)} <span class="pill">${esc(label)}</span> <button class="secondary remove-item" data-media="${i.media_id}" data-item="${i.id}" style="padding:4px 7px">remove</button></li>`;
    }).join('')}</ol>
  </div>`).join('') || '<div class="muted">No playlists yet.</div>';

  if(window.refreshAdminSidebar)window.refreshAdminSidebar();
  renderWorkspaceMetrics();
  renderTodayOperatorPanel();}

$('#saveToken').onclick=()=>{
  state.token=$('#token').value.trim();
  sessionStorage.setItem('adminToken',state.token);
  load();
};

$('#ownerSetup').onclick=()=>{
  location.href='/login.html';
};


const billingForm=$('#newBillingInvoice');
if(billingForm) billingForm.onsubmit=async e=>{
  e.preventDefault();
  const f=e.target, fd=new FormData(f), body=Object.fromEntries(fd.entries());
  if(!body.campaign_id) return;
  body.days_until_due=Math.max(1,Math.min(365,Math.round(Number(body.days_until_due||15))));
  if(body.total_dollars!=='')
    body.total_cents=Math.round(Number(body.total_dollars||0)*100);
  delete body.total_dollars;
  body.request_key=`ui-invoice:${body.campaign_id}:${crypto.randomUUID()}`;
  const button=f.querySelector('button[type="submit"],button:not([type])');
  if(button) button.disabled=true;
  try{
    $('#billingMessage').textContent='Creating invoice…';
    await api('/api/admin/billing/invoices',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(body)
    });
    f.reset();
    f.elements.days_until_due.value='15';
    $('#billingMessage').textContent='Invoice created.';
    await load();
  }catch(err){
    $('#billingMessage').textContent=err.message;
  }finally{
    if(button) button.disabled=false;
  }
};

const billingInvoices=$('#billingInvoices');
if(billingInvoices) billingInvoices.onclick=async e=>{
  const id=e.target.dataset.id;
  if(!id) return;

  try{
    e.target.disabled=true;

    if(e.target.matches('.billing-send')){
      if(!confirm('Open/send this invoice now?')) return;
      await api(`/api/admin/billing/invoices/${id}/send`,{method:'POST'});
    }

    if(e.target.matches('.billing-pay')){
      const amount=Number(e.target.dataset.amount||0);
      if(!confirm(`Record ${money(amount)} as received?`)) return;
      await api(`/api/admin/billing/invoices/${id}/payments`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          amount_cents:amount,
          payment_method:'manual',
          request_key:`ui-payment:${id}:${crypto.randomUUID()}`
        })
      });
    }

    if(e.target.matches('.billing-refund')){
      const amount=Number(e.target.dataset.amount||0);
      if(!confirm(`Record a ${money(amount)} refund?`)) return;
      await api(`/api/admin/billing/invoices/${id}/refunds`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          amount_cents:amount,
          request_key:`ui-refund:${id}:${crypto.randomUUID()}`
        })
      });
    }

    await load();
  }catch(err){
    $('#billingMessage').textContent=err.message;
    e.target.disabled=false;
  }
};

$('#accountButton').onclick=()=>{
  if(state.token && state.authConfig?.bootstrap_required){
    location.href='/login.html';
    return;
  }
  location.href='/account.html';
};

$('#logoutButton').onclick=async()=>{
  if(state.token){
    sessionStorage.removeItem('adminToken');
    state.token='';
  }
  await sessionLogout();
  location.replace('/login.html');
};

$('#inviteType').onchange=refreshInviteControls;

$('#inviteUser').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const type=f.get('account_type');

  try{
    const d=await api('/api/admin/users/invite',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        email:f.get('email'),
        account_type:type,
        business_id:type==='business'?f.get('business_id'):null,
        role:f.get('role')
      })
    });

    const link=`${location.origin}/login.html?invite=${encodeURIComponent(f.get('email'))}`;
    $('#inviteMessage').innerHTML=
      d.email_sent
        ? 'Invitation created and email sent.'
        : `Invitation created. <button type="button" id="copyFreshInvite" class="secondary">Copy activation link</button>`;

    const copy=$('#copyFreshInvite');
    if(copy)copy.onclick=async()=>{
      await navigator.clipboard.writeText(link);
      copy.textContent='✓ Copied';
    };

    e.target.reset();
    refreshInviteControls();
    await load();
  }catch(err){
    $('#inviteMessage').textContent=err.message;
  }
};
$('#creativeRequest').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  await api('/api/admin/creative-jobs',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(Object.fromEntries(f))
  });
  e.target.reset();
  await load();
};

$('#upload').onsubmit=async e=>{ e.preventDefault(); try { await api('/api/admin/media',{method:'POST',body:new FormData(e.target)}); e.target.reset(); await load(); } catch(err){ $('#error').textContent=err.message; } };

const mediaPreviewDialog=$('#mediaPreviewDialog');
const mediaPreviewStage=$('#mediaPreviewStage');
$('#mediaPreviewClose').onclick=()=>{
  mediaPreviewStage.innerHTML='';
  if(mediaPreviewDialog.open) mediaPreviewDialog.close();
};
mediaPreviewDialog.addEventListener('close',()=>{ mediaPreviewStage.innerHTML=''; });
mediaPreviewDialog.addEventListener('click',e=>{
  if(e.target===mediaPreviewDialog){
    mediaPreviewStage.innerHTML='';
    mediaPreviewDialog.close();
  }
});
$('#newPlaylist').onsubmit=async e=>{ e.preventDefault(); const name=new FormData(e.target).get('name'); try { await api('/api/admin/playlists',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})}); e.target.reset(); await load(); } catch(err){ $('#error').textContent=err.message; } };

$('#pairScreen').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const message=$('#pairMessage');
  message.textContent='Pairing…';
  try{
    await api('/api/admin/screens/pair',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        pair_code:String(f.get('pair_code')||'').trim().toUpperCase(),
        name:String(f.get('name')||'').trim(),
        location_id:f.get('location_id')||null,
        playlist_id:f.get('playlist_id')||null,
        is_test:f.get('is_test')==='on',
        deployment_class:f.get('deployment_class')||'unreviewed',
        certification_note:String(f.get('certification_note')||'').trim()
      })
    });
    e.target.reset();
    message.textContent='✓ Screen paired. The TV will activate automatically.';
    await load();
  }catch(err){
    message.textContent=err.message;
  }
};


async function relaunchRoku(ip, button){
  const url=`http://${ip}:8060/launch/dev`;
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Launching…';

  try{
    await fetch(url,{
      method:'POST',
      mode:'no-cors',
      cache:'no-store'
    });
    button.textContent='✓ Sent';
    setTimeout(()=>{button.textContent=original;button.disabled=false},1400);
    return;
  }catch(firstError){
    try{
      let frame=document.querySelector('#rokuControlSink');
      if(!frame){
        frame=document.createElement('iframe');
        frame.id='rokuControlSink';
        frame.name='rokuControlSink';
        frame.style.display='none';
        document.body.appendChild(frame);
      }

      const form=document.createElement('form');
      form.method='POST';
      form.action=url;
      form.target='rokuControlSink';
      form.style.display='none';
      document.body.appendChild(form);
      form.submit();
      setTimeout(()=>form.remove(),1000);

      button.textContent='✓ Sent';
      setTimeout(()=>{button.textContent=original;button.disabled=false},1400);
      return;
    }catch(secondError){
      button.textContent='Failed';
      button.disabled=false;
      $('#error').textContent=`Could not reach Roku at ${ip}. Admin device must be on the same LAN.`;
    }
  }
}

document.addEventListener('click', async e=>{
  if(e.target.matches('.copy-invite')){
    await navigator.clipboard.writeText(e.target.dataset.link);
    e.target.textContent='✓ Copied';
    setTimeout(()=>e.target.textContent='Copy activation link',1200);
    return;
  }

  if(e.target.matches('.campaign-state')){
    const id=e.target.dataset.campaign;
    const status=e.target.dataset.status;
    if(!id||!status)return;
    if((status==='completed'||status==='canceled') &&
       !confirm(`Mark this campaign ${status}? Delivery will stop.`)) return;
    e.target.disabled=true;
    try{
      await api(`/api/admin/campaigns/${id}/status`,{
        method:'PUT',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({status})
      });
      await load();
    }catch(err){
      $('#error').textContent=err.message;
      e.target.disabled=false;
    }
    return;
  }

  if(e.target.matches('.revoke-invite')){
    const box=e.target.closest('[data-invite]');
    await api(`/api/admin/invitations/${box.dataset.invite}`,{method:'DELETE'});
    await load();
    return;
  }

  if(e.target.matches('.u-internal')){
    const row=e.target.closest('tr');
    row.querySelector('.broker-rate')?.classList.toggle('is-hidden',e.target.value!=='broker');
    return;
  }

  if(e.target.matches('.u-business')){
    const row=e.target.closest('tr');
    const role=row.querySelector(`.u-business-role[data-business="${e.target.dataset.business}"]`);
    if(role)role.disabled=!e.target.checked;
    return;
  }

  if(e.target.matches('.save-user-access')){
    const row=e.target.closest('tr');
    const businesses=[...row.querySelectorAll('.u-business:checked')].map(cb=>({
      business_id:cb.dataset.business,
      role:row.querySelector(`.u-business-role[data-business="${cb.dataset.business}"]`).value
    }));

    await api(`/api/admin/users/${row.dataset.user}/access`,{
      method:'PUT',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        internal_role:row.querySelector('.u-internal').value||null,
        broker_commission_percent:Number(row.querySelector('.u-broker-rate')?.value||0),
        businesses
      })
    });

    e.target.textContent='✓ Saved';
    await load();
    return;
  }

  if(e.target.matches('.relaunch-screen')){
    await relaunchRoku(e.target.dataset.ip,e.target);
    return;
  }

  if(e.target.matches('.promote-prospect')){
    const row=e.target.closest('tr');
    e.target.disabled=true;
    try{
      await api(`/api/admin/prospects/${row.dataset.id}/promote`,{method:'POST'});
      await load();
    }catch(err){
      $('#error').textContent=err.message;
      e.target.disabled=false;
    }
  }
  if(e.target.matches('.save-prospect')){
    const row=e.target.closest('tr');
    const follow=row.querySelector('.p-follow').value;
    await api(`/api/admin/prospects/${row.dataset.id}`,{
      method:'PUT',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        stage:row.querySelector('.p-stage').value,
        score:row.querySelector('.p-score').value || 0,
        broker_user_id:row.querySelector('.p-broker')?.value||null,
        host_annual_pay_cents:Math.round(Number(row.querySelector('.p-host-pay')?.value||0)*100),
        next_follow_up_at:follow ? new Date(follow).toISOString() : null
      })
    });
    await load();
  }
  if(e.target.matches('.reset-pairing')){
    const row=e.target.closest('tr');
    if(!confirm('Reset this TEST screen to an unpaired state? The TV will receive a new pairing code on its next boot request.')) return;
    await api(`/api/admin/screens/${row.dataset.id}/reset-pairing`,{method:'POST'});
    await load();
    return;
  }

  if(e.target.matches('.save-screen')){
    const row=e.target.closest('tr');
    await api(`/api/admin/screens/${row.dataset.id}/assign`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({
        name:row.querySelector('.s-name').value,
        location_id:row.querySelector('.s-location').value||null,
        playlist_id:row.querySelector('.s-playlist').value||null,
        is_test:row.querySelector('.s-test').checked,
        deployment_class:row.querySelector('.s-deployment').value,
        certification_note:row.querySelector('.s-cert-note').value,
        host_annual_pay_cents:Math.round(Number(row.querySelector('.s-host-pay').value||0)*100),
        hardware_cost_cents:Math.round(Number(row.querySelector('.s-hardware').value||0)*100),
        setup_cost_cents:Math.round(Number(row.querySelector('.s-setup').value||0)*100)
      })});
    await load();
  }
  const previewTrigger=e.target.closest?.('[data-preview-media]');
  if(previewTrigger && !e.target.closest('video')){
    const id=previewTrigger.dataset.previewMedia;
    const media=state.media.find(x=>x.id===id);
    if(media){
      const dialog=$('#mediaPreviewDialog');
      const stage=$('#mediaPreviewStage');
      const title=media.name||media.title||'Media preview';
      const mediaType=String(media.mime_type||media.media_type||media.kind||'').toLowerCase();
      const isVideo=mediaType.includes('video') || String(media.original_filename||media.name||'').toLowerCase().endsWith('.mp4');
      const url=`/media/${encodeURIComponent(media.id)}`;
      $('#mediaPreviewTitle').textContent=title;
      $('#mediaPreviewMeta').textContent=[
        media.media_type||media.kind||media.mime_type||'media',
        media.duration_seconds ? `${media.duration_seconds}s` : '',
        media.approval_status||'pending'
      ].filter(Boolean).join(' · ');
      stage.innerHTML=isVideo
        ? `<video src="${url}" controls autoplay playsinline preload="metadata"></video>`
        : `<img src="${url}" alt="${esc(title)}">`;
      if(typeof dialog.showModal==='function') dialog.showModal();
      else dialog.setAttribute('open','');
    }
    return;
  }

  if(e.target.matches('.approve-media')){
    const id=e.target.dataset.media;
    await api(`/api/admin/media/${encodeURIComponent(id)}/approval`,{
      method:'PUT',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({approval_status:'approved'})
    });
    await load();
    return;
  }

  if(e.target.matches('.reject-media')){
    const id=e.target.dataset.media;
    const reason=window.prompt('Why is this creative rejected?');
    if(reason===null) return;
    if(!reason.trim()){
      $('#error').textContent='Rejection reason is required.';
      return;
    }
    await api(`/api/admin/media/${encodeURIComponent(id)}/approval`,{
      method:'PUT',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        approval_status:'rejected',
        rejection_reason:reason.trim()
      })
    });
    await load();
    return;
  }

  if(e.target.matches('.reset-media-review')){
    const id=e.target.dataset.media;
    await api(`/api/admin/media/${encodeURIComponent(id)}/approval`,{
      method:'PUT',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({approval_status:'pending'})
    });
    await load();
    return;
  }

  if(e.target.matches('.add-media')){
    const box=e.target.closest('.playlist'), p=state.playlists.find(x=>x.id===box.dataset.id), mediaId=box.querySelector('.media-picker').value, campaignId=box.querySelector('.campaign-picker').value;
    if(!mediaId) return;

    const media=state.media.find(x=>x.id===mediaId);
    const campaign=campaignId ? state.campaigns.find(x=>x.id===campaignId) : null;

    if(campaignId){
      if(media?.approval_status!=='approved'){
        $('#error').textContent='Approve this creative before assigning it to a campaign.';
        return;
      }
      if(!media?.advertiser_business_id){
        $('#error').textContent='Campaign creative must be assigned to an advertiser.';
        return;
      }
      if(media.advertiser_business_id!==campaign?.advertiser_business_id){
        $('#error').textContent='Creative advertiser does not match campaign advertiser.';
        return;
      }
    }else if(media?.advertiser_business_id){
      $('#error').textContent='Advertiser creative must be attached to a campaign.';
      return;
    }
    const items=[
      ...(p.items||[]).map(i=>({media_id:i.media_id,duration_seconds:i.duration_seconds,campaign_id:i.campaign_id||null})),
      {media_id:mediaId,campaign_id:campaignId||null}
    ];
    await api(`/api/admin/playlists/${p.id}/items`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({items})}); await load();
  }
  if(e.target.matches('.remove-item')){
    const box=e.target.closest('.playlist'), p=state.playlists.find(x=>x.id===box.dataset.id), targetItem=e.target.dataset.item;
    const items=(p.items||[]).filter(i=>i.id!==targetItem).map(i=>({
      media_id:i.media_id,
      duration_seconds:i.duration_seconds,
      campaign_id:i.campaign_id||null
    }));
    await api(`/api/admin/playlists/${p.id}/items`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({items})}); await load();
  }
});

load();

let adminRefreshTimer=setInterval(()=>{
  if(!document.hidden) load();
},120000);

document.addEventListener("visibilitychange",()=>{
  if(!document.hidden) load();
});


$('#routeHot').onclick=routeProspects;

$('#useLocation').onclick=()=>{
  const msg=$('#prospectMessage');
  if(!navigator.geolocation){
    msg.textContent='Location is not available in this browser.';
    return;
  }
  msg.textContent='Getting location…';
  navigator.geolocation.getCurrentPosition(pos=>{
    const form=$('#newProspect');
    form.elements.latitude.value=pos.coords.latitude;
    form.elements.longitude.value=pos.coords.longitude;
    msg.textContent='Current location attached.';
  },()=>{ msg.textContent='Could not access your location.'; },{
    enableHighAccuracy:true,timeout:10000,maximumAge:30000
  });
};

$('#newProspect').onsubmit=async e=>{
  e.preventDefault();
  const form=e.target;
  const fd=new FormData(form);
  const body=Object.fromEntries(fd.entries());
  body.advertiser_interest=form.elements.advertiser_interest.checked;
  body.host_interest=form.elements.host_interest.checked;
  body.host_annual_pay_cents=Math.round(Number(body.host_annual_pay_dollars||0)*100);
  delete body.host_annual_pay_dollars;

  try{
    $('#prospectMessage').textContent='Saving…';
    await api('/api/admin/prospects',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(body)
    });
    form.reset();
    form.elements.city.value='North Myrtle Beach';
    form.elements.state.value='SC';
    form.elements.advertiser_interest.checked=true;
    $('#prospectMessage').textContent='Prospect added.';
    await load();
  }catch(err){
    $('#prospectMessage').textContent=err.message;
  }
};


$('#newCampaign').onsubmit=async e=>{
  e.preventDefault();
  const f=e.target;
  const fd=new FormData(f);
  const dollars=fd.get('price_dollars');
  const body={
    advertiser_business_id:fd.get('advertiser_business_id'),
    name:fd.get('name'),
    status:fd.get('status'),
    price_cents:dollars===''?null:Math.round(Number(dollars)*100),
    starts_at:fd.get('starts_at')?new Date(fd.get('starts_at')).toISOString():null,
    ends_at:fd.get('ends_at')?new Date(fd.get('ends_at')).toISOString():null
  };
  try{
    await api('/api/admin/campaigns',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(body)
    });
    f.reset();
    await load();
  }catch(err){
    $('#error').textContent=err.message;
  }
};




document.addEventListener('click', async e=>{
  try{
    const locationButton=e.target.closest('.save-location-schedule');
    if(locationButton){
      const box=locationButton.closest('.schedule-location');
      locationButton.disabled=true;
      await api(`/api/admin/locations/${encodeURIComponent(box.dataset.location)}/schedule`,{
        method:'PUT',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          timezone:box.querySelector('.schedule-timezone').value.trim(),
          operating_hours:parseScheduleText(box.querySelector('.schedule-hours').value)
        })
      });
      await load();
      return;
    }

    const campaignButton=e.target.closest('.save-campaign-dayparts');
    if(campaignButton){
      const box=campaignButton.closest('.schedule-campaign');
      campaignButton.disabled=true;
      await api(`/api/admin/campaigns/${encodeURIComponent(box.dataset.campaign)}/delivery`,{
        method:'PATCH',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          dayparts:parseScheduleText(box.querySelector('.schedule-dayparts').value)
        })
      });
      await load();
    }
  }catch(err){
    $('#error').textContent=err.message;
  }
});

document.addEventListener('click', async e=>{
  const btn=e.target.closest('.save-campaign-delivery');
  if(!btn) return;

  const id=btn.dataset.campaign;
  const start=document.querySelector(`.campaign-delivery-start[data-campaign="${id}"]`)?.value||'';
  const end=document.querySelector(`.campaign-delivery-end[data-campaign="${id}"]`)?.value||'';
  const target=document.querySelector(`.campaign-delivery-target[data-campaign="${id}"]`)?.value||'';
  const makegood=document.querySelector(`.campaign-delivery-makegood[data-campaign="${id}"]`)?.value||'0';

  btn.disabled=true;
  try{
    await api(`/api/admin/campaigns/${encodeURIComponent(id)}/delivery`,{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        starts_at:start ? new Date(start).toISOString() : null,
        ends_at:end ? new Date(end).toISOString() : null,
        delivery_target_plays:target==='' ? null : Number(target),
        makegood_plays:Number(makegood||0)
      })
    });
    await load();
  }catch(err){
    $('#error').textContent=err.message;
    btn.disabled=false;
  }
});

document.addEventListener('click', e=>{
  const btn=e.target.closest('.view-report');
  if(!btn) return;
  const id=btn.dataset.campaign;
  if(id) window.open(`/report.html?campaign=${encodeURIComponent(id)}`,'_blank','noopener');
});

$('#downloadCampaignReport').onclick=()=>{
  const rows=[[
    'Advertiser','Campaign','Status','Price','Plays','Screens',
    'Target Plays','Makegood Plays','Delivery Goal','Remaining Plays',
    'Delivery Percent','Pace Percent','Delivery Health',
    'Seconds Delivered','First Play','Last Play'
  ]];

  state.campaignReports.forEach(r=>{
    rows.push([
      r.advertiser_name||'',
      r.campaign_name||'',
      r.status||'',
      r.price_cents==null ? '' : (Number(r.price_cents)/100).toFixed(2),
      r.plays||0,
      r.screen_count||0,
      r.delivery_target_plays==null ? '' : r.delivery_target_plays,
      r.makegood_plays||0,
      r.delivery_goal_plays==null ? '' : r.delivery_goal_plays,
      r.remaining_plays==null ? '' : r.remaining_plays,
      r.delivery_percent==null ? '' : r.delivery_percent,
      r.pace_percent==null ? '' : r.pace_percent,
      r.delivery_health||'',
      Number(r.seconds_played||0).toFixed(1),
      r.first_played_at||'',
      r.last_played_at||''
    ]);
  });

  const csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`coastloop-campaign-report-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};


document.addEventListener('click',async e=>{
  const saveZonesButton=e.target?.closest?.('[data-save-package-zones]');
  if(!saveZonesButton) return;

  e.preventDefault();
  const packageId=saveZonesButton.dataset.savePackageZones;
  const selected=[...document.querySelectorAll(
    `[data-package-zone-choice="${CSS.escape(packageId)}"]:checked`
  )].map(input=>({zone_id:input.value,delivery_weight:1}));

  saveZonesButton.disabled=true;
  try{
    await api(`/api/admin/onboarding/packages/${encodeURIComponent(packageId)}/zones`,{
      method:'PUT',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({zones:selected})
    });
    await hydratePackageZoneEditors();
  }catch(error){
    alert(error.message||'Could not save package Zones');
  }finally{
    saveZonesButton.disabled=false;
  }
});

document.addEventListener('submit',async e=>{
  if(e.target?.id==='packageCreateForm'){
    e.preventDefault();
    const f=new FormData(e.target);
    const payload={
      name:f.get('name'),
      package_key:f.get('package_key'),
      version:Number(f.get('version')),
      price_cents:Number(f.get('price_cents')),
      market:f.get('market'),
      coverage_mode:String(f.get('coverage_mode')||'legacy'),
      term_days:f.get('term_days')?Number(f.get('term_days')):null,
      ad_length_seconds:f.get('ad_length_seconds')?Number(f.get('ad_length_seconds')):15,
      frequency_label:f.get('frequency_label'),
      screen_count:f.get('screen_count')?Number(f.get('screen_count')):null,
      projected_plays:f.get('projected_plays')?Number(f.get('projected_plays')):null,
      projection_period_days:f.get('projection_period_days')?Number(f.get('projection_period_days')):null
    };
    await api('/api/admin/onboarding/packages',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
    });
    await load();
  }

  if(e.target?.id==='venueInviteForm'){
    e.preventDefault();
    const f=new FormData(e.target);
    const compType=String(f.get('host_compensation_type')||'waived');
    const comp=Number(f.get('host_compensation_cents')||0);
    const compTerms=String(f.get('compensation_schedule')||'').trim();
    const hostCompensation=
      compType==='cash'
        ? {type:'cash',amount_cents:Math.max(0,comp)}
        : compType==='other'
          ? {type:'other',description:compTerms||'As agreed'}
          : {type:'waived',amount_cents:0};
    const payload={
      business_id:f.get('business_id'),
      location_id:f.get('location_id'),
      organization_legal_name:f.get('organization_legal_name'),
      signer_name:f.get('signer_name'),
      signer_title:f.get('signer_title'),
      signer_email:f.get('signer_email'),
      signer_mobile:f.get('signer_mobile'),
      term_type:f.get('term_type'),
      house_inventory:f.get('house_inventory'),
      host_compensation:hostCompensation,
      compensation_schedule:compType==='cash'
        ? (compTerms||'As agreed')
        : (compType==='other'?compTerms:null),
      equipment_network_responsibility:f.get('equipment_network_responsibility'),
      category_exclusions:f.get('category_exclusions'),
      public_venue_listing:f.get('public_venue_listing')==='on',
      venue_photo_permission:f.get('venue_photo_permission')==='on',
      preview:f.get('preview')==='on',
      placements:[{
        zone_label:f.get('zone_label'),
        screen_label:f.get('screen_label'),
        screen_count:Number(f.get('screen_count')||1),
        operating_mode:f.get('operating_mode'),
        operating_schedule:{label:f.get('schedule_label')||'As agreed'}
      }]
    };
    const result=await api('/api/admin/onboarding/venue-invites',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
    });
    const out=document.querySelector('#venueInviteResult');
    if(out) out.innerHTML=`<strong>${result.preview_only?'Preview link':'Approval link'}:</strong> <a href="${result.url}" target="_blank" rel="noopener">${result.url}</a>`;
    await load();
  }
});




function workspaceMetricData(key){
  const screens=(state.screens||[]).filter(isCommercialScreen);
  const campaigns=state.campaigns||[];
  const media=state.media||[];
  const prospects=state.prospects||[];
  const tasks=state.tasks||[];

  const openTasks=tasks.filter(x=>
    x.status==='open'||x.status==='in_progress');

  const pendingMedia=media.filter(x=>{
    const v=String(
      x.approval_status||x.status||''
    ).toLowerCase();
    return v==='pending'||v==='review';
  });

  const activeCampaigns=campaigns.filter(
    x=>x.status==='active');

  const openProspects=prospects.filter(x=>
    !['won','lost','closed'].includes(
      String(x.status||'').toLowerCase()));

  const sets={
    network:[
      [screens.filter(x=>online(x.last_seen_at)).length,
       'Online','commercial screens'],
      [screens.length,'Screens','commercial network'],
      [screens.filter(x=>!online(x.last_seen_at)).length,
       'Offline','needs review'],
      [(state.playlists||[]).length,
       'Playlists','available rotations']
    ],
    sales:[
      [activeCampaigns.length,
       'Active campaigns','delivering now'],
      [campaigns.length,
       'Campaigns','all statuses'],
      [openProspects.length,
       'Open prospects','sales pipeline'],
      [openTasks.length,
       'Open tasks','follow-up queue']
    ],
    creative:[
      [media.length,
       'Media assets','library'],
      [pendingMedia.length,
       'Pending review','approval queue'],
      [activeCampaigns.length,
       'Live campaigns','using creative'],
      [(state.playlists||[]).length,
       'Playlists','delivery rotations']
    ],
    finance:[
      [(state.invoices||state.billingInvoices||[]).length,
       'Invoices','billing records'],
      [activeCampaigns.length,
       'Active accounts','campaign proxy'],
      [(state.brokers||[]).length,
       'Brokers','sales channel'],
      [openTasks.length,
       'Open items','operations']
    ],
    people:[
      [(state.users||state.members||[]).length,
       'Users','platform access'],
      [(state.brokers||[]).length,
       'Brokers','sales access'],
      [(state.businesses||[]).length,
       'Businesses','organizations'],
      [openTasks.length,
       'Open tasks','team queue']
    ],
    system:[
      [screens.filter(x=>online(x.last_seen_at)).length,
       'Online','screen heartbeat'],
      [screens.length,
       'Screens','registered commercial'],
      [openTasks.length,
       'Open tasks','operational queue'],
      [media.length,
       'Media','stored assets']
    ]
  };

  return sets[key]||[];
}

function renderWorkspaceMetrics(){
  document.querySelectorAll(
    '.workspace-metrics[data-metric-workspace]'
  ).forEach(box=>{
    const key=box.dataset.metricWorkspace;
    box.innerHTML=workspaceMetricData(key).map(x=>`
      <div class="workspace-metric">
        <strong>${esc(String(x[0]))}</strong>
        <span>${esc(x[1])}</span>
        <small>${esc(x[2])}</small>
      </div>`).join('');
  });
}
function enhanceAdminWorkspace(key,nodes){
  const labels={
    network:[
      'NETWORK OPERATIONS',
      'Hosts & Screens',
      'Venues, screens, pairing, playlists and delivery health.'
    ],
    sales:[
      'REVENUE ENGINE',
      'Advertisers',
      'Prospects, orders, campaigns and delivery.'
    ],
    creative:[
      'CONTENT OPERATIONS',
      'Creative',
      'Media library, approvals and campaign-ready assets.'
    ],
    finance:[
      'MONEY',
      'Finance',
      'Billing, invoices, compensation and commissions.'
    ],
    people:[
      'ACCESS',
      'People',
      'Accounts, invitations, roles and permissions.'
    ],
    system:[
      'OPERATIONS',
      'System',
      'Pairing tools, audit history and diagnostics.'
    ]
  };

  if(key==='today'||!labels[key]||!nodes.length)return;
  if(nodes.some(n=>n.classList &&
    n.classList.contains('workspace-banner')))return;

  const d=labels[key];
  const banner=document.createElement('section');
  banner.className='workspace-banner';
  banner.dataset.workspaceOwner=key;
  banner.innerHTML=`
    <div>
      <div class="eyebrow">${d[0]}</div>
      <h1>${d[1]}</h1>
      <p>${d[2]}</p>
    </div>
    <div class="workspace-tools">
      <span class="status-chip">Live workspace</span>
    </div>`;

  nodes[0].insertAdjacentElement('afterend',banner);
  nodes.splice(1,0,banner);
  const metrics=document.createElement('div');
  metrics.className='workspace-metrics';
  metrics.dataset.metricWorkspace=key;
  banner.insertAdjacentElement('afterend',metrics);
  nodes.splice(2,0,metrics);
  renderWorkspaceMetrics();
}

function organizeAdminActions(){
  const formLabels={
    pairScreen:[
      'Pair a screen',
      'Connect a TV using its six-character code.'
    ],
    newPlaylist:[
      'Create playlist',
      'Build a new playback rotation.'
    ],
    upload:[
      'Upload media',
      'Add an image or video to the library.'
    ],
    inviteUser:[
      'Invite person',
      'Create access for a team member or broker.'
    ],
    newBillingInvoice:[
      'Create invoice',
      'Prepare a billing action for an advertiser.'
    ]
  };

  document.querySelectorAll('.card form').forEach(form=>{
    const card=form.closest('.card');
    if(!card||card.dataset.actionOrganized==='1')return;

    const info=formLabels[form.id];
    const heading=card.querySelector('h2,h3');
    const title=info?.[0] ||
      heading?.textContent?.trim() ||
      'Manage';

    const desc=info?.[1] ||
      card.querySelector('.muted')?.textContent?.trim() ||
      'Open controls';

    card.dataset.actionOrganized='1';
    card.classList.add('admin-action-card','admin-action-collapsed');

    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='admin-action-toggle';
    toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML=`
      <span class="admin-action-toggle-copy">
        <strong>${esc(title)}</strong>
        <small>${esc(desc)}</small>
      </span>
      <span class="admin-action-chevron">⌄</span>`;

    // Hide duplicate heading text once the compact action header exists.
    if(heading)heading.style.display='none';

    card.insertBefore(toggle,card.firstChild);

    toggle.addEventListener('click',()=>{
      const closed=card.classList.toggle('admin-action-collapsed');
      toggle.setAttribute('aria-expanded',String(!closed));
    });
  });

  // Group adjacent compact action cards so controls read as a toolbar,
  // rather than a stack of giant forms.
  document.querySelectorAll('.admin-anchor[data-workspace]')
    .forEach(anchor=>{
      const key=anchor.dataset.workspace;
      if(key==='today')return;

      let n=anchor.nextElementSibling;
      const stop=document.querySelector(
        `.admin-anchor[data-workspace]:not(#${key})`
      );

      const cards=[];
      while(n && n!==stop){
        if(n.matches?.('.admin-action-card'))cards.push(n);
        n=n.nextElementSibling;
      }

      if(cards.length<2)return;
      const first=cards[0];
      if(first.parentElement?.classList.contains(
        'admin-section-actions'))return;

      const group=document.createElement('div');
      group.className='admin-section-actions';
      first.parentNode.insertBefore(group,first);
      cards.forEach(card=>group.appendChild(card));
    });
}

function improveAdminEmptyStates(){
  document.querySelectorAll(
    '.command-empty'
  ).forEach(el=>{
    el.classList.add('admin-empty-state');
  });
}

function applyAdminWorkspaceOwnership(groups){
  const byId=id=>document.getElementById(id);
  const sectionOf=id=>byId(id)?.closest('section')||null;

  const ownership={
    network:[
      sectionOf('opsCommandCenter'),
      sectionOf('pairScreen'),
      sectionOf('screens'),
      sectionOf('scheduling')
    ],
    geography:[
      sectionOf('prospectMap')
    ],
    sales:[
      sectionOf('newProspect'),
      sectionOf('prospects'),
      sectionOf('businesses'),
      sectionOf('campaigns')
    ],
    creative:[
      sectionOf('upload'),
      sectionOf('newPlaylist')
    ],
    finance:[
      sectionOf('fRevenue'),
      sectionOf('fInvoiced'),
      sectionOf('newBillingInvoice')
    ],
    people:[
      sectionOf('inviteUser'),
      sectionOf('digitalOnboarding')
    ],
    system:[
      sectionOf('auditEvents')
    ]
  };

  const howItWorks=[...document.querySelectorAll('section')]
    .find(section=>
      section.querySelector('h2')?.textContent?.trim()===
      'How CoastLoop works'
    );

  if(howItWorks)ownership.system.push(howItWorks);

  const assigned=new Set();

  for(const [key,nodes] of Object.entries(ownership)){
    const clean=[...new Set(nodes.filter(Boolean))];
    groups[key]=clean;
    clean.forEach(node=>{
      node.dataset.workspaceOwner=key;
      assigned.add(node);
    });
  }

  // Keep Today limited to its command-center overview cards.
  // Any explicitly owned operational section is removed from
  // historical anchor-based membership.
  if(groups.today){
    groups.today=groups.today.filter(node=>!assigned.has(node));
  }

  return groups;
}
function initAdminSidebar(){
  const nav=document.querySelector('.admin-nav');
  organizeAdminActions();
  improveAdminEmptyStates();
  if(!nav)return;

  const labels={
    today:['Today','Your CoastLoop command center'],
    network:['Hosts & Screens','Locations, screens, pairing and playback'],
    geography:['Geography','Markets, Zones, boundaries and inventory'],
    sales:['Advertisers','Prospects, orders, campaigns and delivery'],
    creative:['Creative','Media library, approvals and campaign assets'],
    finance:['Finance','Billing, invoices, compensation and commissions'],
    people:['People','Accounts, invitations, roles and access'],
    system:['System','Operational tools, audit and diagnostics']
  };

  const links=[...nav.querySelectorAll('a[href^="#"]')]
    .filter(a=>labels[a.getAttribute('href').slice(1)]);

  const boundaries=[...document.querySelectorAll(
    '.admin-anchor[data-workspace]'
  )];

  // Each workspace owns everything from its boundary until the next
  // top-level boundary. Nodes are preserved; only visibility changes.
  const groups={};
  boundaries.forEach((anchor,i)=>{
    const key=anchor.dataset.workspace;
    const next=boundaries[i+1]||null;
    const nodes=[];
    let n=anchor;
    while(n && n!==next){
      nodes.push(n);
      n=n.nextElementSibling;
    }
    groups[key]=nodes;
    enhanceAdminWorkspace(key,nodes);
  });

  function badge(link,key){
    let value='';
    if(key==='network'){
      value=(state.screens||[]).filter(isCommercialScreen).length;
    }else if(key==='sales'){
      value=(state.campaigns||[]).filter(x=>x.status==='active').length;
    }else if(key==='creative'){
      value=(state.media||[]).filter(x=>
        x.approval_status==='pending'||x.status==='pending').length;
    }else if(key==='people'){
      value=(state.users||state.members||[]).length||'';
    }
    let b=link.querySelector('.nav-badge');
    if(value!==''&&value!==0){
      if(!b){
        b=document.createElement('span');
        b.className='nav-badge';
        link.appendChild(b);
      }
      b.textContent=value;
    }else if(b){
      b.remove();
    }
  }

  function show(key,push=true){
    if(!groups[key])key='today';

    document.body.classList.add('admin-workspace-mode');

      applyAdminWorkspaceOwnership(groups);
Object.entries(groups).forEach(([name,nodes])=>{
      nodes.forEach(node=>{
        node.classList.toggle('admin-workspace-hidden',name!==key);
      });
    });

    if(key==='geography'){
      requestAnimationFrame(()=>{
        renderProspectMap();
        requestAnimationFrame(()=>{
          if(!prospectMap) return;
          prospectMap.invalidateSize();
          constrainMapToGeography();
          fitGeographyContext();
        });
      });
    }

    links.forEach(a=>{
      const active=a.getAttribute('href')==='#'+key;
      a.classList.toggle('admin-nav-active',active);
      a.setAttribute('aria-current',active?'page':'false');
      badge(a,a.getAttribute('href').slice(1));
    });

    if(push && location.hash!=='#'+key){
      history.replaceState(null,'','#'+key);
    }

    // The sidebar changes which workspace is visible. Scroll to the
    // actual visible workspace content, not the document top. Several
    // workspace anchors remain at their historical HTML positions, so
    // relying on the anchor itself can land in the wrong area.
    const visibleNodes=(groups[key]||[]).filter(node=>
      node &&
      node.nodeType===1 &&
      !node.classList.contains('admin-workspace-hidden')
    );

    const target=
      visibleNodes.find(node=>
        node.classList.contains('workspace-banner')
      ) ||
      visibleNodes.find(node=>
        !node.classList.contains('admin-anchor')
      ) ||
      document.getElementById(key);

    if(target){
      target.scrollIntoView({
        behavior:'instant',
        block:'start'
      });
    }else{
      window.scrollTo({top:0,behavior:'instant'});
    }
  }

  links.forEach(a=>{
    a.addEventListener('click',e=>{
      e.preventDefault();
      show(a.getAttribute('href').slice(1));
    });
  });

  // Command-center deep links open the appropriate workspace rather
  // than attempting to scroll through hidden content.
  document.querySelectorAll(
    '.command-grid a[href^="#"]'
  ).forEach(a=>{
    a.addEventListener('click',e=>{
      const raw=a.getAttribute('href').slice(1);
      const route={
        screens:'network',
        campaigns:'sales',
        operations:'system'
      }[raw]||raw;
      if(groups[route]){
        e.preventDefault();
        show(route);
      }
    });
  });

  const requested=location.hash.slice(1);
  const route={
    screens:'network',
    campaigns:'sales',
    operations:'system'
  }[requested]||requested;

  show(groups[route]?route:'today',false);

  window.addEventListener('hashchange',()=>{
    const raw=location.hash.slice(1);
    const key={
      screens:'network',
      campaigns:'sales',
      operations:'system'
    }[raw]||raw;
    if(groups[key])show(key,false);
  });

  window.refreshAdminSidebar=()=>{
    links.forEach(a=>badge(a,a.getAttribute('href').slice(1)));
  };
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initAdminSidebar);
}else{
  initAdminSidebar();
}

async function loadPlatformTermsAdmin(){
  const box=document.getElementById("platformTermsCurrent");
  if(!box) return;
  try{
    const data=await api("/api/admin/legal/terms");
    const current=(data.terms||[]).find(x=>x.status==="published");
    box.innerHTML=current
      ? `<strong>${esc(current.title)}</strong> · v${current.version} · published`
      : "No platform terms are currently published.";
  }catch(err){
    box.textContent=`Terms status unavailable: ${err.message}`;
  }
}

function initPlatformTermsAdmin(){
  const form=document.getElementById("publishPlatformTerms");
  if(!form || form.dataset.bound==="1") return;
  form.dataset.bound="1";

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const button=form.querySelector('button[type="submit"]');
    if(button) button.disabled=true;
    try{
      const data=new FormData(form);
      let res;
      if(state.token){
        res=await fetch("/api/admin/legal/terms",{
          method:"POST",
          headers:{authorization:`Bearer ${state.token}`},
          body:data
        });
      }else{
        res=await sessionApi("/api/admin/legal/terms",{
          method:"POST",
          body:data
        });
      }
      const out=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(out.error||`${res.status}`);
      form.reset();
      await loadPlatformTermsAdmin();
      alert(`Terms v${out.terms.version} published. Re-acceptance is now required.`);
    }catch(err){
      alert(`Could not publish terms: ${err.message}`);
    }finally{
      if(button) button.disabled=false;
    }
  });

  loadPlatformTermsAdmin();
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",initPlatformTermsAdmin);
}else{
  initPlatformTermsAdmin();
}

document.querySelectorAll('.admin-nav .cl-side-link').forEach(link=>{
  link.addEventListener('click',()=>{
    document.querySelectorAll('.admin-nav .cl-side-link').forEach(x=>x.classList.remove('is-active'));
    link.classList.add('is-active');
  });
});




const creativeStudioTabs=$('#creativeStudioTabs');
if(creativeStudioTabs){
  creativeStudioTabs.addEventListener('click',e=>{
    const tab=e.target.closest('[data-creative-filter]');
    if(!tab) return;
    creativeStudioFilter=tab.dataset.creativeFilter||'review';
    renderCreativeStudio();
  });
}

const creativeJobsPanel=$('#creativeJobs');
if(creativeJobsPanel){
  creativeJobsPanel.addEventListener('click',async e=>{
    const preview=e.target.closest('.creative-open-preview');
    if(preview){
      const dialog=$('#creativeStudioPreviewDialog');
      const stage=$('#creativeStudioPreviewStage');
      const title=$('#creativeStudioPreviewTitle');
      const asset=preview.dataset.asset;
      const kind=preview.dataset.kind||'image';

      if(title) title.textContent=preview.dataset.title||'Creative preview';

      if(stage && asset){
        stage.innerHTML=kind==='video'
          ? `<video src="/media/${encodeURIComponent(asset)}" controls autoplay muted playsinline></video>`
          : `<img src="/media/${encodeURIComponent(asset)}" alt="CoastLoop creative preview">`;
      }

      if(dialog){
        if(typeof dialog.showModal==='function') dialog.showModal();
        else dialog.setAttribute('open','');
      }
      return;
    }

    const refine=e.target.closest('.creative-internal-refine');
    if(refine){
      const form=creativeJobsPanel.querySelector(
        `.creative-internal-revision-form[data-job="${CSS.escape(refine.dataset.job||'')}"]`
      );
      if(form){
        form.hidden=false;
        form.querySelector('textarea')?.focus();
      }
      return;
    }

    const cancel=e.target.closest('.creative-internal-cancel');
    if(cancel){
      const form=cancel.closest('.creative-internal-revision-form');
      if(form){
        form.reset();
        form.hidden=true;
      }
      return;
    }

    const button=e.target.closest('.creative-release-client');
    if(!button) return;

    const jobId=button.dataset.job;
    if(!jobId) return;

    const ok=confirm(
      'Release this exact creative revision to the client for approval?'
    );
    if(!ok) return;

    const original=button.textContent;
    button.disabled=true;
    button.textContent='Releasing...';

    try{
      await api(
        `/api/admin/creative-jobs/${encodeURIComponent(jobId)}/release`,
        {
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({action:'release_to_client'})
        }
      );
      await load();
    }catch(err){
      $('#error').textContent=err.message;
      button.disabled=false;
      button.textContent=original;
    }
  });

  creativeJobsPanel.addEventListener('submit',async e=>{
    const form=e.target.closest('.creative-internal-revision-form');
    if(!form) return;

    e.preventDefault();

    const jobId=form.dataset.job;
    const notes=String(new FormData(form).get('notes')||'').trim();
    if(!jobId || !notes) return;

    const submit=form.querySelector('button[type="submit"]');
    const original=submit?.textContent||'Create refined version';

    if(submit){
      submit.disabled=true;
      submit.textContent='Sending to GENNY...';
    }

    try{
      await api(
        `/api/admin/creative-jobs/${encodeURIComponent(jobId)}/revise`,
        {
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({notes})
        }
      );

      form.reset();
      form.hidden=true;
      creativeStudioFilter='review';
      await load();
    }catch(err){
      $('#error').textContent=err.message;
      if(submit){
        submit.disabled=false;
        submit.textContent=original;
      }
    }
  });
}

const creativeStudioPreviewDialog=$('#creativeStudioPreviewDialog');
if(creativeStudioPreviewDialog){
  creativeStudioPreviewDialog.addEventListener('click',e=>{
    if(e.target.closest('.creative-preview-close')){
      creativeStudioPreviewDialog.close();
      return;
    }

    if(e.target===creativeStudioPreviewDialog)
      creativeStudioPreviewDialog.close();
  });

  creativeStudioPreviewDialog.addEventListener('close',()=>{
    const stage=$('#creativeStudioPreviewStage');
    if(stage) stage.innerHTML='';
  });
}

function ensureCreativeAdminLiveMonitor(){
  if(window.__coastloopCreativeAdminPoll) return;

  async function refreshCreativeAdminLive(){
    if(document.hidden) return;
    if(!document.querySelector('#creativeJobs')) return;
    if(!(state.creativeJobs||[]).some(creativeAdminBuilding)) return;

    try{
      const payload=await api('/api/admin/creative-jobs');
      state.creativeJobs=normalizeCreativeAdminPayload(payload);
      render();
    }catch(_err){}
  }

  window.__coastloopCreativeAdminPoll=setInterval(
    refreshCreativeAdminLive,
    4000
  );

  document.addEventListener(
    'visibilitychange',
    ()=>{
      if(!document.hidden) refreshCreativeAdminLive();
    }
  );
}

ensureCreativeAdminLiveMonitor();
