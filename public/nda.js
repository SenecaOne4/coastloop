import {readSession} from '/session.js';
const $=s=>document.querySelector(s),params=new URLSearchParams(location.search);
const rawNext=params.get('next')||'/portal.html',next=rawNext.startsWith('/')&&!rawNext.startsWith('//')?rawNext:'/portal.html';
const session=readSession();
if(!session?.access_token)location.replace('/login?next='+encodeURIComponent('/nda.html?next='+next));
else{
 $('#back').href='/login?next='+encodeURIComponent(next);
 const headers={authorization:`Bearer ${session.access_token}`};
 try{
  const r=await fetch('/api/auth/nda/status',{headers}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error==='nda_status_unavailable'?'NDA status could not be verified. Please try again.':(d.error||'Could not verify your CoastLoop account.'));
  if(!d.nda?.configured)$('#status').textContent='The NDA document has not been published in CoastLoop yet. Acceptance is unavailable until the approved document is configured.';
  else if(d.nda.accepted)location.replace(next);
  else{
   const link=document.createElement('a');link.className='button-link nda-doc';link.href=d.nda.document_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open CoastLoop NDA · version '+d.nda.current_version;$('#document').append(link);
   $('#accept-form').hidden=false;
   $('#accept-form').onsubmit=async e=>{e.preventDefault();if(!$('#agree').checked)return;$('#accept').disabled=true;$('#error').textContent='';$('#status').textContent='Recording acceptance…';
    try{const res=await fetch('/api/auth/nda/accept',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({version:d.nda.current_version})}),result=await res.json().catch(()=>({}));
     if(!res.ok)throw Error(result.error==='nda_version_changed'?'The NDA version changed. Reload to review the current version.':result.error==='nda_acceptance_write_failed'?'Acceptance could not be recorded. Please retry.':result.error||'Could not record acceptance.');
     location.replace(next);
    }catch(err){$('#status').textContent='';$('#error').textContent=err.message;$('#accept').disabled=false;}
   };
  }
 }catch(e){$('#error').textContent=e.message;}
}