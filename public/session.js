const KEY='coastloop.auth.v1';

export function readSession(){
  try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}
}
export function saveSession(s){
  if(!s?.access_token)return null;
  const x={...s,expires_at:Number(s.expires_at||0)||Math.floor(Date.now()/1000)+Number(s.expires_in||3600)};
  localStorage.setItem(KEY,JSON.stringify(x));
  return x;
}
export function clearSession(){localStorage.removeItem(KEY)}
export function token(){
  return readSession()?.access_token||sessionStorage.getItem('adminToken')||'';
}
export async function request(path,opt={},retry=true){
  const headers=new Headers(opt.headers||{});
  const t=token(); if(t)headers.set('authorization',`Bearer ${t}`);
  let r=await fetch(path,{...opt,headers});
  if(r.status===401&&retry&&readSession()?.refresh_token){
    const current=readSession();
    const rr=await fetch('/api/auth/refresh',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({refresh_token:current.refresh_token})
    });
    const d=await rr.json().catch(()=>({}));
    if(rr.ok&&d.session){saveSession(d.session);return request(path,opt,false)}
    clearSession();
  }
  return r;
}
export async function api(path,opt={}){
  const r=await request(path,opt);
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||String(r.status));
  return d;
}
export async function logout(){
  try{await request('/api/auth/logout',{method:'POST'},false)}catch{}
  clearSession();
  sessionStorage.removeItem('adminToken');
}
