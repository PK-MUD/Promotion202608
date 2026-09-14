import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,hash,cookieName} from '../server/auth.mjs';
import {gzipSync,gunzipSync} from 'node:zlib';
function store(){
  const data=new Map();let etag=0;
  return {data,async get(k){return structuredClone(data.get(k)?.data??null);},async getWithMetadata(k){return structuredClone(data.get(k)??null);},async setJSON(k,v,opts={}){const old=data.get(k);if(opts.onlyIfNew&&old||opts.onlyIfMatch&&old?.etag!==opts.onlyIfMatch)return{modified:false};const next={data:structuredClone(v),etag:String(++etag)};data.set(k,next);return{modified:true,etag:next.etag};},async delete(k){data.delete(k);}};
}
function fixture(){
  const db=store();let now=1789400000000;
  const handler=createHandler({getStore:()=>db,bootstrapHash:hash('owner-test-setup'),readDashboard:async()=>gzipSync('reviewed-dashboard'),clock:()=>now});
  const call=(path,body,options={})=>handler(new Request('https://test.example'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://test.example',...(body===undefined?{}:{'Content-Type':'application/json'}),...options.headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),{ip:options.ip||'test-ip'});
  const setup=()=>call('/api/password',{currentPassword:'owner-test-setup',password:'1',confirmation:'1'});
  return {db,call,setup,advance:ms=>now+=ms};
}
test('new deployment is locked and only owner can initialize with a simple password',async()=>{
  const f=fixture();assert.deepEqual(await(await f.call('/api/status')).json(),{configured:false});
  assert.equal((await f.call('/dashboard')).status,302);
  assert.equal((await f.call('/api/login',{password:'1'})).status,403);
  assert.equal((await f.call('/api/password',{currentPassword:'wrong',password:'1',confirmation:'1'})).status,401);
  assert.equal((await f.setup()).status,200);
  assert.deepEqual(await(await f.call('/api/status')).json(),{configured:true});
  assert.equal((await f.setup()).status,401,'bootstrap is single-use');
  const saved=JSON.stringify([...f.db.data.values()]);assert(!saved.includes('owner-test-setup'));assert(!saved.includes('"password":"1"'));
});
test('wrong password is rejected; right password works across clients; logout revokes token',async()=>{
  const f=fixture();await f.setup();
  assert.equal((await f.call('/api/login',{password:'wrong'})).status,401);
  const login=await f.call('/api/login',{password:'1'},{ip:'another-browser'});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert(cookie.includes(flag));
  const headers={Cookie:cookie.split(';')[0]};
  assert.equal((await f.call('/api/session',undefined,{headers})).status,200);
  const report=await f.call('/dashboard',undefined,{headers});assert.equal(report.status,200);assert.equal(report.headers.get('cache-control'),'private, no-store');assert.equal(gunzipSync(Buffer.from(await report.arrayBuffer())).toString(),'reviewed-dashboard');
  assert.equal((await f.call('/api/logout',{}, {headers})).status,200);
  assert.equal((await f.call('/api/session',undefined,{headers})).status,401);
  assert.equal((await f.call('/dashboard',undefined,{headers})).status,302);
});
test('changing password verifies old password and invalidates all existing sessions',async()=>{
  const f=fixture();await f.setup();const r=await f.call('/api/login',{password:'1'});const headers={Cookie:r.headers.get('set-cookie').split(';')[0]};
  assert.equal((await f.call('/api/password',{currentPassword:'wrong',password:'2',confirmation:'2'})).status,401);
  assert.equal((await f.call('/api/password',{currentPassword:'1',password:'2',confirmation:'2'})).status,200);
  assert.equal((await f.call('/api/session',undefined,{headers})).status,401);
  assert.equal((await f.call('/api/login',{password:'1'})).status,401);
  assert.equal((await f.call('/api/login',{password:'2'})).status,200);
});
test('blank and mismatched passwords are rejected; no complexity rules imposed',async()=>{
  const f=fixture();
  for(const body of [{password:' ',confirmation:' '},{password:'a',confirmation:'b'},{password:'x'.repeat(129),confirmation:'x'.repeat(129)}])assert.equal((await f.call('/api/password',{currentPassword:'owner-test-setup',...body})).status,400);
  assert.equal((await f.setup()).status,200);
});
test('cross-origin submissions and forged sessions cannot authorize data access',async()=>{
  const f=fixture();await f.setup();
  assert.equal((await f.call('/api/login',{password:'1'},{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await f.call('/api/session',undefined,{headers:{Cookie:cookieName+'='+'a'.repeat(64)}})).status,401);
  assert.equal((await f.call('/api/password')).status,405);
  assert.equal((await f.call('/private/dashboard.html.gz')).status,404);
});
test('concurrent brute force attempts are limited across instances and recover after window',async()=>{
  const f=fixture();await f.setup();
  const responses=await Promise.all(Array.from({length:25},()=>f.call('/api/login',{password:'bad'},{ip:'attacker'})));
  assert(responses.some(r=>r.status===429));assert(responses.filter(r=>r.status===401).length<=12);
  f.advance(61000);assert.equal((await f.call('/api/login',{password:'1'},{ip:'attacker'})).status,200);
});
test('sessions expire after eight hours and storage failures never expose dashboard',async()=>{
  const f=fixture();await f.setup();const r=await f.call('/api/login',{password:'1'});const headers={Cookie:r.headers.get('set-cookie').split(';')[0]};
  f.advance(8*3600*1000+1);assert.equal((await f.call('/api/session',undefined,{headers})).status,401);
  const broken=createHandler({getStore:()=>{throw new Error('secret backend details');}});
  const failure=await broken(new Request('https://test.example/dashboard'));assert.equal(failure.status,503);assert(!(await failure.text()).includes('secret backend details'));
});
