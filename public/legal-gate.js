const legalEsc=v=>String(v??"").replace(
  /[&<>"']/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])
);

function legalToken(){
  for(const key of [
    "coastloop_access_token",
    "access_token",
    "sb-access-token"
  ]){
    const v=localStorage.getItem(key)||sessionStorage.getItem(key);
    if(v) return v;
  }
  return null;
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
  .cl-legal-gate{position:fixed;inset:0;z-index:2147483646;
    background:rgba(15,17,18,.86);display:grid;place-items:center;
    padding:18px}
  .cl-legal-card{width:min(760px,100%);max-height:92vh;
    background:#fff;color:#171412;border-radius:18px;
    display:flex;flex-direction:column;box-shadow:0 30px 90px #0008}
  .cl-legal-head{padding:22px 24px 12px}
  .cl-legal-head h2{margin:0 0 5px}
  .cl-legal-body{margin:0 24px;padding:18px;border:1px solid #ddd;
    border-radius:12px;overflow:auto;min-height:180px;max-height:52vh}
  .cl-legal-actions{padding:16px 24px 22px;display:flex;
    gap:12px;align-items:center;justify-content:space-between}
  .cl-legal-actions button{padding:12px 18px;border:0;
    border-radius:10px;font-weight:800;cursor:pointer}
  .cl-legal-accept{background:#171412;color:#fff}
  .cl-legal-version{font-size:12px;opacity:.65}
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
        <div class="cl-legal-version">
          Required terms · version ${terms.version}
        </div>
        <h2 id="clLegalTitle">${legalEsc(terms.title)}</h2>
        <p>Review and accept these terms before continuing.</p>
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
