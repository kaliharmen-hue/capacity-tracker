import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handle,PlannerStore} from './worker.mjs';

test('rolling session, expiry, revocation and independent devices', async()=>{
 const data=new Map();
 const storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),transaction:async fn=>fn(storage)};
 const store=new PlannerStore({storage});
 const env={PLANNER_OWNER_KEY:'A'.repeat(43),PLANNER_STORE:{idFromName:x=>x,get:()=>store}};
 const origin='https://planner.example';
 const call=(path,method='GET',cookie,body)=>handle(new Request(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
 const realNow=Date.now;let now=Date.UTC(2026,10,24);
 Date.now=()=>now;
 try{
 const login=async()=>{const r=await call('/api/login','POST',null,{key:env.PLANNER_OWNER_KEY});assert.equal(r.status,200);return r.headers.get('Set-Cookie').split(';')[0]};
 const a=await login(),b=await login();
 assert.notEqual(a,b);
 assert.equal((await call('/api/tasks','GET',a)).headers.get('Set-Cookie'),null);
 now+=2*86400000;
 const renewed=await call('/api/tasks','GET',a);
 assert.equal(renewed.status,200);
 assert.match(renewed.headers.get('Set-Cookie'),/Max-Age=2592000/);
 assert.equal(renewed.headers.get('x-planner-renew'),null);
 now+=29*86400000;
 assert.equal((await call('/api/tasks','GET',b)).status,401);
 assert.equal((await call('/api/tasks','GET',a)).status,200);
 const out=await call('/api/logout','POST',a);assert.equal(out.status,200);
 assert.equal((await call('/api/tasks','GET',a)).status,401);
 const c=await login();env.PLANNER_OWNER_KEY='B'.repeat(43);
 assert.equal((await call('/api/tasks','GET',c)).status,401);
 const d=await login();
 for(let i=0;i<6;i++){now+=29*86400000;assert.equal((await call('/api/tasks','GET',d)).status,200)}
 now+=6*86400000;assert.equal((await call('/api/tasks','GET',d)).status,401);
 }finally{Date.now=realNow}
});
