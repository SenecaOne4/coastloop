import {saveSession,readSession} from '/session.js';
const $=s=>document.querySelector(s);
const requestedNext=(()=>{const n=new URLSearchParams(location.search).get('next');return n&&n.startsWith('/')&&!n.startsWith('//')?n:'/portal.html';})();
function homeFor(access){
  if(access?.internal_role==='broker') return '/broker.html';
  if(access?.internal_role) return '/admin.html';
  return '/portal.html';
}

if(readSession()?.access_token){
  fetch('/api/auth/me',{headers:{authorization:`Bearer ${readSession().access_token}`}})
    .then(r=>r.ok?r.json():null)
    .then(d=>{ if(d?.access) location.replace(requestedNext); })
    .catch(()=>{});
}

const config=await fetch('/api/auth/config').then(r=>r.json()).catch(()=>({}));
if(config.bootstrap_required){
  $('#normal').hidden=true; $('#bootstrap').hidden=false;
  const old=sessionStorage.getItem('adminToken');
  if(old){$('#setupKey').value=old;$('#setupKey').closest('input').hidden=true}
}
if(config.genny_auth_enabled)$('#googleWrap').hidden=false;

let signupMode=false;

$('#authToggle').onclick=e=>{
  e.preventDefault();
  signupMode=!signupMode;
  $('#authLogin').hidden=signupMode;
  $('#authSignup').hidden=!signupMode;
  $('#authTitle').textContent=signupMode?'Create your CoastLoop account':'Log in';
  $('#authPrompt').textContent=signupMode?'Already have an account?':'New to CoastLoop?';
  $('#authToggle').textContent=signupMode?'Sign in':'Create an account';
  $('#googleWrap').hidden=signupMode;
  $('#inviteActivation').hidden=true;
  $('#msg').textContent='';
};

$('#login').onsubmit=async e=>{
  e.preventDefault();$('#msg').textContent='Signing in…';
  const f=new FormData(e.target);
  const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({email:f.get('email'),password:f.get('password')})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){$('#msg').textContent=d.error||'Sign in failed';return}
  saveSession(d.session);
  location.replace(requestedNext);
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

$('#google').onclick=()=>location.href='/api/auth/genny?next='+encodeURIComponent(requestedNext);

$('#signup').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  if(f.get('password')!==f.get('confirm')){
    $('#msg').textContent='Passwords do not match.';
    return;
  }
  $('#msg').textContent='Creating your account…';

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
    $('#msg').textContent=d.error||'Could not create account';
    return;
  }

  if(d.confirmation_required){
    $('#msg').textContent=d.message||'Check your email to confirm your CoastLoop account, then sign in.';
    return;
  }

  if(d.session){
    saveSession(d.session);
    location.replace(requestedNext);
    return;
  }

  $('#msg').textContent='Account created. Sign in to continue.';
  $('#authToggle').click();
};


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
  location.replace(requestedNext || '/portal.html');
};
