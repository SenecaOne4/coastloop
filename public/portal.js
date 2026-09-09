import {api} from '/session.js';

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

function advertiserDashboard(b){
  const a=b.advertiser_summary||{};
  return `<section class="portal-zone">
    <div class="portal-zone-head">
      <div><div class="portal-eyebrow">ADVERTISER DELIVERY</div><h2>Your media is moving.</h2></div>
      <div class="portal-last">Latest verified · ${age(a.last_verified_at)}</div>
    </div>
    <div class="portal-metric-grid">
      ${metric(num(a.verified_plays),'verified plays')}
      ${metric(num(a.plays_today),'verified today')}
      ${metric(num(a.screens),'screens reached')}
      ${metric(num(a.locations),'locations reached')}
      ${metric(num(a.active_campaigns),'active campaigns')}
    </div>
    ${deliveryChart(a.daily_plays,'Network delivery for your advertising')}
    <div class="portal-campaign-grid">
      ${(b.campaigns||[]).map(c=>{
        const health=deliveryHealth(c);
        return `
        <article class="portal-campaign">
          <div class="portal-card-head">
            <div>
              <div class="portal-eyebrow">${esc(c.status||'campaign')}</div>
              <h3>${esc(c.name)}</h3>
            </div>
            <div class="portal-campaign-badges">
              <span class="portal-health ${health.className}">${health.label}</span>
              <span class="pill">${esc(String(c.status||'').toUpperCase())}</span>
            </div>
          </div>
          ${progress(c)}
          ${deliveryChart(c.daily_plays)}
          <div class="portal-campaign-stats">
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
  
<div class="portal-card creative-intake">
<div>
<div class="portal-eyebrow">CREATIVE</div>
<h3>Send us your ad.</h3>
<p>Upload a JPG, PNG, GIF, or MP4. We review every creative before it enters the loop.</p>
</div>
<form class="creative-upload" data-business-id="${esc(b.id)}">
<input type="file" name="file" accept="image/jpeg,image/png,image/gif,video/mp4" required>
<input type="text" name="title" maxlength="120" placeholder="Creative name (optional)">
<button type="submit">Upload Creative</button>
<div class="creative-upload-status" aria-live="polite"></div>
</form>
</div>

</section>`;
}

function billing(b){
  if(!(b.invoices||[]).length)return'';
  return `<section class="portal-zone">
    <div class="portal-zone-head">
      <div><div class="portal-eyebrow">BILLING</div><h2>Invoices</h2></div>
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
  const hosts=businesses.filter(b=>b.is_host);
  const advertisers=businesses.filter(b=>b.is_advertiser);
  const access=d?.access||{};
  const internal=String(access.internal_role||'').toLowerCase();
  const broker=internal==='broker';
  const admin=['owner','admin'].includes(internal);

  const hostScreens=hosts.reduce((n,b)=>n+Number(b?.host?.screens||0),0);
  const hostOnline=hosts.reduce((n,b)=>n+Number(b?.host?.online||0),0);
  const adCampaigns=advertisers.reduce((n,b)=>n+(Array.isArray(b?.advertiser?.campaigns)?b.advertiser.campaigns.length:0),0);

  const roleTools=[
    broker?actionCard('Broker desk','Pipeline, customers, sales and commissions.','/broker.html','Open broker desk'):'',
    admin?actionCard('CoastLoop admin','Network operations, customers, creative and finance.','/admin.html','Open admin'):''
  ].join('');

  const businessDashboards=businesses.map(b=>{
    const sections=[];
    if(b.is_advertiser) sections.push(advertiserDashboard(b));
    if(b.is_host) sections.push(hostDashboard(b));
    return `<section class="portal-business">
      <div class="portal-business-title">
        <div>
          <div class="portal-eyebrow">${b.is_host&&b.is_advertiser?'HOST + ADVERTISER':b.is_host?'HOST':'ADVERTISER'}</div>
          <h2>${esc(b.name||'My business')}</h2>
        </div>
      </div>
      ${sections.join('')}
    </section>`;
  }).join('');

  return `<section class="portal-command">
    <div class="portal-welcome">
      <div>
        <div class="portal-eyebrow">MY COASTLOOP</div>
        <h1>Welcome back.</h1>
        <p class="public-lede">${esc(email)} · Run your advertising and hosted screens from one place.</p>
      </div>
    </div>

    <div class="portal-summary-grid">
      ${metric(num(adCampaigns),'advertising campaigns')}
      ${metric(num(hostScreens),'hosted screens')}
      ${metric(num(hostOnline),'screens online now')}
    </div>

    <div class="portal-section-head">
      <div>
        <div class="portal-eyebrow">QUICK ACTIONS</div>
        <h2>Grow your CoastLoop presence</h2>
      </div>
    </div>
    <div class="portal-choice-grid">
      ${actionCard('Buy Ad Space','Put your business across eligible CoastLoop inventory.','/advertise','Start advertising')}
      ${actionCard('Host a Screen','Add an approved venue TV to the CoastLoop network.','/host','Add a venue')}
      ${roleTools}
    </div>
  </section>

  ${businessDashboards||`<section class="portal-empty-state">
    <div class="portal-eyebrow">READY WHEN YOU ARE</div>
    <h2>Your dashboard is ready.</h2>
    <p>Start an advertising order or submit a venue to host a screen. It will appear here automatically.</p>
  </section>`}`;
}
const renderAccount=()=>location.href='/account.html';

$('#account').onclick=renderAccount;

document.querySelectorAll('.creative-upload').forEach(form=>{
form.addEventListener('submit',async e=>{
e.preventDefault();
const status=form.querySelector('.creative-upload-status');
const button=form.querySelector('button[type="submit"]');
const data=new FormData(form);
data.set('advertiser_business_id',form.dataset.businessId||'');
status.textContent='Uploading…';
button.disabled=true;
try{
const d=await api('/api/portal/media',{method:'POST',body:data});
status.textContent=d.ok
  ? 'Uploaded. Your creative is now pending review.'
  : 'Upload received.';
form.reset();
}catch(err){
status.textContent=err.message||'Upload failed.';
}finally{
button.disabled=false;
}
});
});


try{
  const d=await api('/api/portal/overview');
  $('#app').innerHTML=customerHome(d);
}catch(e){
  if(String(e.message).includes('401')){
    location.replace('/login?next=/portal');
  }else{
    $('#error').textContent=e.message;
  }
}
