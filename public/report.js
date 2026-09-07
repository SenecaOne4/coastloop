const $ = s => document.querySelector(s);
const esc = v => String(v ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;');

const token = sessionStorage.getItem('adminToken') || '';
const campaignId = new URLSearchParams(location.search).get('campaign');

function duration(seconds){
  seconds = Number(seconds || 0);
  if (seconds >= 3600) return `${(seconds/3600).toFixed(seconds >= 36000 ? 0 : 1)} hr`;
  if (seconds >= 60) return `${Math.round(seconds/60).toLocaleString()} min`;
  return `${Math.round(seconds).toLocaleString()} sec`;
}

function when(v){
  if (!v) return '—';
  return new Date(v).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});
}

function dateOnly(v){
  if (!v) return '—';
  return new Date(`${v}T12:00:00`).toLocaleDateString([], {
    year:'numeric', month:'short', day:'numeric'
  });
}

async function load(){
  if (!token) {
    $('#reportError').textContent = 'Open this report from CoastLoop Admin so your secure session is available.';
    return;
  }
  if (!campaignId) {
    $('#reportError').textContent = 'No campaign selected.';
    return;
  }

  const res = await fetch('/api/admin/reports/campaigns', {
    headers:{Authorization:`Bearer ${token}`}
  });

  if (!res.ok) throw new Error(`Unable to load report (${res.status})`);

  const reports = await res.json();
  const r = reports.find(x => x.campaign_id === campaignId);
  if (!r) throw new Error('Campaign report not found.');

  const deliveryGoal=Number(r.delivery_goal_plays||0);
  const deliveryPct=r.delivery_percent==null ? null : Number(r.delivery_percent);
  const pacePct=r.pace_percent==null ? null : Number(r.pace_percent);
  const remaining=r.remaining_plays==null ? null : Number(r.remaining_plays);
  const health=String(r.delivery_health||'not_targeted').replaceAll('_',' ');
  const deliveryHost=$('#reportError')?.parentElement || document.body;

  if(!document.querySelector('#deliveryContract')){
    deliveryHost.insertAdjacentHTML('afterbegin',`
      <section id="deliveryContract" class="card" style="margin-bottom:18px">
        <div class="row">
          <div>
            <div class="muted">Verified delivery contract</div>
            <h2 style="margin:4px 0">${deliveryGoal ? deliveryGoal.toLocaleString()+' plays' : 'No guaranteed play target'}</h2>
          </div>
          <div><strong>${esc(health)}</strong><div class="muted">delivery health</div></div>
        </div>
        <div class="row" style="margin-top:12px">
          <div><strong>${Number(r.plays||0).toLocaleString()}</strong><div class="muted">verified plays</div></div>
          <div><strong>${remaining==null ? '—' : remaining.toLocaleString()}</strong><div class="muted">remaining</div></div>
          <div><strong>${deliveryPct==null ? '—' : deliveryPct.toFixed(1)+'%'}</strong><div class="muted">goal delivered</div></div>
          <div><strong>${pacePct==null ? '—' : pacePct.toFixed(1)+'%'}</strong><div class="muted">pace vs schedule</div></div>
        </div>
        ${Number(r.makegood_plays||0)>0
          ? `<div class="muted" style="margin-top:10px">${Number(r.makegood_plays).toLocaleString()} makegood plays are included in the delivery goal.</div>`
          : ''}
      </section>
    `);
  }

  document.title = `${r.advertiser_name || 'Advertiser'} — ${r.campaign_name} | CoastLoop`;
  $('#campaignName').textContent = r.campaign_name || 'Campaign';
  $('#advertiserName').textContent = r.advertiser_name || 'CoastLoop advertiser';

  const windowBits = [];
  if (r.starts_at) windowBits.push(`Starts ${when(r.starts_at)}`);
  if (r.ends_at) windowBits.push(`Ends ${when(r.ends_at)}`);
  windowBits.push(String(r.status || 'draft').toUpperCase());
  $('#campaignWindow').textContent = windowBits.join('  ·  ');

  $('#plays').textContent = Number(r.plays || 0).toLocaleString();
  $('#locationsCount').textContent = Number((r.locations || []).length).toLocaleString();
  $('#screens').textContent = Number(r.screen_count || 0).toLocaleString();
  $('#airtime').textContent = duration(r.seconds_played);
  $('#lastPlayed').textContent = r.last_played_at ? `Last verified ${when(r.last_played_at)}` : 'Awaiting first verified play';

  const creatives = r.creatives || [];
  $('#creatives').innerHTML = creatives.length ? creatives.map(c => `
    <article class="report-breakdown-row">
      <div>
        <strong>${esc(c.creative_name)}</strong>
        <span>${esc(String(c.media_type || 'creative').toUpperCase())}</span>
      </div>
      <div><strong>${Number(c.plays || 0).toLocaleString()}</strong><span>plays</span></div>
      <div><strong>${duration(c.seconds_played)}</strong><span>airtime</span></div>
      <div><strong>${Number(c.screen_count || 0).toLocaleString()}</strong><span>screens</span></div>
    </article>
  `).join('') : '<div class="report-empty">No creative delivery has been recorded yet.</div>';

  const locations = r.locations || [];
  $('#locations').innerHTML = locations.length ? locations.map(l => `
    <article class="report-breakdown-row location">
      <div>
        <strong>${esc(l.business_name || l.location_name || 'CoastLoop screen')}</strong>
        <span>${esc(l.address || l.location_name || '')}</span>
      </div>
      <div><strong>${Number(l.plays || 0).toLocaleString()}</strong><span>plays</span></div>
      <div><strong>${duration(l.seconds_played)}</strong><span>airtime</span></div>
      <div><strong>${Number(l.screen_count || 0).toLocaleString()}</strong><span>screens</span></div>
    </article>
  `).join('') : '<div class="report-empty">No location delivery has been recorded yet.</div>';

  const daily = r.daily || [];
  $('#daily').innerHTML = daily.length ? [...daily].reverse().map(d => `
    <tr>
      <td>${esc(dateOnly(d.date))}</td>
      <td>${Number(d.plays || 0).toLocaleString()}</td>
      <td>${esc(duration(d.seconds))}</td>
    </tr>
  `).join('') : '<tr><td colspan="3" class="report-empty">No delivery history yet.</td></tr>';
}

$('#printReport').addEventListener('click', () => window.print());

load().catch(err => {
  $('#reportError').textContent = err.message;
});
