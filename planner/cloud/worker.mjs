const states=new Set(['Inbox','Next action','Scheduled','Waiting','Delegated','Done','Archived']);
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function handle(request,env){
 if(!env.PLANNER_TOKEN||env.PLANNER_TOKEN.length<32)return json({error:'Not configured'},503);
 const supplied=request.headers.get('Authorization')||'';
 const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const a=await digest(supplied),b=await digest('Bearer '+env.PLANNER_TOKEN);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 if(diff)return json({error:'Unauthorized'},401);
 if(new URL(request.url).pathname!=='/api/tasks')return json({error:'Not found'},404);
 return env.PLANNER_STORE.get(env.PLANNER_STORE.idFromName('owner')).fetch(request);
}
export default {fetch:handle};
export class PlannerStore{
 constructor(ctx){this.storage=ctx.storage}
 async fetch(request){
 if(request.method==='GET')return json(await this.storage.get('snapshot')||{revision:0,tasks:[]});
 if(request.method!=='PUT')return json({error:'Method not allowed'},405);
 let body;try{const reader=request.body.getReader();let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();return json({error:'Too large'},413)}chunks.push(value)}body=JSON.parse(await new Blob(chunks).text())}catch{return json({error:'Invalid JSON'},400)}
 if(!body||!Number.isSafeInteger(body.revision)||body.revision<0||!Array.isArray(body.tasks)||body.tasks.length>1000)return json({error:'Invalid snapshot'},400);
 const ids=new Set();const tasks=[];
 for(const t of body.tasks){if(!t||typeof t.id!=='string'||!/^[a-f0-9-]{36}$/i.test(t.id)||ids.has(t.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>500||!states.has(t.status)||typeof(t.project??'')!=='string'||(t.project??'').length>200||typeof(t.deadline??'')!=='string'||(t.deadline&&!/^\d{4}-\d{2}-\d{2}$/.test(t.deadline)))return json({error:'Invalid task'},400);ids.add(t.id);tasks.push({id:t.id,title:t.title,status:t.status,project:t.project??'',deadline:t.deadline??''})}
 return this.storage.transaction(async tx=>{const old=await tx.get('snapshot')||{revision:0,tasks:[]};if(old.revision!==body.revision)return json({error:'Conflict',revision:old.revision},409);const next={revision:old.revision+1,tasks};await tx.put('snapshot',next);return json(next)});
 }
}
