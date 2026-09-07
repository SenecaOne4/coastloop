import {readSession} from '/session.js';

const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const money=c=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(c||0)/100);
const params=new URLSearchParams(location.search);
const wanted=params.get("package");
const wantedPlan=params.get("plan");
let rows=[],selected=null;

function selectPackage(p,scroll=true){
  selected=p;
  document.querySelectorAll(".pack").forEach(x=>x.classList.toggle("selected",x.dataset.id===p.package_id));
  $("chosen").textContent=`Claim ${p.name}`;
  $("claimCopy").textContent=`${money(p.price_cents)} for ${p.term_days||30} days. Creative and verified-delivery reporting included.`;
  $("reserve").textContent=`Reserve ${p.name}`;
  if(scroll)$("claim").scrollIntoView({behavior:"smooth",block:"center"});
  history.replaceState(null,"",`/advertise?plan=${encodeURIComponent(p.package_key)}`);
}

async function loadProducts(){
  const r=await fetch("/api/public/packages",{cache:"no-store"});
  const d=await r.json();
  rows=d.packages||[];
  if(!rows.length){
    $("packs").innerHTML='<article class="pack"><h2>Inventory commissioning</h2><p class="spec">We are not displaying fake inventory. New CoastLoop placements will appear here as they are commissioned.</p></article>';
    $("reserve").disabled=true;
    return;
  }
  $("packs").innerHTML=rows.map(p=>`<article class="pack" data-id="${esc(p.package_id)}">
    <div class="eyebrow">${esc((p.metadata||{}).badge||"FOUNDING OFFER")}</div>
    <h2>${esc(p.name)}</h2>
    <div class="price">${money(p.price_cents)} <small>/ ${p.term_days||30} days</small></div>
    <div class="spec">
      ${p.screen_count?`${p.screen_count} commissioned screen${p.screen_count===1?"":"s"}<br>`:"Eligible commissioned market screens<br>"}
      ${esc(p.ad_length_seconds)}-second creative<br>
      Creative production included<br>
      Verified-delivery reporting
    </div>
    <button class="btn" data-pick="${esc(p.package_id)}">Choose ${esc(p.name)}</button>
  </article>`).join("");

  $("packs").onclick=e=>{
    const b=e.target.closest("[data-pick]");
    if(!b)return;
    const p=rows.find(x=>x.package_id===b.dataset.pick);
    if(p)selectPackage(p,true);
  };

  const initial=rows.find(x =>
    (wanted && x.package_id===wanted) ||
    (wantedPlan && x.package_key===wantedPlan)
  );
  if(initial)selectPackage(initial,false);
}

async function loadIdentity(){
  const config=await fetch("/api/auth/config").then(r=>r.json()).catch(()=>({}));
  if(config.google_enabled){
    $("google").classList.add("on");
    $("or").classList.add("on");
    $("google").onclick=()=>{
      const next=selected?`/advertise?plan=${encodeURIComponent(selected.package_key)}`:"/advertise";
      location.href=`/api/auth/google?next=${encodeURIComponent(next)}`;
    };
  }

  const s=readSession();
  if(!s?.access_token)return;
  const r=await fetch("/api/auth/identity",{headers:{authorization:`Bearer ${s.access_token}`}});
  if(!r.ok)return;
  const d=await r.json();
  if(d?.user?.email)$("email").value=d.user.email;
}

$("reserve").onclick=async()=>{
  $("status").textContent="";
  if(!selected){$("status").textContent="Choose a plan first.";return}
  const email=$("email").value.trim();
  if(!email){$("status").textContent="Add your email to reserve this offer.";return}
  $("reserve").disabled=true;
  $("reserve").textContent="Reserving…";
  try{
    const r=await fetch("/api/public/lead",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({package_id:selected.package_id,email,interest:"advertiser"})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||"Could not reserve offer");
    $("status").textContent=`Reserved — ${selected.name} is attached to ${email}.`;
    $("reserve").textContent="Offer reserved ✓";
  }catch(err){
    $("status").textContent=err.message;
    $("reserve").disabled=false;
    $("reserve").textContent=`Reserve ${selected.name}`;
  }
};

await Promise.allSettled([loadProducts(),loadIdentity()]);
