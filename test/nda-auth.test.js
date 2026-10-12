import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAuthRoute,portalOverview,requireUserAccess} from '../src/auth.js';
const user={id:'123e4567-e89b-12d3-a456-426614174000',email:'tester@example.com',user_metadata:{full_name:'Test User'}};
let store=new Map(),failAcceptanceWrite=false;
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input);
 if(url.pathname==='/auth/v1/user')return Response.json(user);
 if(url.pathname==='/rest/v1/user_invitations')return Response.json([]);
 if(url.pathname==='/rest/v1/user_profiles')return new Response(null,{status:204});
 if(url.pathname==='/rest/v1/organization_members')return Response.json([{role:'admin'}]);
 if(url.pathname==='/rest/v1/business_members'||url.pathname==='/rest/v1/businesses')return Response.json([]);
 if(url.pathname==='/rest/v1/platform_nda_acceptances'){
  if(init.method==='POST'){
   if(failAcceptanceWrite)return Response.json({message:'write denied'},{status:500});
   const b=JSON.parse(init.body),key=b.user_id+':'+b.document_version;
   if(!store.has(key))store.set(key,{user_id:b.user_id,email_snapshot:b.email_snapshot,document_version:b.document_version,accepted_at:'2026-10-12T16:00:00.000Z'});
   return Response.json([store.get(key)]);
  }
  const id=url.searchParams.get('user_id')?.replace('eq.',''),v=url.searchParams.get('document_version')?.replace('eq.',''),row=store.get(id+':'+v);
  return Response.json(row?[row]:[]);
 }
 throw Error('Unexpected fetch '+url);
};
const env={SUPABASE_URL:'https://supabase.test',SUPABASE_AUTH_URL:'https://supabase.test',SUPABASE_SECRET_KEY:'test',NDA_CURRENT_VERSION:'v1',NDA_DOCUMENT_URL:'/legal/platform-nda-v1.pdf'};
function req(path,method='GET',body){return new Request('https://coastloop.test'+path,{method,headers:{authorization:'Bearer token',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
const call=async(path='/api/auth/nda/status',method='GET',body)=>handleAuthRoute(req(path,method,body),env,new URL('https://coastloop.test'+path));
test.beforeEach(()=>{store=new Map();failAcceptanceWrite=false;env.NDA_CURRENT_VERSION='v1';env.NDA_DOCUMENT_URL='/legal/platform-nda-v1.pdf';});
test('first user gets pending state, then acceptance records identity, timestamp, and version',async()=>{
 let r=await call();assert.equal((await r.json()).nda.accepted,false);
 r=await call('/api/auth/nda/accept','POST',{version:'v1'});assert.equal(r.status,200);
 const d=await r.json();assert.equal(d.acceptance.user_id,user.id);assert.equal(d.acceptance.document_version,'v1');assert.ok(d.acceptance.accepted_at);
 r=await call('/api/auth/me');assert.equal(r.status,200);
});
test('returning user is accepted for the stored current version',async()=>{
 store.set(user.id+':v1',{user_id:user.id,document_version:'v1',accepted_at:'2026-10-11T12:00:00.000Z'});
 const d=await(await call()).json();assert.equal(d.nda.accepted,true);assert.equal(d.nda.accepted_at,'2026-10-11T12:00:00.000Z');assert.equal(store.size,1);
});
test('revised NDA version requires new acceptance and retains old evidence',async()=>{
 store.set(user.id+':v1',{user_id:user.id,document_version:'v1',accepted_at:'2026-10-11T12:00:00.000Z'});
 env.NDA_CURRENT_VERSION='v2';env.NDA_DOCUMENT_URL='/legal/platform-nda-v2.pdf';
 assert.equal((await(await call()).json()).nda.accepted,false);
 assert.equal((await call('/api/auth/me')).status,401);
 assert.equal((await call('/api/auth/nda/accept','POST',{version:'v1'})).status,409);
 assert.equal((await call('/api/auth/nda/accept','POST',{version:'v2'})).status,200);assert.equal(store.size,2);
});
test('direct portal API request is denied before acceptance',async()=>{
 assert.equal((await portalOverview(req('/api/portal/overview'),env)).status,401);
 assert.equal(await requireUserAccess(req('/api/admin/stats'),env),null);
});
test('failed acceptance writes never return success',async()=>{
 failAcceptanceWrite=true;const r=await call('/api/auth/nda/accept','POST',{version:'v1'});
 assert.equal(r.status,503);assert.equal((await r.json()).error,'nda_acceptance_write_failed');assert.equal(store.size,0);
});
test('missing approved document configuration prevents acceptance',async()=>{
 env.NDA_CURRENT_VERSION='';env.NDA_DOCUMENT_URL='';
 assert.equal((await(await call()).json()).nda.configured,false);
 assert.equal((await call('/api/auth/nda/accept','POST',{version:'v1'})).status,503);
});
