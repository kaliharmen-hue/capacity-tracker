import {test} from 'node:test';
import assert from 'node:assert/strict';
import {task,taskList,changes,merge} from '../model.mjs';
import {handle,PlannerStore} from './worker.mjs';
const id='11111111-1111-4111-8111-111111111111';
const legacy={id,title:'Synthetic task',status:'Next action',project:'Example',deadline:'',version:1};
const patch={status:'In progress',plannedDate:'2026-11-26',durationMinutes:35,responsibility:'Collaborative',commitmentType:'flexible',notes:'Example instructions',progressNotes:'Started',conversationUrl:'https://example.org/chat',resourceUrl:'https://example.org/file'};
test('legacy normalization and independent dates',()=>{
 const old=task(legacy);
 assert.equal(old.plannedDate,'');assert.equal(old.durationMinutes,null);assert.equal(old.commitmentType,'flexible');
 const next=task({...old,...patch});
 assert.equal(next.deadline,'');assert.equal(next.plannedDate,patch.plannedDate);
 assert.deepEqual(taskList(JSON.parse(JSON.stringify([next]))),[next]);
 for(const bad of [{plannedDate:'2026-02-30'},{durationMinutes:0},{durationMinutes:1.2},{responsibility:'unknown'},{commitmentType:'unknown'},{resourceUrl:'javascript:alert(1)'},{conversationUrl:'https://u:p@example.org'},{notes:'a'.repeat(4001)}])assert.throws(()=>task({...next,...bad}));
 const edited=changes([old],[next]);
 assert.equal(merge([old],edited,2).tasks[0].progressNotes,'Started');
 assert.deepEqual(merge([task({...old,title:'Other edit',version:2})],edited,3).conflicts,[id]);
});
test('existing snapshot and MCP preserve new fields during older client updates',async()=>{
 const data=new Map([['snapshot',{revision:1,tasks:[legacy]}]]);
 const storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),transaction:async f=>f(storage)};
 const store=new PlannerStore({storage});
 const env={PLANNER_OWNER_KEY:'A'.repeat(43),PLANNER_READ_KEY:'B'.repeat(43),PLANNER_WRITE_KEY:'C'.repeat(43),PLANNER_STORE:{idFromName:x=>x,get:()=>store}};
 const call=async(name,args,key=env.PLANNER_WRITE_KEY)=>{
 const response=await handle(new Request('https://planner.example/mcp',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),env);
 const result=(await response.json()).result;
 return result.isError?result:JSON.parse(result.content[0].text);
 };
 const before=(await call('list_tasks',{})).tasks[0];assert.equal(before.title,legacy.title);
 const saved=await call('update_task',{id,expected_version:1,...patch});
 assert.equal(saved.task.status,'In progress');assert.equal(saved.task.plannedDate,patch.plannedDate);
 const oldClient=await call('update_task',{id,expected_version:saved.task.version,title:'Renamed'});
 assert.equal(oldClient.task.progressNotes,'Started');assert.equal(oldClient.task.resourceUrl,patch.resourceUrl);
 assert.equal((await call('update_task',{id,expected_version:1,title:'Stale'})).isError,true);
 assert.equal((await call('update_task',{id,expected_version:oldClient.task.version,title:'Denied'},env.PLANNER_READ_KEY)).isError,true);
 assert.equal((await call('list_tasks',{})).tasks[0].title,'Renamed');
});
