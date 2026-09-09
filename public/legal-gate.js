const legalEsc=v=>String(v??"").replace(
  /[&<>"']/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])
);

function legalToken(){
  try{
    const session=JSON.parse(
      localStorage.getItem("coastloop.auth.v1") || "null"
    );
    if(session?.access_token) return session.access_token;
  }catch{}

  for(const key of [
    "coastloop_access_token",
    "access_token",
    "sb-access-token"
  ]){
    const v=localStorage.getItem(key)||sessionStorage.getItem(key);
    if(v) return v;
  }

  return sessionStorage.getItem("adminToken") || null;
}

async function legalFetch(path,options={}){
  const token=legalToken();
  const headers={...(options.headers||{})};
  if(token) headers.authorization=`Bearer ${token}`;
  return fetch(path,{...options,headers});
}

function legalGateStyle(){
  if(document.getElementById("coastloopLegalGateStyle")) return;
  const style=document.createElement("style");
  style.id="coastloopLegalGateStyle";
  style.textContent=`
  .cl-legal-gate{
    position:fixed;inset:0;z-index:2147483646;
    background:rgba(18,16,14,.76);
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    display:grid;place-items:center;padding:24px;
    font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif
  }
  .cl-legal-card{
    width:min(820px,100%);max-height:min(90vh,920px);
    background:#fbfaf7;color:#171412;border-radius:24px;
    display:flex;flex-direction:column;overflow:hidden;
    border:1px solid rgba(23,20,18,.10);
    box-shadow:0 32px 100px rgba(0,0,0,.34)
  }
  .cl-legal-head{
    padding:30px 32px 20px;
    border-bottom:1px solid rgba(23,20,18,.08)
  }
  .cl-legal-brand{
    font-size:11px;font-weight:850;letter-spacing:.16em;
    text-transform:uppercase;color:#7b243c;margin-bottom:12px
  }
  .cl-legal-version{
    display:inline-flex;align-items:center;
    padding:6px 10px;border-radius:999px;
    background:#f0ebe3;color:#6b625b;
    font-size:11px;font-weight:750;letter-spacing:.03em;
    margin-bottom:13px
  }
  .cl-legal-head h2{
    margin:0;color:#171412;font-size:clamp(25px,3vw,34px);
    line-height:1.08;letter-spacing:-.035em;font-weight:800
  }
  .cl-legal-head p{
    margin:10px 0 0;color:#675f58;font-size:14px;line-height:1.55
  }
  .cl-legal-body{
    margin:20px 24px 0;padding:22px 24px;
    border:1px solid rgba(23,20,18,.10);
    border-radius:16px;background:#fff;overflow:auto;
    min-height:220px;max-height:52vh;
    color:#37312d;font-size:14px;line-height:1.68
  }
  .cl-legal-body h1,.cl-legal-body h2,.cl-legal-body h3{
    color:#171412;line-height:1.22;margin:1.4em 0 .55em
  }
  .cl-legal-body h1:first-child,.cl-legal-body h2:first-child,
  .cl-legal-body h3:first-child{margin-top:0}
  .cl-legal-body p{margin:.65em 0}
  .cl-legal-body a{color:#7b243c;text-underline-offset:2px}
  .cl-legal-body::-webkit-scrollbar{width:8px}
  .cl-legal-body::-webkit-scrollbar-thumb{
    background:#d7d0c7;border-radius:20px
  }
  .cl-legal-actions{
    padding:20px 24px 24px;display:flex;gap:12px;
    align-items:center;justify-content:flex-end
  }
  .cl-legal-actions button{
    min-height:46px;padding:0 19px;border-radius:12px;
    font:inherit;font-size:14px;font-weight:800;cursor:pointer;
    transition:transform .15s ease,box-shadow .15s ease,background .15s ease
  }
  .cl-legal-actions button:hover{transform:translateY(-1px)}
  #clLegalLogout{
    border:1px solid rgba(23,20,18,.14);
    background:transparent;color:#4f4842
  }
  .cl-legal-accept{
    border:1px solid #171412;background:#171412;color:#fff;
    box-shadow:0 8px 22px rgba(23,20,18,.16)
  }
  .cl-legal-accept:hover{background:#29231f}
  .cl-legal-actions button:disabled{opacity:.58;cursor:wait;transform:none}
  @media(max-width:640px){
    .cl-legal-gate{padding:12px}
    .cl-legal-card{max-height:94vh;border-radius:18px}
    .cl-legal-head{padding:23px 20px 17px}
    .cl-legal-body{margin:14px 14px 0;padding:18px;max-height:54vh}
    .cl-legal-actions{padding:16px 14px 18px}
    .cl-legal-actions button{flex:1}
  }
  `;
  document.head.appendChild(style);
}

async function showLegalGate(payload){
  legalGateStyle();
  const terms=payload.terms;
  const gate=document.createElement("div");
  gate.className="cl-legal-gate";
  gate.innerHTML=`
    <section class="cl-legal-card" role="dialog"
      aria-modal="true" aria-labelledby="clLegalTitle">
      <header class="cl-legal-head">
        <div class="cl-legal-brand">CoastLoop</div>
        <div class="cl-legal-version">
          Required terms · version ${terms.version}
        </div>
        <h2 id="clLegalTitle">${legalEsc(terms.title)}</h2>
        <p>Please review the agreement below. Acceptance is required to continue to your CoastLoop account.</p>
      </header>
      <div class="cl-legal-body">${terms.body_html}</div>
      <footer class="cl-legal-actions">
        <button type="button" id="clLegalLogout">Sign out</button>
        <button type="button" class="cl-legal-accept"
          id="clLegalAccept">I agree & continue</button>
      </footer>
    </section>`;
  document.body.appendChild(gate);
  document.documentElement.style.overflow="hidden";

  gate.querySelector("#clLegalLogout").onclick=()=>{
    localStorage.clear();
    sessionStorage.clear();
    location.href="/login";
  };

  gate.querySelector("#clLegalAccept").onclick=async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    button.textContent="Saving…";
    try{
      const res=await legalFetch("/api/legal/accept",{method:"POST"});
      const out=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(out.error||String(res.status));
      gate.remove();
      document.documentElement.style.overflow="";
    }catch(err){
      button.disabled=false;
      button.textContent="I agree & continue";
      alert(`Could not save acceptance: ${err.message}`);
    }
  };
}

async function initLegalGate(){
  try{
    const res=await legalFetch("/api/legal/current");
    if(res.status===401) return;
    const data=await res.json().catch(()=>({}));
    if(!res.ok) return;
    if(data.required && !data.accepted && data.terms){
      await showLegalGate(data);
    }
  }catch(err){
    console.error("LEGAL_GATE",err);
  }
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",initLegalGate);
}else{
  initLegalGate();
}
