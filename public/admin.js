const $ = s => document.querySelector(s);
const state = { token: sessionStorage.getItem('adminToken') || '', screens:[], media:[], playlists:[], prospects:[], businesses:[], campaigns:[] };
$('#token').value = state.token;

function authHeaders(extra={}) { return { authorization:`Bearer ${state.token}`, ...extra }; }
async function api(path, options={}) {
  const res = await fetch(path, { ...options, headers: authHeaders(options.headers || {}) });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
}
function esc(v=''){ return String(v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function online(ts){ return ts && (Date.now() - new Date(ts).getTime()) < 120000; }

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
  if(!state.token) return;
  $('#error').textContent='';
  try {
    const [stats,screens,media,playlists,prospects,businesses,campaigns] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/screens'),
      api('/api/admin/media'),
      api('/api/admin/playlists'),
      api('/api/admin/prospects'),
      api('/api/admin/businesses'),
      api('/api/admin/campaigns')
    ]);
    Object.assign(state,{screens,media,playlists,prospects,businesses,campaigns});
    $('#mScreens').textContent=stats.screens; $('#mOnline').textContent=stats.online; $('#mMedia').textContent=stats.media; $('#mPlays').textContent=stats.plays_24h; $('#mProspects').textContent=prospects.length; $('#mBusinesses').textContent=businesses.length;
    render();
    renderProspectMap();
  } catch(e){ $('#error').textContent=e.message; }
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

function render(){
  $('#prospects').innerHTML = state.prospects.map(p=>`<tr data-id="${p.id}">
    <td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.city||'')}${p.state?', '+esc(p.state):''}</div></td>
    <td><span class="pill">${prospectInterest(p)}</span></td>
    <td>${esc(p.contact_name||'')}<div class="muted">${esc(p.phone||p.email||'')}</div></td>
    <td><select class="p-stage">${stageOptions(p.stage)}</select></td>
    <td><input class="p-score" type="number" min="0" max="100" value="${p.score??''}" style="width:76px"></td>
    <td><input class="p-follow" type="datetime-local" value="${p.next_follow_up_at ? new Date(p.next_follow_up_at).toISOString().slice(0,16) : ''}"></td>
    <td><div class="row"><button class="save-prospect">Save</button>${p.stage==='won'?'':`<button class="secondary promote-prospect">Promote</button>`}</div></td>
  </tr>`).join('') || '<tr><td colspan="7" class="muted">No prospects yet.</td></tr>';
  $('#businesses').innerHTML = state.businesses.map(b=>`
    <div class="media-item">
      <div class="row">
        <div>
          <strong>${esc(b.name)}</strong>
          <span class="pill">${esc(b.category||'business')}</span>
          <div class="muted">${esc(b.contact_name||'')}${b.phone?' · '+esc(b.phone):''}${b.email?' · '+esc(b.email):''}</div>
        </div>
        <div class="muted">${(b.locations||[]).length} location${(b.locations||[]).length===1?'':'s'}</div>
      </div>
      ${(b.locations||[]).map(l=>`<div class="muted">${esc([l.address_line1,l.city,l.state].filter(Boolean).join(', '))} · ${esc(l.host_status||'')}</div>`).join('')}
    </div>`).join('') || '<div class="muted">No customers yet. Promote a prospect when they convert.</div>';

  $('#campaignBusiness').innerHTML = '<option value="">Choose advertiser…</option>' +
    state.businesses.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');

  $('#campaigns').innerHTML = state.campaigns.map(c=>{
    const b=state.businesses.find(x=>x.id===c.advertiser_business_id);
    const price=c.price_cents==null?'—':('$'+(Number(c.price_cents)/100).toLocaleString());
    return `<div class="media-item"><div class="row"><div><strong>${esc(c.name)}</strong><div class="muted">${esc(b?.name||'Unknown advertiser')}</div></div><div><span class="pill">${esc(c.status)}</span> <strong>${price}</strong></div></div></div>`;
  }).join('') || '<div class="muted">No campaigns yet.</div>';

  $('#screens').innerHTML = state.screens.map(s=>`<tr data-id="${s.id}"><td><span class="pill ${online(s.last_seen_at)?'online':'offline'}">${online(s.last_seen_at)?'ONLINE':'OFFLINE'}</span></td><td><strong>${esc(s.pair_code)}</strong></td><td><input class="s-name" value="${esc(s.name||'')}"></td><td><input class="s-location" value="${esc(s.location||'')}"></td><td><select class="s-playlist">${playlistOptions(s.playlist_id)}</select></td><td><button class="save-screen">Save</button></td></tr>`).join('');
  $('#media').innerHTML = state.media.map(m=>`<div class="media-item"><strong>${esc(m.name)}</strong> <span class="pill">${m.media_type}</span><div class="muted">${m.duration_seconds}s · ${(m.bytes/1024/1024).toFixed(2)} MB · ${m.id}</div></div>`).join('') || '<div class="muted">No media yet.</div>';
  $('#playlists').innerHTML = state.playlists.map(p=>`<div class="playlist" data-id="${p.id}">
    <div class="row">
      <div><strong>${esc(p.name)}</strong><div class="muted">Revision ${p.revision}</div></div>
      <button class="secondary add-media">Add selected media</button>
    </div>
    <div class="row" style="margin-top:10px">
      <select class="media-picker">${state.media.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
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

$('#saveToken').onclick=()=>{ state.token=$('#token').value.trim(); sessionStorage.setItem('adminToken',state.token); load(); };
$('#upload').onsubmit=async e=>{ e.preventDefault(); try { await api('/api/admin/media',{method:'POST',body:new FormData(e.target)}); e.target.reset(); await load(); } catch(err){ $('#error').textContent=err.message; } };
$('#newPlaylist').onsubmit=async e=>{ e.preventDefault(); const name=new FormData(e.target).get('name'); try { await api('/api/admin/playlists',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})}); e.target.reset(); await load(); } catch(err){ $('#error').textContent=err.message; } };

document.addEventListener('click', async e=>{
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
        next_follow_up_at:follow ? new Date(follow).toISOString() : null
      })
    });
    await load();
  }
  if(e.target.matches('.save-screen')){
    const row=e.target.closest('tr');
    await api(`/api/admin/screens/${row.dataset.id}/assign`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({name:row.querySelector('.s-name').value,location:row.querySelector('.s-location').value,playlist_id:row.querySelector('.s-playlist').value||null})});
    await load();
  }
  if(e.target.matches('.add-media')){
    const box=e.target.closest('.playlist'), p=state.playlists.find(x=>x.id===box.dataset.id), mediaId=box.querySelector('.media-picker').value, campaignId=box.querySelector('.campaign-picker').value;
    if(!mediaId) return;
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
    price_cents:dollars===''?null:Math.round(Number(dollars)*100)
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
