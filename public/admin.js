import { api as sessionApi, readSession, logout as sessionLogout } from '/session.js';

const $ = s => document.querySelector(s);
const state = {
  token: sessionStorage.getItem('adminToken') || '',
  screens:[], media:[], playlists:[], prospects:[], businesses:[],
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
  const commercialScreens=(state.screens||[]).filter(s=>!s.is_test);
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

function prospectAddress(p){
  return [p.address_line1,p.city,p.state,p.postal_code].filter(Boolean).join(', ');
}

function renderProspectMap(){
  if(!window.L || !document.querySelector('#prospectMap')) return;

  if(!prospectMap){
    prospectMap=L.map('prospectMap').setView([33.816,-78.680],11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'&copy; OpenStreetMap'
    }).addTo(prospectMap);
    prospectLayer=L.layerGroup().addTo(prospectMap);
  }

  prospectLayer.clearLayers();
  const points=[];

  state.prospects.forEach(p=>{
    const lat=Number(p.latitude), lon=Number(p.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) return;

    const marker=L.marker([lat,lon]).addTo(prospectLayer);
    marker.bindPopup(
      `<strong>${esc(p.name)}</strong><br>`+
      `${esc(prospectAddress(p))}<br>`+
      `<span class="pill">${esc(p.stage)}</span> Score ${p.score??'—'}<br>`+
      `<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat+','+lon)}">Navigate</a>`
    );
    points.push([lat,lon]);
  });

  if(points.length===1) prospectMap.setView(points[0],14);
  if(points.length>1) prospectMap.fitBounds(points,{padding:[30,30]});

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
      stats,screens,media,playlists,prospects,businesses,
      campaigns,campaignReports,userDirectory,finance,
      billingConfig,billingInvoices,billingTransactions,billingPayouts,auditEvents,authConfig
    ] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/screens'),
      api('/api/admin/media'),
      api('/api/admin/playlists'),
      api('/api/admin/prospects'),
      api('/api/admin/businesses'),
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
      screens,media,playlists,prospects,businesses,
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

function render(){
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
  $('#businesses').innerHTML = state.businesses.map(b=>`
    <div class="media-item">
      <div class="row">
        <div>
          <strong>${esc(b.name)}</strong>
          <span class="pill">${esc(b.category||'business')}</span>
          <span class="pill">${b.is_host&&b.is_advertiser?'HOST · ADVERTISER':b.is_host?'HOST':'ADVERTISER'}</span>
          <div class="muted">${esc(b.contact_name||'')}${b.phone?' · '+esc(b.phone):''}${b.email?' · '+esc(b.email):''}</div>
        </div>
        <div class="muted">${(b.locations||[]).length} location${(b.locations||[]).length===1?'':'s'}</div>
      </div>
      ${(b.locations||[]).map(l=>`<div class="muted">${esc([l.address_line1,l.city,l.state].filter(Boolean).join(', '))} · ${esc(l.host_status||'')}</div>`).join('')}
    </div>`).join('') || '<div class="muted">No customers yet. Promote a prospect when they convert.</div>';

  $('#campaignBusiness').innerHTML = '<option value="">Choose advertiser…</option>' +
    state.businesses.filter(b=>b.is_advertiser).map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');

  $('#mediaBusiness').innerHTML = '<option value="">House / internal</option>' +
    state.businesses.filter(b=>b.is_advertiser).map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');

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
    return `<div class="media-item" data-media="${m.id}">
      <div class="row">
        <div>
          <strong>${esc(m.name)}</strong>
          <span class="pill">${esc(m.media_type)}</span>
          <span class="pill">${esc(approval)}</span>
          <div class="muted">${advertiser ? 'Advertiser: '+esc(advertiser.name) : 'House / internal'} · ${m.duration_seconds}s · ${(Number(m.bytes||0)/1024/1024).toFixed(2)} MB</div>
          ${reason}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          ${approval!=='approved' ? `<button class="secondary approve-media" data-media="${m.id}" type="button">Approve</button>` : ''}
          ${approval!=='rejected' ? `<button class="secondary reject-media" data-media="${m.id}" type="button">Reject</button>` : ''}
          ${approval!=='pending' ? `<button class="secondary reset-media-review" data-media="${m.id}" type="button">Re-review</button>` : ''}
        </div>
      </div>
      <div class="muted" style="margin-top:6px">${m.id}</div>
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
}

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
$('#upload').onsubmit=async e=>{ e.preventDefault(); try { await api('/api/admin/media',{method:'POST',body:new FormData(e.target)}); e.target.reset(); await load(); } catch(err){ $('#error').textContent=err.message; } };
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

load(); setInterval(load,30000);


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
