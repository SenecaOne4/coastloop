import {saveSession,readSession} from '/session.js';
const $=s=>document.querySelector(s);
function homeFor(access){
  if(access?.internal_role==='broker') return '/broker.html';
  if(access?.internal_role) return '/admin.html';
  return '/portal.html';
}

const requestedNext=new URLSearchParams(location.search).get('next')||'';
const validNext=value=>value.startsWith('/')&&!value.startsWith('//')?value:'';
async function routeAfterLogin(fallback){
 const session=readSession();if(!session?.access_token){location.replace(fallback);return;}
 const next=validNext(requestedNext)||fallback||'/login';
 const r=await fetch('/api/auth/nda/status',{headers:{authorization:`Bearer ${session.access_token}`}});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){$('#msg').textContent=d.error==='nda_status_unavailable'?'Could not verify NDA acceptance. Please retry.':(d.error||'Could not verify account.');return;}
 if(d.nda?.required&&(!d.nda.configured||!d.nda.accepted)){location.replace('/nda.html?next='+encodeURIComponent(next));return;}
 if(next){location.replace(next);return;}
 const me=await fetch('/api/auth/me',{headers:{authorization:'Bearer '+session.access_token}});
 const account=await me.json().catch(()=>({}));
 if(me.ok)location.replace(homeFor(account.access));else $('#msg').textContent=account.error||'Could not load account.';
}
if(readSession()?.access_token)routeAfterLogin(null);

const config=await fetch('/api/auth/config').then(r=>r.json()).catch(()=>({}));
if(config.bootstrap_required){
  $('#normal').hidden=true; $('#bootstrap').hidden=false;
  const old=sessionStorage.getItem('adminToken');
  if(old){$('#setupKey').value=old;$('#setupKey').closest('input').hidden=true}
}
if(config.genny_auth_enabled)$('#googleWrap').hidden=false;

$('#login').onsubmit=async e=>{
  e.preventDefault();$('#msg').textContent='Signing in…';
  const f=new FormData(e.target);
  const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({email:f.get('email'),password:f.get('password')})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){$('#msg').textContent=d.error||'Sign in failed';return}
  saveSession(d.session);
  routeAfterLogin(homeFor(d.access));
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
  routeAfterLogin('/admin');
};

$('#google').onclick=()=>location.href='/api/auth/genny'+(validNext(requestedNext)?'?next='+encodeURIComponent(validNext(requestedNext)):'');


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
  routeAfterLogin(homeFor(d.access));
};
