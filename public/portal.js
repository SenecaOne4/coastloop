import {api,logout} from '/session.js';

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const num=v=>Number(v||0).toLocaleString('en-US');
const money=v=>new Intl.NumberFormat('en-US',{
  style:'currency',currency:'USD'
}).format(Number(v||0)/100);
const date=v=>v?new Date(v).toLocaleDateString():'—';
const age=ts=>{
  if(!ts)return'No verified play yet';
  const s=Math.max(0,Math.floor((Date.now()-new Date(ts))/1000));
  if(s<5)return'just now';
  if(s<60)return`${s}s ago`;
  if(s<3600)return`${Math.floor(s/60)}m ago`;
  if(s<86400)return`${Math.floor(s/3600)}h ago`;
  return`${Math.floor(s/86400)}d ago`;
};
const dur=x=>{
  x=Math.round(Number(x||0));
  return x>=3600?`${(x/3600).toFixed(1)} hr`:`${Math.round(x/60)} min`;
};

function deliveryChart(series,label='7-day verified delivery'){
  const rows=Array.isArray(series)?series:[];
  if(!rows.length)return'';
  const max=Math.max(1,...rows.map(x=>Number(x.plays||0)));
  const total=rows.reduce((n,x)=>n+Number(x.plays||0),0);

  return `<div class="portal-delivery-chart">
    <div class="portal-chart-head">
      <span>${esc(label)}</span>
      <strong>${num(total)} plays</strong>
    </div>
    <div class="portal-chart-bars">
      ${rows.map(x=>{
        const value=Number(x.plays||0);
        const height=Math.max(value?8:2,Math.round((value/max)*100));
        const day=new Date(`${x.date}T12:00:00`).toLocaleDateString(
          'en-US',{weekday:'short'}
        );
        return `<div class="portal-chart-day">
          <span>${num(value)}</span>
          <div><i style="height:${height}%"></i></div>
          <small>${day}</small>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function deliveryHealth(c){
  if(c.delivery_percent==null)return{
    label:'OPEN DELIVERY',
    className:'neutral'
  };

  const delivered=Number(c.delivery_percent||0);
  const pace=c.pace_percent==null?null:Number(c.pace_percent);

  if(delivered>=100)return{label:'DELIVERED',className:'good'};
  if(pace!=null && pace>=95)return{label:'ON PACE',className:'good'};
  if(pace!=null && pace>=80)return{label:'WATCH',className:'watch'};
  if(pace!=null)return{label:'NEEDS PACE',className:'risk'};
  return{label:'ACTIVE',className:'neutral'};
}

function campaignLocations(c){
  const rows=Array.isArray(c.location_breakdown)?c.location_breakdown:[];
  if(!rows.length)return'';

  return `<div class="portal-proof-block">
    <div class="portal-proof-head">
      <span>WHERE YOUR AD RAN</span>
      <strong>${num(rows.length)} location${rows.length===1?'':'s'}</strong>
    </div>
    <div class="portal-location-proof">
      ${rows.map(l=>`
        <div class="portal-proof-row">
          <div>
            <strong>${esc(l.host_name||l.location_name)}</strong>
            <small>${esc([l.city,l.state].filter(Boolean).join(', ')||l.location_name||'CoastLoop location')}</small>
          </div>
          <div><strong>${num(l.plays)}</strong><small>verified plays</small></div>
          <div><strong>${num(l.plays_today)}</strong><small>today</small></div>
          <div><strong>${num(l.screen_count)}</strong><small>screen${Number(l.screen_count)===1?'':'s'}</small></div>
          <div><strong>${age(l.last_played_at)}</strong><small>latest</small></div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function campaignActivity(c){
  const rows=Array.isArray(c.recent_activity)?c.recent_activity:[];
  if(!rows.length)return'';

  return `<div class="portal-proof-block">
    <div class="portal-proof-head">
      <span>RECENT VERIFIED DELIVERY</span>
      <strong>PROOF FEED</strong>
    </div>
    <div class="portal-activity-feed">
      ${rows.map(r=>`
        <div class="portal-activity-row">
          <span class="network-live-dot"></span>
          <div>
            <strong>${esc(r.host_name||r.location_name)}</strong>
            <small>${esc([r.city,r.state].filter(Boolean).join(', '))} · ${esc(r.screen_name)}</small>
          </div>
          <div>
            <strong>${num(r.play_count)} play${Number(r.play_count)===1?'':'s'}</strong>
            <small>verified ${age(r.last_played_at)}</small>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function metric(value,label,sub=''){
  return `<div class="portal-metric">
    <strong>${value}</strong>
    <span>${esc(label)}</span>
    ${sub?`<small>${esc(sub)}</small>`:''}
  </div>`;
}

function progress(c){
  if(c.delivery_percent==null){
    return `<div class="portal-progress-note">No guaranteed play target</div>`;
  }
  const pct=Math.max(0,Math.min(100,Number(c.delivery_percent||0)));
  const pace=c.pace_percent==null?null:Number(c.pace_percent);
  let health='BUILDING DELIVERY';
  if(pct>=100) health='GOAL DELIVERED';
  else if(pace!=null && pace>=95) health='ON PACE';
  else if(pace!=null && pace>=80) health='WATCHING PACE';
  else if(pace!=null) health='BEHIND PACE';

  return `<div class="portal-progress">
    <div class="portal-progress-head">
      <span>${health}</span>
      <strong>${pct.toFixed(1)}%</strong>
    </div>
    <div class="portal-progress-track"><i style="width:${pct}%"></i></div>
    <div class="portal-progress-foot">
      <span>${num(c.plays)} verified</span>
      <span>${c.remaining_plays==null?'—':num(c.remaining_plays)+' remaining'}</span>
      <span>${pace==null?'pace unavailable':pace.toFixed(1)+'% pace'}</span>
    </div>
  </div>`;
}

function hostDashboard(b){
  const h=b.host_summary||{};
  return `<section class="portal-zone">
    <div class="portal-zone-head">
      <div><div class="portal-eyebrow">HOST NETWORK</div><h2>Your CoastLoop screens</h2></div>
      <span class="portal-status ${Number(h.online)>0?'live':''}">
        <i></i>${num(h.online)} ONLINE
      </span>
    </div>
    <div class="portal-metric-grid">
      ${metric(`${num(h.online)} / ${num(h.screens)}`,'screens online now')}
      ${metric(num(h.plays_today),'plays served today')}
      ${metric(age(h.last_verified_at),'latest verified delivery')}
    </div>
    <div class="portal-location-grid">
      ${(b.locations||[]).map(l=>`
        <article class="portal-location">
          <div class="portal-card-head">
            <div><strong>${esc(l.name||b.name)}</strong>
            <small>${esc([l.address_line1,l.city,l.state].filter(Boolean).join(', '))}</small></div>
          </div>
          ${(l.screens||[]).map(s=>`
            <div class="portal-screen">
              <span class="portal-status ${s.online?'live':''}"><i></i>${s.online?'ONLINE':'OFFLINE'}</span>
              <strong>${esc(s.name)}</strong>
              <span>${num(s.plays_today)} plays today</span>
              <span>verified ${age(s.last_played_at)}</span>
            </div>
          `).join('')||'<div class="portal-empty">No active screen yet.</div>'}
        </article>
      `).join('')}
    </div>
  </section>`;
}

function hostEarnings(b){
  const payouts=Array.isArray(b.host_payouts)?b.host_payouts:[];
  const h=b.host_summary||{};
  if(!payouts.length && !Number(h.payout_due_cents) && !Number(h.payout_paid_cents))
    return '';

  return `<section class="portal-zone">
    <div class="portal-zone-head">
      <div>
        <div class="portal-eyebrow">HOST EARNINGS</div>
        <h2>Screen compensation</h2>
      </div>
      <div class="portal-last">CoastLoop payout ledger</div>
    </div>

    <div class="portal-metric-grid">
      ${metric(money(h.payout_due_cents),'due / approved')}
      ${metric(money(h.payout_paid_cents),'paid to date')}
      ${metric(num(payouts.length),'payout records')}
    </div>

    <div class="portal-payout-list">
      ${payouts.map(p=>`
        <article class="portal-payout">
          <div>
            <strong>${money(p.amount_cents)}</strong>
            <small>${p.period_start||p.period_end
              ? `${p.period_start?date(p.period_start):'—'} → ${p.period_end?date(p.period_end):'—'}`
              : 'Host compensation'}</small>
          </div>
          <span class="portal-health ${p.status==='paid'?'good':p.status==='approved'?'watch':'neutral'}">
            ${esc(String(p.status||'due').toUpperCase())}
          </span>
          <div>
            <strong>${p.paid_at?date(p.paid_at):'—'}</strong>
            <small>${p.paid_at?'paid':'payment date'}</small>
          </div>
          <div>
            <strong>${esc(p.payment_reference||'—')}</strong>
            <small>reference</small>
          </div>
        </article>
      `).join('')}
    </div>
  </section>`;
}

function capabilityCard(kind,status){
  const host=kind==="host";
  const title=host?"Host a CoastLoop screen":"Advertise on CoastLoop";
  const href=host?"/host":"/advertise";
  if(status==="pending"){
    return `<article class="portal-choice-card">
      <div class="portal-eyebrow">PENDING</div>
      <h3>${title}</h3>
      <p>Activation is in progress and unlocks here when the agreement is completed.</p>
    </article>`;
  }
  return `<article class="portal-choice-card">
    <div class="portal-eyebrow">AVAILABLE</div>
    <h3>${title}</h3>
    <p>${host?"Turn this business into a CoastLoop host location.":"Put this business on the CoastLoop network."}</p>
    <a class="portal-action" href="${href}">Get started</a>
  </article>`;
}

function advertiserDashboard(b){
  const a=b.advertiser_summary||{};
  const campaigns=Array.isArray(b.campaigns)?b.campaigns:[];

  return `<section class="portal-zone cl-advertiser">
    <div class="cl-portal-head">
      <div>
        <div class="portal-eyebrow">ADVERTISING</div>
        <h2>Your business is in the Loop.</h2>
        <p>We create the ad, deliver it to the network, and verify every play.</p>
      </div>
      <div class="portal-last">Latest verified · ${age(a.last_verified_at)}</div>
    </div>

    <section class="cl-portal-section cl-create-ad">
      <div class="cl-portal-section-copy">
        <span id="create-ad" class="cl-anchor"></span><div class="portal-eyebrow">CREATE AN AD</div>
        <h3>What do you want people to see?</h3>
        <p>Give us the facts. CoastLoop handles the creative direction, production and network formatting.</p>
      </div>

      <form class="creative-request cl-portal-form" data-business-id="${esc(b.id)}">
        <input type="text" name="title" maxlength="120" placeholder="Ad name (optional)">
        <input type="text" name="promotion" maxlength="1500" placeholder="What are you promoting?" required>
        <input type="text" name="cta" maxlength="160" placeholder="Call to action — Book Now, Visit Us, Learn More…">
        <div class="cl-form-row">
          <select name="job_type">
            <option value="video">Premium video</option>
            <option value="image">Still image</option>
          </select>
          <input type="text" name="notes" maxlength="1500" placeholder="Anything else we should know?">
        </div>
        <button class="cl-btn cl-btn-primary" type="submit">Create my ad</button>
        <div class="creative-request-status cl-form-status" aria-live="polite"></div>
      </form>
    </section>

    <section class="cl-portal-section">
      <div class="cl-portal-section-title">
        <div>
          <span id="creative" class="cl-anchor"></span><div class="portal-eyebrow">YOUR ADS</div>
          <h3>Creative</h3>
        </div>
      </div>
      <div class="creative-jobs cl-creative-list" data-business-id="${esc(b.id)}">Loading creative…</div>
    </section>

    <section class="cl-portal-section">
      <div class="cl-portal-section-title">
        <div>
          <span id="brand-library" class="cl-anchor"></span><div class="portal-eyebrow">BRAND LIBRARY</div>
          <h3>Give us what you have.</h3>
        </div>
        <p>Logo, photos, video, menus and brand files stay here for future ads.</p>
      </div>

      <div class="cl-brand-grid">
        <form class="creative-profile cl-portal-form" data-business-id="${esc(b.id)}">
          <input name="business_category" placeholder="What kind of business are you?" value="${esc(b.category||'')}">
          <textarea name="business_description" placeholder="Tell us what your company does."></textarea>
          <input name="website_url" placeholder="Website" value="${esc(b.website||'')}">
          <input name="default_cta" placeholder="Default call to action">
          <textarea name="brand_notes" placeholder="Anything about your brand, style, customers, or vibe we should know?"></textarea>
          <button class="cl-btn" type="submit">Save business profile</button>
          <div class="creative-profile-status cl-form-status" aria-live="polite"></div>
        </form>

        <div>
          <form class="source-upload cl-upload" data-business-id="${esc(b.id)}">
            <select name="asset_type">
              <option value="logo">Logo</option>
              <option value="photo">Photo</option>
              <option value="video">Video</option>
              <option value="brand_guide">Brand guide</option>
              <option value="menu">Menu</option>
              <option value="reference">Reference</option>
              <option value="other">Other</option>
            </select>
            <input type="file" name="file" required>
            <button class="cl-btn" type="submit">Add to Brand Library</button>
            <div class="source-upload-status cl-form-status" aria-live="polite"></div>
          </form>
          <div class="source-library cl-source-library" data-business-id="${esc(b.id)}"></div>
        </div>
      </div>
    </section>

    <section class="cl-portal-section">
      <div class="cl-portal-section-title">
        <div>
          <span id="delivery" class="cl-anchor"></span><div class="portal-eyebrow">DELIVERY</div>
          <h3>Verified network activity</h3>
        </div>
        <span class="portal-last">Latest verified · ${age(a.last_verified_at)}</span>
      </div>

      <div class="cl-delivery-metrics">
        ${metric(num(a.verified_plays),'verified plays')}
        ${metric(num(a.plays_today),'today')}
        ${metric(num(a.screens),'screens')}
        ${metric(num(a.locations),'locations')}
      </div>

      ${deliveryChart(a.daily_plays,'7-day verified delivery')}

      <div class="cl-campaign-list">
        ${campaigns.map(c=>{
          const health=deliveryHealth(c);
          return `<article class="cl-campaign">
            <div class="cl-campaign-head">
              <div>
                <strong>${esc(c.name||'Campaign')}</strong>
                <span>${esc(String(c.status||'').toUpperCase())}</span>
              </div>
              <span class="portal-health ${health.className}">${health.label}</span>
            </div>
            ${progress(c)}
            <div class="cl-campaign-stats">
              ${metric(num(c.plays_today),'today')}
              ${metric(num(c.screen_count),'screens')}
              ${metric(num(c.location_count),'locations')}
              ${metric(dur(c.seconds_played),'screen time')}
            </div>
            ${campaignLocations(c)}
            ${campaignActivity(c)}
            <div class="portal-verified-line">
              <span class="network-live-dot"></span>
              Last verified ${age(c.last_played_at)}
            </div>
          </article>`;
        }).join('')||'<div class="portal-empty">No advertising campaigns yet.</div>'}
      </div>
    </section>

    ${billing(b)}
  </section>`;
}

function billing(b){
  if(!(b.invoices||[]).length)return'';
  return `<section class="portal-zone">
    <div class="portal-zone-head">
      <div><span id="billing" class="cl-anchor"></span><div class="portal-eyebrow">BILLING</div><h2>Invoices</h2></div>
    </div>
    <div class="portal-invoices">
      ${b.invoices.map(i=>`
        <article class="portal-invoice">
          <div>
            <strong>${esc(i.invoice_number||'Invoice')}</strong>
            <small>${esc(String(i.provider||'manual').toUpperCase())} · due ${date(i.due_at)}</small>
          </div>
          <div><span class="pill">${esc(i.status)}</span></div>
          <div><strong>${money(i.total_cents)}</strong><small>total</small></div>
          <div><strong>${money(i.amount_due_cents)}</strong><small>due</small></div>
          <div class="portal-invoice-actions">
            ${i.hosted_invoice_url?`<a class="button-link" href="${esc(i.hosted_invoice_url)}" target="_blank" rel="noopener">View / pay</a>`:''}
            ${i.invoice_pdf_url?`<a class="button-link secondary" href="${esc(i.invoice_pdf_url)}" target="_blank" rel="noopener">PDF</a>`:''}
          </div>
        </article>
      `).join('')}
    </div>
  </section>`;
}

function actionCard(title,text,href,label){
  return `<a class="card portal-choice" href="${href}">
    <div class="portal-eyebrow">COASTLOOP</div>
    <h2>${esc(title)}</h2>
    <p class="muted">${esc(text)}</p>
    <span class="button-link">${esc(label)}</span>
  </a>`;
}

function customerHome(d){
  const businesses=Array.isArray(d.businesses)?d.businesses:[];
  const email=d?.user?.email||'';
  const access=d?.access||{};
  const internal=String(access.internal_role||'').toLowerCase();
  const broker=internal==='broker';
  const admin=['owner','admin'].includes(internal);

  const businessDashboards=businesses.map(b=>{
    const hostState=b.capabilities?.host?.status||(b.is_host?"active":"inactive");
    const advertiserState=b.capabilities?.advertiser?.status||(b.is_advertiser?"active":"inactive");
    const sections=[];

    if(advertiserState==="active") sections.push(advertiserDashboard(b));
    if(hostState==="active") sections.push(hostDashboard(b));

    const roles=[
      advertiserState==="active"?"ADVERTISER":null,
      hostState==="active"?"HOST":null
    ].filter(Boolean).join(" + ")||"COASTLOOP";

    return `<section id="business-${esc(b.id)}" class="portal-business">
      <div class="portal-business-title">
        <div>
          <div class="portal-eyebrow">${roles}</div>
          <h2>${esc(b.name||'My business')}</h2>
        </div>
      </div>
      ${sections.join('')||`<div class="portal-empty">No active CoastLoop services yet.</div>`}
    </section>`;
  }).join('');

  const internalTools=[
    broker?`<a class="cl-text-link" href="/broker.html">Broker desk →</a>`:'',
    admin?`<a class="cl-text-link" href="/admin.html">Admin →</a>`:''
  ].filter(Boolean).join('');

  return `<section class="portal-command cl-portal-home">
    <div class="portal-welcome">
      <div>
        <div class="portal-eyebrow">MY COASTLOOP</div>
        <h1>Welcome back.</h1>
        <p class="public-lede">${esc(email)}</p>
      </div>
      ${internalTools?`<div class="cl-internal-links">${internalTools}</div>`:''}
    </div>
  </section>

  ${businessDashboards||`<section class="portal-empty-state cl-empty-start">
    <div class="portal-eyebrow">GET STARTED</div>
    <h2>Put your business in the Loop.</h2>
    <p>Start an advertising order or add a venue screen.</p>
  </section>`}

  <section class="cl-portal-actions">
    <span>Need something else?</span>
    <a href="/advertise">Start advertising →</a>
    <a href="/host">Host a screen →</a>
  </section>`;
}
function initials(v=''){
  return String(v).trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'C';
}
function closeMenus(){
  const wm=$('#workspaceMenu'), um=$('#userMenu');
  if(wm)wm.hidden=true;
  if(um)um.hidden=true;
  $('#workspaceToggle')?.setAttribute('aria-expanded','false');
  $('#account')?.setAttribute('aria-expanded','false');
}
function hydrateAppChrome(d){
  const businesses=Array.isArray(d.businesses)?d.businesses:[];
  const email=d?.user?.email||'';
  const name=d?.user?.full_name||email.split('@')[0]||'Account';
  const active=businesses[0];

  if(active){
    $('#workspaceName').textContent=active.name||'CoastLoop';
  }
  $('#userName').textContent=name;
  $('#userEmail').textContent=email||'CoastLoop';
  $('#userAvatar').textContent=initials(name);

  $('#workspaceMenu').innerHTML=businesses.length
    ? businesses.map((b,i)=>`<a href="#business-${esc(b.id)}" class="${i===0?'is-current':''}">
        <span class="cl-pop-avatar">${esc(initials(b.name))}</span>
        <span><strong>${esc(b.name||'Business')}</strong><small>${b.is_advertiser?'Advertiser':''}${b.is_advertiser&&b.is_host?' + ':''}${b.is_host?'Host':''}</small></span>
        ${i===0?'<span class="cl-pop-check">✓</span>':''}
      </a>`).join('')
    : '<div class="cl-pop-empty">No business workspaces yet.</div>';
}

$('#workspaceToggle').onclick=e=>{
  e.stopPropagation();
  const m=$('#workspaceMenu'), open=m.hidden;
  closeMenus(); m.hidden=!open;
  $('#workspaceToggle').setAttribute('aria-expanded',String(open));
};
$('#account').onclick=e=>{
  e.stopPropagation();
  const m=$('#userMenu'), open=m.hidden;
  closeMenus(); m.hidden=!open;
  $('#account').setAttribute('aria-expanded',String(open));
};
$('#workspaceMenu').onclick=()=>closeMenus();
$('#userMenu').onclick=e=>e.stopPropagation();
$('#portalLogout').onclick=async()=>{
  await logout();
  location.replace('/login');
};
document.addEventListener('click',closeMenus);
document.querySelectorAll('.cl-side-link[href^="#"]').forEach(a=>{
  a.addEventListener('click',()=>{
    document.querySelectorAll('.cl-side-link[href^="#"]').forEach(x=>x.classList.remove('is-active'));
    a.classList.add('is-active');
  });
});

async function hydrateCreative(){
  for(const box of document.querySelectorAll('.source-library')){
    const id=box.dataset.businessId;
    try{
      const rows=await api(`/api/portal/source-assets?business_id=${encodeURIComponent(id)}`);
      box.innerHTML=(rows||[]).map(a=>`<div class="muted">${esc(a.title||a.original_filename||'Brand asset')} · ${esc(a.asset_type||'asset')}</div>`).join('')||'<div class="muted">No brand assets yet.</div>';
    }catch(e){ box.textContent='Brand library unavailable.'; }
  }

  for(const box of document.querySelectorAll('.creative-jobs')){
    const id=box.dataset.businessId;
    try{
      const rows=await api(`/api/portal/creative-jobs?business_id=${encodeURIComponent(id)}`);
      box.innerHTML=(rows||[]).map(j=>{
        const revisionRequested=j.review_status==='changes_requested';
        const state=j.review_status==='approved'
          ? 'Approved'
          : revisionRequested
            ? 'Revision requested'
            : j.status==='completed'
              ? 'Ready for review'
              : j.status==='claimed'
                ? 'Creating'
                : 'Preparing';
        const tone=state==='Approved'
          ? 'good'
          : state==='Ready for review'
            ? 'watch'
            : state==='Creating'
              ? 'active'
              : state==='Revision requested'
                ? 'revision'
                : 'neutral';
        const rev=Number(j.revision_number||j.metadata?.revision_number||1);
        const ready=j.status==='completed'&&j.output_asset_id&&!revisionRequested&&j.review_status!=='approved';
        const media=j.output_asset_id
          ? `<div class="cl-creative-preview">${
              j.job_type==='video'
                ? `<video src="/media/${encodeURIComponent(j.output_asset_id)}" muted playsinline preload="metadata" controls></video>`
                : `<img src="/media/${encodeURIComponent(j.output_asset_id)}" alt="${esc(j.metadata?.title||'CoastLoop creative')}">`
            }</div>`
          : `<div class="cl-creative-preview is-empty"><span>${state==='Creating'?'Creating…':'Creative preview'}</span></div>`;
        const actions=ready
          ? `<div class="cl-creative-actions">
              <button type="button" class="cl-review-approve" data-job-id="${esc(j.id)}">Approve</button>
              <button type="button" class="cl-review-revise" data-job-id="${esc(j.id)}">Request changes</button>
            </div>
            <form class="cl-revision-form" data-job-id="${esc(j.id)}" hidden>
              <label>What should we change?
                <textarea name="notes" maxlength="1000" required placeholder="Tell us exactly what you want adjusted."></textarea>
              </label>
              <div>
                <button type="submit">Send revision</button>
                <button type="button" class="cl-revision-cancel">Cancel</button>
              </div>
              <span class="cl-review-status" aria-live="polite"></span>
            </form>`
          : '';
        return `<article class="cl-creative-row cl-creative-review-row">
          <div class="cl-creative-row-mark" aria-hidden="true"></div>
          ${media}
          <div class="cl-creative-row-main">
            <strong>${esc(j.metadata?.title||'CoastLoop creative')}</strong>
            <span>${esc(j.job_type||'image')} · Revision ${rev}</span>
            ${revisionRequested&&j.review_notes?`<small>${esc(j.review_notes)}</small>`:''}
          </div>
          <div class="cl-creative-row-state ${tone}">
            <i></i><span>${esc(state)}</span>
          </div>
          ${actions}
        </article>`;
      }).join('')||'<div class="portal-empty">No creative requests yet.</div>';
    }catch(e){ box.textContent='Creative status unavailable.'; }
  }
}

document.addEventListener('click',async e=>{
  const approve=e.target.closest('.cl-review-approve');
  if(approve){
    approve.disabled=true;
    const original=approve.textContent;
    approve.textContent='Approving…';
    try{
      await api(`/api/portal/creative-jobs/${encodeURIComponent(approve.dataset.jobId)}/review`,{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'approve'})
      });
      await hydrateCreative();
    }catch(err){
      approve.disabled=false;
      approve.textContent=original;
      const row=approve.closest('.cl-creative-review-row');
      const status=row?.querySelector('.cl-review-status');
      if(status){
        status.textContent=err.message||'Could not approve creative.';
        status.classList.add('is-error');
      }
    }
    return;
  }

  const revise=e.target.closest('.cl-review-revise');
  if(revise){
    const article=revise.closest('.cl-creative-review-row');
    const form=article?.querySelector('.cl-revision-form');
    if(form){
      form.hidden=false;
      revise.closest('.cl-creative-actions').hidden=true;
      form.querySelector('textarea')?.focus();
    }
    return;
  }

  const cancel=e.target.closest('.cl-revision-cancel');
  if(cancel){
    const article=cancel.closest('.cl-creative-review-row');
    const form=cancel.closest('.cl-revision-form');
    if(form) form.hidden=true;
    const actions=article?.querySelector('.cl-creative-actions');
    if(actions) actions.hidden=false;
  }
});



document.addEventListener('submit',async e=>{
  const form=e.target.closest('.cl-revision-form');
  if(!form) return;
  e.preventDefault();
  const notes=String(new FormData(form).get('notes')||'').trim();
  const status=form.querySelector('.cl-review-status');
  const submit=form.querySelector('button[type="submit"]');
  if(!notes){
    if(status){
      status.textContent='Tell us what you want changed.';
      status.classList.add('is-error');
    }
    return;
  }
  if(submit) submit.disabled=true;
  if(status){
    status.textContent='Sending revision…';
    status.classList.remove('is-error','is-success');
  }
  try{
    await api(`/api/portal/creative-jobs/${encodeURIComponent(form.dataset.jobId)}/review`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({action:'request_changes',notes})
    });
    await hydrateCreative();
  }catch(err){
    if(submit) submit.disabled=false;
    if(status){
      status.textContent=err.message||'Could not request revision.';
      status.classList.remove('is-success');
      status.classList.add('is-error');
    }
  }
});


document.addEventListener('submit',async e=>{
  const form=e.target;
  if(form.matches('.creative-profile')){
    e.preventDefault();
    const status=form.querySelector('.creative-profile-status');
    const data=Object.fromEntries(new FormData(form));
    const id=form.dataset.businessId;
    status.textContent='Saving…';
    try{
      await api(`/api/portal/creative-profile?business_id=${encodeURIComponent(id)}`,{
        method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(data)
      });
      status.textContent='Business profile saved.';
    }catch(err){ status.textContent=err.message||'Could not save profile.'; }
  }

  if(form.matches('.creative-request')){
    e.preventDefault();
    const status=form.querySelector('.creative-request-status');
    const data=Object.fromEntries(new FormData(form));
    data.business_id=form.dataset.businessId;
    status.textContent='Submitting…';
    try{
      await api('/api/portal/creative-jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
      form.reset(); status.textContent='Creative request received.';
      await hydrateCreative();
    }catch(err){ status.textContent=err.message||'Could not submit creative.'; }
  }

  if(form.matches('.source-upload')){
    e.preventDefault();
    const status=form.querySelector('.source-upload-status');
    const data=new FormData(form);
    data.set('business_id',form.dataset.businessId||'');
    status.textContent='Uploading…';
    try{
      await api('/api/portal/source-assets',{method:'POST',body:data});
      form.reset(); status.textContent='Added to your Brand Library.';
      await hydrateCreative();
    }catch(err){ status.textContent=err.message||'Upload failed.'; }
  }
});

try{
  const d=await api('/api/portal/overview');
  $('#app').innerHTML=customerHome(d);
  hydrateAppChrome(d);
  await hydrateCreative();
}catch(e){
  if(String(e.message).includes('401')){
    location.replace('/login?next=/portal');
  }else{
    $('#error').textContent=e.message;
  }
}
