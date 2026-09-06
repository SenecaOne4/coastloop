import {api,logout} from '/session.js';
const $=s=>document.querySelector(s);
try{
 const me=await api('/api/auth/me');
 $('#who').textContent=`${me.user.full_name||me.user.email} · ${me.user.email}`;
 $('#back').onclick=()=>location.href=me.access.internal_role?'/admin':'/portal';
}catch{location.replace('/login')}
$('#password').onsubmit=async e=>{
 e.preventDefault();const f=new FormData(e.target);
 if(f.get('password')!==f.get('confirm')){$('#msg').textContent='Passwords do not match.';return}
 try{await api('/api/auth/password',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({password:f.get('password')})});e.target.reset();$('#msg').textContent='Password updated.'}
 catch(err){$('#msg').textContent=err.message}
};
$('#logout').onclick=async()=>{await logout();location.replace('/login')};
