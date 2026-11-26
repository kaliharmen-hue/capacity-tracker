import { states, responsibilities, commitmentTypes, areas } from '../model.mjs';

const fields = {title:{type:'string',minLength:1,maxLength:500},status:{type:'string',enum:states},project:{type:'string',maxLength:200},deadline:{type:'string',description:'Actual deadline YYYY-MM-DD, or empty to clear'},plannedDate:{type:'string',description:'Intended working date YYYY-MM-DD, or empty to clear'},durationMinutes:{type:['integer','null'],minimum:1,maximum:10080,description:'Estimated minutes, null if unknown'},responsibility:{type:'string',enum:responsibilities},commitmentType:{type:'string',enum:commitmentTypes},area:{type:'string',enum:areas,description:'Work area or activity category'},notes:{type:'string',maxLength:4000},progressNotes:{type:'string',maxLength:4000},conversationUrl:{type:'string',maxLength:2048},resourceUrl:{type:'string',maxLength:2048}};
export const tools = [
  {name:'list_tasks',description:'Read Personal Planner tasks. Use current task versions before updates.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true}},
  {name:'create_task',description:'Create a task explicitly requested by the user. Reuse request_id on retries to avoid duplicates.',inputSchema:{type:'object',properties:{request_id:{type:'string',format:'uuid'},...fields},required:['request_id','title'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}},
  {name:'update_task',description:'Update an existing task explicitly requested by the user. Supply its current version; conflicts require a fresh read.',inputSchema:{type:'object',properties:{id:{type:'string',format:'uuid'},expected_version:{type:'integer',minimum:1},...fields},required:['id','expected_version'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}}
];

export async function mcp(request, env, {json, readJson, integration}) {
  if(request.method!=='POST') return json({error:'POST required'},405);
  const origin=request.headers.get('Origin');
  if(origin && origin!==new URL(request.url).origin) return json({error:'Origin rejected'},403);
  let body;
  try {body=await readJson(request,32768);} catch {return json({error:'Invalid request'},400);}
  if(!body || body.jsonrpc!=='2.0' || Array.isArray(body)) return json({error:'Invalid JSON-RPC'},400);
  const result=value=>json({jsonrpc:'2.0',id:body.id??null,result:value});
  const reconnect=(required,status=401)=>{
    const auth=`Bearer resource_metadata="${new URL(request.url).origin}/.well-known/oauth-protected-resource", scope="${required}", error="insufficient_scope", error_description="Connect Personal Planner to continue"`;
    return json({jsonrpc:'2.0',id:body.id??null,result:{isError:true,content:[{type:'text',text:'Connect Personal Planner to continue'}],_meta:{'mcp/www_authenticate':[auth]}}},status,{'WWW-Authenticate':auth});
  };
  if(body.method==='notifications/initialized') return new Response(null,{status:202});
  if(body.method==='initialize') return result({protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'personal-planner',version:'1.0.0'}});
  if(body.method==='tools/list') return result({tools:tools.map(t=>({...t,securitySchemes:[{type:'oauth2',scopes:t.name==='list_tasks'?['planner:read']:['planner:read','planner:write']}],_meta:{securitySchemes:[{type:'oauth2',scopes:t.name==='list_tasks'?['planner:read']:['planner:read','planner:write']}]}}))});
  if(body.method==='ping') return result({});
  if(body.method!=='tools/call') return json({jsonrpc:'2.0',id:body.id??null,error:{code:-32601,message:'Method not supported'}},200);
  const name=body.params?.name,args=body.params?.arguments??{};
  const tool=tools.find(t=>t.name===name);
  if(!tool || !args || typeof args!=='object' || Array.isArray(args) || Object.keys(args).some(k=>!Object.hasOwn(tool.inputSchema.properties,k))) return result({isError:true,content:[{type:'text',text:'Invalid tool or arguments'}]});
  const call=(method,changes)=>integration(new Request(new URL('/api/integration/tasks',request.url),{method,headers:{Authorization:request.headers.get('Authorization')??'',...(changes?{'Content-Type':'application/json'}:{})},...(changes?{body:JSON.stringify({changes})}:{})}),env);
  const current=await call('GET');
  if(!current.ok) {
    const required=name==='list_tasks'?'planner:read':'planner:read planner:write';
    return reconnect(required);
  }
  const snapshot=await current.json();
  let response;
  if(name==='list_tasks') response=snapshot;
  else {
    const {request_id,id,expected_version,...patch}=args;
    let change;
    if(name==='create_task') {
      if(typeof request_id!=='string' || typeof patch.title!=='string') return result({isError:true,content:[{type:'text',text:'request_id and title are required'}]});
      change={before:null,after:{id:request_id,status:'Inbox',...patch}};
    } else {
      const before=snapshot.tasks.find(t=>t.id===id);
      if(!before || !Number.isSafeInteger(expected_version) || before.version!==expected_version) return result({isError:true,content:[{type:'text',text:'Task missing or version changed. Read tasks again before updating.'}]});
      change={before,after:{...before,...patch}};
    }
    const write=await call('PATCH',[change]);
    if(write.status===403)return reconnect('planner:read planner:write',403);
    if(!write.ok) return result({isError:true,content:[{type:'text',text:write.status===403?'Write permission required':write.status===409?'Task changed. Read again before retrying.':'Task update rejected'}]});
    const updated=await write.json();
    response={task:updated.tasks.find(t=>t.id===change.after.id),revision:updated.revision};
  }
  return result({content:[{type:'text',text:JSON.stringify(response)}]});
}
