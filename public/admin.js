const $ = s => document.querySelector(s);
const state = { token: sessionStorage.getItem('adminToken') || '', screens:[], media:[], playlists:[] };
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

async function load(){
  if(!state.token) return;
  $('#error').textContent='';
  try {
    const [stats,screens,media,playlists] = await Promise.all([api('/api/admin/stats'),api('/api/admin/screens'),api('/api/admin/media'),api('/api/admin/playlists')]);
    Object.assign(state,{screens,media,playlists});
    $('#mScreens').textContent=stats.screens; $('#mOnline').textContent=stats.online; $('#mMedia').textContent=stats.media; $('#mPlays').textContent=stats.plays_24h;
    render();
  } catch(e){ $('#error').textContent=e.message; }
}

function playlistOptions(selected=''){
  return `<option value="">No playlist</option>` + state.playlists.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');
}
function render(){
  $('#screens').innerHTML = state.screens.map(s=>`<tr data-id="${s.id}"><td><span class="pill ${online(s.last_seen_at)?'online':'offline'}">${online(s.last_seen_at)?'ONLINE':'OFFLINE'}</span></td><td><strong>${esc(s.pair_code)}</strong></td><td><input class="s-name" value="${esc(s.name||'')}"></td><td><input class="s-location" value="${esc(s.location||'')}"></td><td><select class="s-playlist">${playlistOptions(s.playlist_id)}</select></td><td><button class="save-screen">Save</button></td></tr>`).join('');
  $('#media').innerHTML = state.media.map(m=>`<div class="media-item"><strong>${esc(m.name)}</strong> <span class="pill">${m.media_type}</span><div class="muted">${m.duration_seconds}s · ${(m.bytes/1024/1024).toFixed(2)} MB · ${m.id}</div></div>`).join('') || '<div class="muted">No media yet.</div>';
  $('#playlists').innerHTML = state.playlists.map(p=>`<div class="playlist" data-id="${p.id}"><div class="row"><div><strong>${esc(p.name)}</strong><div class="muted">Revision ${p.revision}</div></div><button class="secondary add-media">Add selected media</button></div><select class="media-picker" style="margin-top:10px">${state.media.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select><ol>${(p.items||[]).map(i=>`<li>${esc(i.name)} <button class="secondary remove-item" data-media="${i.media_id}" style="padding:4px 7px">remove</button></li>`).join('')}</ol></div>`).join('') || '<div class="muted">No playlists yet.</div>';
}

$('#saveToken').onclick=()=>{ state.token=$('#token').value.trim(); sessionStorage.setItem('adminToken',state.token); load(); };
$('#upload').onsubmit=async e=>{ e.preventDefault(); try { await api('/api/admin/media',{method:'POST',body:new FormData(e.target)}); e.target.reset(); await load(); } catch(err){ $('#error').textContent=err.message; } };
$('#newPlaylist').onsubmit=async e=>{ e.preventDefault(); const name=new FormData(e.target).get('name'); try { await api('/api/admin/playlists',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})}); e.target.reset(); await load(); } catch(err){ $('#error').textContent=err.message; } };

document.addEventListener('click', async e=>{
  if(e.target.matches('.save-screen')){
    const row=e.target.closest('tr');
    await api(`/api/admin/screens/${row.dataset.id}/assign`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({name:row.querySelector('.s-name').value,location:row.querySelector('.s-location').value,playlist_id:row.querySelector('.s-playlist').value||null})});
    await load();
  }
  if(e.target.matches('.add-media')){
    const box=e.target.closest('.playlist'), p=state.playlists.find(x=>x.id===box.dataset.id), mediaId=box.querySelector('.media-picker').value;
    if(!mediaId) return;
    const items=[...(p.items||[]).map(i=>({media_id:i.media_id,duration_seconds:i.duration_seconds})),{media_id:mediaId}];
    await api(`/api/admin/playlists/${p.id}/items`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({items})}); await load();
  }
  if(e.target.matches('.remove-item')){
    const box=e.target.closest('.playlist'), p=state.playlists.find(x=>x.id===box.dataset.id), target=e.target.dataset.media;
    let removed=false; const items=(p.items||[]).filter(i=>{ if(!removed && i.media_id===target){removed=true;return false;} return true; }).map(i=>({media_id:i.media_id,duration_seconds:i.duration_seconds}));
    await api(`/api/admin/playlists/${p.id}/items`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({items})}); await load();
  }
});

load(); setInterval(load,30000);
