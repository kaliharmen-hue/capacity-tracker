import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMirror, mergeEntry } from '../integrations/whoop-worker/src/mirror-merge.js';
import { PersonalOsMirror } from '../integrations/whoop-worker/src/mirror-store.js';
import worker from '../integrations/whoop-worker/src/index.js';
import { buildMirrorBatches, formatMirrorSync } from '../src/scripts/personal-os-sync.ts';
import { createEmptyEntry } from '../src/scripts/schema.ts';

const day = '2026-10-20';
const daily = { date: day, energyScore: 7, notes: 'Synthetic test answer', updatedAt: '2026-10-20T12:00:00Z' };
const baseline = { records: [{ date: day, daily, capacity: { date: day, state: 'Settled' }, whoop: { date: day, recoveryScore: 80 } }], weeklyReviews: [{weekStart:'2026-10-19',capacityGivers:'Synthetic review'}] };
test('empty and WHOOP-only uploads preserve all historical answers and reviews', () => {
  const merged = mergeMirror(baseline, { records: [{ date: day, daily: null, capacity: null, whoop: { date: day, recoveryScore: 81 } }] });
  assert.deepEqual(merged.records[0].daily, daily);
  assert.equal(merged.records[0].capacity.state, 'Settled');
  assert.equal(merged.weeklyReviews.length, 1);
  assert.deepEqual(mergeMirror(merged, {records:[]}).records, merged.records);
  assert.equal(merged.lastSync.uploaded.daily,0);assert.equal(merged.counts.daily,1);
});
test('partial, stale and blank records never replace richer populated answers', () => {
  const updated = mergeEntry(daily, {date:day,notes:'',energyScore:0,newAnswer:false,updatedAt:'2026-10-21T12:00:00Z'});
  assert.equal(updated.notes,daily.notes);assert.equal(updated.energyScore,0);assert.equal(updated.newAnswer,false);
  assert.equal(mergeEntry(daily,{date:day,energyScore:2,updatedAt:'2026-10-19T00:00:00Z'}).energyScore,7);
  assert.deepEqual(mergeEntry(daily,{date:day,updatedAt:'2026-10-22T00:00:00Z'}),daily);
  assert.deepEqual(mergeEntry(daily,createEmptyEntry(day)),daily);
  assert.equal(mergeEntry({date:day,checkedIn:true},{date:day,checkedIn:false,notes:'',updatedAt:'2026-10-24T00:00:00Z'}).checkedIn,true);
  const blank=mergeMirror(null,{records:[{date:day,daily:{date:day}}]}).records[0];
  assert.deepEqual(blank.daily,{date:day});assert.equal(blank.capacity,null);
});
test('invalid dates, mismatched joins, duplicate dates and malformed uploads are rejected', () => {
  for(const payload of [{},{records:[{date:'2026-02-30'}]},{records:[{date:day,daily:{date:'2026-10-21'}}]},{records:[{date:day},{date:day}]},{records:[{date:day,daily:[]}]},{records:[],weeklyReviews:[{}]}])assert.throws(()=>mergeMirror(baseline,payload));
});
test('the 180-day request limit does not omit old Daily Log records', () => {
  const entries=Array.from({length:400},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),notes:'Synthetic'}));
  const built=buildMirrorBatches(entries,[],[{date:'2026-10-24'}]);
  assert.equal(built.counts.daily,400);assert.deepEqual(built.batches.map(b=>b.length),[180,180,41]);
  assert.equal(built.batches[0][0].daily,entries[0]);
  const joined=JSON.parse(JSON.stringify(built.batches.flat()));assert.equal(joined[0].daily.notes,'Synthetic');assert.equal(joined.at(-1).daily,null);
  const ui=formatMirrorSync({ok:true,localCounts:built.counts,uploadedCounts:built.counts,counts:{days:401,daily:400,capacity:0,whoop:1}});
  assert.match(ui,/Local: 400 Daily Log/);assert.match(ui,/Uploaded: 400 Daily Log/);assert.match(ui,/Cloud: 400 Daily Log/);
});

function fixture(){
  let values=new Map<string,unknown>();let tail=Promise.resolve();
  const storage={async transaction(fn){const work=tail.then(async()=>{const draft=new Map(values);const tx={get:async k=>structuredClone(draft.get(k)),put:async(k,v)=>{draft.set(k,structuredClone(v))}};const result=await fn(tx);values=draft;return result});tail=work.catch(()=>{});return work}};
  const kv={async get(key,type){if(key==='personal-os-mirror')return structuredClone(baseline);if(key==='session:owner')return {};if(key==='chatgpt-access:reader')return {expiresAt:Date.now()+3600000,version:1,resource:'https://worker.example/mcp',scope:'personal_os:read'};return null},put:async()=>{throw Error('Legacy KV must remain unchanged')}};
  const obj=new PersonalOsMirror({storage}, {WHOOP_AUTH:kv});
  const env={WHOOP_AUTH:kv,PUBLIC_BASE_URL:'https://worker.example',APP_ORIGIN:'https://tracker.example/',PERSONAL_OS_MIRROR:{idFromName:()=> 'owner',get:()=>({fetch:(input,init)=>obj.fetch(new Request(input,init))})}};
  return {env,obj};
}
test('concurrent device uploads, empty uploads and invalid uploads cannot lose data',async()=>{
  const {obj}=fixture();
  const upload=p=>obj.fetch(new Request('https://mirror.internal/',{method:'POST',body:JSON.stringify(p)}));
  const dates=['2026-10-21','2026-10-22'];
  const replies=await Promise.all(dates.map(date=>upload({records:[{date,daily:{date,notes:'Synthetic'}}]})));
  assert(replies.every(r=>r.ok));assert((await upload({records:[]})).ok);
  assert.equal((await upload({records:[{date:'bad'}]})).status,503);
  const stored=await(await obj.fetch(new Request('https://mirror.internal/'))).json();
  assert.deepEqual(stored.records.map(r=>r.date),[day,...dates]);assert.deepEqual(stored.records[0].daily,daily);
  assert.equal((await obj.fetch(new Request('https://mirror.internal/',{method:'DELETE'}))).status,405);
});
test('owner upload to storage to authenticated MCP day and status preserves real record shape',async()=>{
  const {env}=fixture();
  const sync=await worker.fetch(new Request('https://worker.example/api/personal-os/sync',{method:'POST',headers:{Authorization:'Bearer owner'},body:JSON.stringify({records:[{date:day,daily:null,capacity:null,whoop:{date:day,recoveryScore:82}}]})}),env);
  assert.equal(sync.status,200);const diagnostic=await sync.json();assert.equal(diagnostic.counts.daily,1);assert.equal(diagnostic.diagnostics.uploaded.daily,0);
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No WHOOP connection in test')};
  try{for(const name of ['get_personal_os_status','get_personal_os_day']){
    const response=await worker.fetch(new Request('https://worker.example/mcp',{method:'POST',headers:{Authorization:'Bearer reader'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:name.endsWith('_day')?{date:day}:{}}})}),env);
    assert.equal(response.status,200);const rpc=await response.json();assert(!rpc.result.isError);const data=JSON.parse(rpc.result.content[0].text);
    if(name.endsWith('_day')){assert.deepEqual(data.daily,daily);assert(data.whoop)}else{assert.equal(data.counts.daily,1);assert.equal(data.mirrorVersion,2)}
  }}finally{globalThis.fetch=original}
});
