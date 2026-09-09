import {api,logout} from '/session.js';

const $=s=>document.querySelector(s);

async function load(){
  try{
    const me=await api('/api/auth/me');
    const user=me.user||{};
    const label=user.full_name||user.email||'CoastLoop account';
    $('#who').textContent=user.email&&label!==user.email
      ? `${label} · ${user.email}`
      : label;
    $('#back').onclick=()=>{
      location.href=me.access?.internal_role?'/admin':'/portal';
    };
  }catch{
    location.replace('/login?next=%2Faccount');
  }
}

$('#password').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const password=String(f.get('password')||'');
  const confirm=String(f.get('confirm')||'');
  const msg=$('#msg');

  if(password!==confirm){
    msg.textContent='Passwords do not match.';
    return;
  }

  try{
    await api('/api/auth/password',{
      method:'PUT',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({password})
    });
    e.target.reset();
    msg.textContent='Password updated.';
  }catch(err){
    msg.textContent=err.message||'Could not update password.';
  }
};

$('#logout').onclick=async()=>{
  await logout();
  location.replace('/login');
};

load();
