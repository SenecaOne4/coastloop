import {saveSession,readSession} from '/session.js';
const $=s=>document.querySelector(s);
if(readSession()?.access_token) location.replace('/admin');

const config=await fetch('/api/auth/config').then(r=>r.json()).catch(()=>({}));
if(config.bootstrap_required){
  $('#normal').hidden=true; $('#bootstrap').hidden=false;
  const old=sessionStorage.getItem('adminToken');
  if(old){$('#setupKey').value=old;$('#setupKey').closest('input').hidden=true}
}
if(config.google_enabled)$('#googleWrap').hidden=false;

$('#login').onsubmit=async e=>{
  e.preventDefault();$('#msg').textContent='Signing in…';
  const f=new FormData(e.target);
  const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({email:f.get('email'),password:f.get('password')})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){$('#msg').textContent=d.error||'Sign in failed';return}
  saveSession(d.session);
  location.replace(d.access?.internal_role?'/admin':'/portal');
};

$('#owner').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  if(f.get('password')!==f.get('confirm')){$('#msg').textContent='Passwords do not match.';return}
  const key=String(f.get('setup_key')||sessionStorage.getItem('adminToken')||'').trim();
  if(!key){$('#msg').textContent='Legacy admin key required for first setup.';return}
  $('#msg').textContent='Creating owner…';
  const r=await fetch('/api/auth/bootstrap-owner',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':`Bearer ${key}`},
    body:JSON.stringify({full_name:f.get('full_name'),email:f.get('email'),password:f.get('password')})
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok){$('#msg').textContent=d.error||'Setup failed';return}
  saveSession(d.session);
  sessionStorage.removeItem('adminToken');
  location.replace('/admin');
};

$('#google').onclick=()=>location.href='/api/auth/google';


const inviteEmail=new URLSearchParams(location.search).get('invite');
if(inviteEmail){
  const box=$('#inviteActivation');
  if(box){
    box.open=true;
    const input=box.querySelector('input[name="email"]');
    if(input)input.value=inviteEmail;
  }
}

$('#activate').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  if(f.get('password')!==f.get('confirm')){
    $('#msg').textContent='Passwords do not match.';
    return;
  }

  $('#msg').textContent='Activating account…';

  const r=await fetch('/api/auth/signup',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      full_name:f.get('full_name'),
      email:f.get('email'),
      password:f.get('password')
    })
  });

  const d=await r.json().catch(()=>({}));

  if(!r.ok){
    $('#msg').textContent=d.error||'Activation failed';
    return;
  }

  if(d.confirmation_required){
    $('#msg').textContent=d.message||'Check your email to confirm the account.';
    return;
  }

  saveSession(d.session);
  location.replace(d.access?.internal_role?'/admin.html':'/portal.html');
};
