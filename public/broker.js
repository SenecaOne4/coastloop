import { api as sessionApi, readSession, logout as sessionLogout } from '/session.js';

const $=s=>document.querySelector(s);
const state={prospects:[],businesses:[],campaigns:[],finance:{},me:null};

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(cents){return '$'+(Number(cents||0)/100).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2});}
function interest(p){return p.host_interest&&p.advertiser_interest?'HOST + ADVERTISER':p.host_interest?'HOST':'ADVERTISER';}
function stageOptions(selected='new'){
  return ['new','researched','contacted','follow_up','hot','won','lost','do_not_contact']
    .map(v=>`<option value="${v}" ${v===selected?'selected':''}>${v.replaceAll('_',' ')}</option>`).join('');
}
function dtLocal(ts){return ts?new Date(ts).toISOString().slice(0,16):'';}

async function api(path,options={}){
  return sessionApi(path,options);
}

function render(){
  $('#mProspects').textContent=state.prospects.length;
  $('#mBusinesses').textContent=state.businesses.length;
  $('#fRevenue').textContent=money(state.finance.booked_revenue_cents);
  $('#fCommission').textContent=money(state.finance.broker_commission_cents);

  $('#prospects').innerHTML=state.prospects.map(p=>`<tr data-id="${p.id}">
    <td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.city||'')}${p.state?', '+esc(p.state):''}</div></td>
    <td><span class="pill">${interest(p)}</span></td>
    <td><select class="p-stage">${stageOptions(p.stage)}</select></td>
    <td>
      <input class="p-score" type="number" min="0" max="100" value="${p.score??''}" placeholder="Score">
      ${p.host_interest?`<label class="micro-field"><span>Host $ / TV / yr</span><input class="p-host-pay" type="number" min="0" max="599" step="1" value="${Number(p.host_annual_pay_cents||0)/100}"></label>`:''}
    </td>
    <td><input class="p-follow" type="datetime-local" value="${dtLocal(p.next_follow_up_at)}"></td>
    <td><div class="action-stack"><button class="save-prospect">Save</button>${p.stage==='won'?'':`<button class="secondary promote-prospect">Promote</button>`}</div></td>
  </tr>`).join('')||'<tr><td colspan="6" class="muted">No leads yet. Add your first one above.</td></tr>';

  $('#businesses').innerHTML=state.businesses.map(b=>{
    const caps=[b.is_host?'HOST':'',b.is_advertiser?'ADVERTISER':''].filter(Boolean).join(' + ');
    const locations=(b.locations||[]).map(l=>`<div class="muted">${esc([l.address_line1,l.city,l.state].filter(Boolean).join(', '))}${b.is_host?` · host offer ${money(l.host_annual_pay_cents)}/TV/year`:''}</div>`).join('');
    return `<div class="media-item"><strong>${esc(b.name)}</strong> <span class="pill">${caps}</span>${locations}</div>`;
  }).join('')||'<div class="muted">No customers yet. Promote a won lead to create one.</div>';

  const advertisers=state.businesses.filter(b=>b.is_advertiser);
  $('#campaignBusiness').innerHTML='<option value="">Choose advertiser…</option>'+
    advertisers.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');

  $('#campaigns').innerHTML=state.campaigns.map(c=>{
    const b=state.businesses.find(x=>x.id===c.advertiser_business_id);
    const commission=Math.round(Number(c.price_cents||0)*Number(c.broker_commission_percent||0)/100);
    return `<div class="media-item">
      <div class="row">
        <div><strong>${esc(c.name)}</strong><div class="muted">${esc(b?.name||'Advertiser')}</div></div>
        <div><span class="pill">${esc(c.status)}</span></div>
      </div>
      <div class="row deal-math">
        <div><strong>${money(c.price_cents)}</strong><span class="muted">contract</span></div>
        <div><strong>${Number(c.broker_commission_percent||0)}%</strong><span class="muted">commission rate</span></div>
        <div><strong>${money(commission)}</strong><span class="muted">commission</span></div>
      </div>
    </div>`;
  }).join('')||'<div class="muted">No campaigns yet.</div>';
}

async function load(){
  if(!readSession()?.access_token){location.replace('/login.html');return;}
  $('#error').textContent='';
  try{
    const me=await api('/api/auth/me');
    if(!['broker','owner','admin'].includes(me.access?.internal_role)){
      location.replace('/portal.html');
      return;
    }
    if(['owner','admin'].includes(me.access?.internal_role)){
      location.replace('/admin.html');
      return;
    }
    state.me=me;
    $('#brokerWho').textContent=me.user?.full_name||me.user?.email||'Broker';

    const [prospects,businesses,campaigns,finance]=await Promise.all([
      api('/api/broker/prospects'),
      api('/api/broker/businesses'),
      api('/api/broker/campaigns'),
      api('/api/broker/finance')
    ]);
    Object.assign(state,{prospects,businesses,campaigns,finance});
    render();
  }catch(e){
    $('#error').textContent=e.message;
    if(String(e.message).includes('401')) location.replace('/login.html');
  }
}

$('#newProspect').onsubmit=async e=>{
  e.preventDefault();
  const f=e.target, fd=new FormData(f), body=Object.fromEntries(fd.entries());
  body.advertiser_interest=f.elements.advertiser_interest.checked;
  body.host_interest=f.elements.host_interest.checked;
  body.host_annual_pay_cents=Math.round(Number(body.host_annual_pay_dollars||0)*100);
  delete body.host_annual_pay_dollars;
  try{
    $('#prospectMessage').textContent='Saving…';
    await api('/api/broker/prospects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    f.reset();
    f.elements.city.value='North Myrtle Beach';
    f.elements.state.value='SC';
    f.elements.advertiser_interest.checked=true;
    $('#prospectMessage').textContent='Lead added.';
    await load();
  }catch(err){$('#prospectMessage').textContent=err.message;}
};

$('#prospects').onclick=async e=>{
  const row=e.target.closest('tr');
  if(!row)return;
  if(e.target.matches('.save-prospect')){
    const follow=row.querySelector('.p-follow').value;
    await api(`/api/broker/prospects/${row.dataset.id}`,{
      method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        stage:row.querySelector('.p-stage').value,
        score:row.querySelector('.p-score').value||0,
        host_annual_pay_cents:Math.round(Number(row.querySelector('.p-host-pay')?.value||0)*100),
        next_follow_up_at:follow?new Date(follow).toISOString():null
      })
    });
    await load();
  }
  if(e.target.matches('.promote-prospect')){
    e.target.disabled=true;
    try{
      await api(`/api/broker/prospects/${row.dataset.id}/promote`,{method:'POST'});
      await load();
    }catch(err){$('#error').textContent=err.message;e.target.disabled=false;}
  }
};

$('#newCampaign').onsubmit=async e=>{
  e.preventDefault();
  const f=e.target, fd=new FormData(f), body=Object.fromEntries(fd.entries());
  body.price_cents=body.price_dollars===''?null:Math.round(Number(body.price_dollars||0)*100);
  delete body.price_dollars;
  body.starts_at=body.starts_at?new Date(body.starts_at).toISOString():null;
  body.ends_at=body.ends_at?new Date(body.ends_at).toISOString():null;
  try{
    $('#campaignMessage').textContent='Saving…';
    await api('/api/broker/campaigns',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    f.reset();
    $('#campaignMessage').textContent='Campaign created.';
    await load();
  }catch(err){$('#campaignMessage').textContent=err.message;}
};

$('#accountButton').onclick=()=>location.href='/account.html';
$('#logoutButton').onclick=()=>sessionLogout();
load();
