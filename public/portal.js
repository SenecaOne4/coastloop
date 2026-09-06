import {api} from '/session.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const age=ts=>{if(!ts)return'Never';let s=Math.max(0,Math.floor((Date.now()-new Date(ts))/1000));if(s<60)return`${s}s ago`;if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`};
const dur=x=>{x=Math.round(Number(x||0));return x>=3600?`${(x/3600).toFixed(1)} hr`:`${Math.round(x/60)} min`};
$('#account').onclick=()=>location.href='/account';
try{
 const d=await api('/api/portal/overview');
 $('#businesses').innerHTML=d.businesses.map(b=>`
 <section class="card">
 <div class="row"><div><h1>${esc(b.name)}</h1><div class="muted">${b.is_host?'HOST ':''}${b.is_host&&b.is_advertiser?'· ':''}${b.is_advertiser?'ADVERTISER':''}</div></div><span class="pill">${esc(b.member_role)}</span></div>
 ${b.locations.length?`<h2>Hosted screens</h2>${b.locations.map(l=>`
 <div class="media-item"><strong>${esc(l.name||b.name)}</strong><div class="muted">${esc([l.address_line1,l.city,l.state].filter(Boolean).join(', '))}</div>
 ${(l.screens||[]).map(s=>`<div class="row" style="margin-top:10px"><span class="pill ${s.online?'online':'offline'}">${s.online?'ONLINE':'OFFLINE'}</span><span>${esc(s.name)}</span><span>${s.plays_today||0} plays today</span><span>Last verified ${age(s.last_played_at)}</span></div>`).join('')||'<div class="muted">No active screen yet.</div>'}</div>`).join('')}`:''}
 ${b.campaigns.length?`<h2>Advertising campaigns</h2>${b.campaigns.map(c=>`
 <div class="media-item"><div class="row"><strong>${esc(c.name)}</strong><span class="pill">${esc(c.status)}</span></div>
 <div class="row" style="margin-top:12px"><div><strong>${Number(c.plays||0).toLocaleString()}</strong><div class="muted">verified plays</div></div><div><strong>${c.screen_count||0}</strong><div class="muted">screens</div></div><div><strong>${dur(c.seconds_played)}</strong><div class="muted">delivered</div></div><div><strong>${age(c.last_played_at)}</strong><div class="muted">last verified</div></div></div></div>`).join('')}`:''}
 </section>`).join('')||'<section class="card"><h2>No business access assigned yet.</h2></section>';
}catch(e){
 if(String(e.message).includes('401'))location.replace('/login?next=/portal');
 else $('#error').textContent=e.message;
}
