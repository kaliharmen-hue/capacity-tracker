const random=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const scopes=['planner:read','planner:write'];
// A single pre-registered public client: no client secret, exact redirect, S256 PKCE.
// The stable ChatGPT callback is documented at developers.openai.com/plugins/build/auth.
export const clientId='personal-planner-chatgpt';
const redirectUri='https://chatgpt.com/connector_platform_oauth_redirect';
const stages=['authorization_received','authorization_rejected','authorization_started','approval_granted','approval_declined','exchange_received','exchange_rejected','connection_issued','connection_renewed','task_accessed','revoked'];
const reasons=['client_mismatch','resource_mismatch','client_auth_method','unknown_code','expired_code','owner_changed','redirect_mismatch','pkce_mismatch','invalid_scope','invalid_response_type','missing_state'];
export async function connectionEvent(tx,keyVersion,stage,reason) {
 if(!stages.includes(stage)||(reason!==undefined&&!reasons.includes(reason)))return;
 const events=(await tx.get('oauthEvents')??[]).filter(e=>e.keyVersion===keyVersion).slice(-19);
 await tx.put('oauthEvents',[...events,{keyVersion,stage,at:new Date().toISOString(),...(reason?{reason}:{})}]);
}
export async function challenge(value) {
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function text(request) {
 const reader=request.body?.getReader();if(!reader)throw Error('Missing body');
 let result='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw Error('Too large');}result+=decoder.decode(value,{stream:true});}
 return result+decoder.decode();
}
export async function oauth(request,env,{json,digest}) {
 const url=new URL(request.url),base=url.origin,resource=base+'/mcp',path=url.pathname;
 const metadata={'/.well-known/oauth-protected-resource':{resource,authorization_servers:[base],scopes_supported:scopes},'/.well-known/oauth-authorization-server':{issuer:base,authorization_endpoint:base+'/oauth/authorize',token_endpoint:base+'/oauth/token',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],authorization_response_iss_parameter_supported:true,scopes_supported:scopes}};
 if(Object.hasOwn(metadata,path))return request.method==='GET'?json(metadata[path]):json({error:'invalid_request'},405);
 const owner=env.PLANNER_OWNER_KEY?.trim()??'';
 if(owner.length<32)return json({error:'temporarily_unavailable'},503);
 const store=env.PLANNER_STORE.get(env.PLANNER_STORE.idFromName('owner'));
 // The only caller of the internal storage endpoint supplies the current key hash.
 const send=async(name,body)=>store.fetch(new Request(base+'/internal/oauth/'+name,{method:'POST',headers:{'x-planner-key-version':await digest(owner),'Content-Type':'application/json'},body:JSON.stringify(body)}));
 if(path==='/oauth/authorize'&&request.method==='GET') {
   await send('event',{stage:'authorization_received'});
   const p=Object.fromEntries(url.searchParams),requested=(p.scope??'').split(/\s+/).filter(Boolean);
   const rejected=p.client_id!==clientId?'client_mismatch':p.redirect_uri!==redirectUri?'redirect_mismatch':p.response_type!=='code'?'invalid_response_type':p.resource!==resource?'resource_mismatch':!p.state||p.state.length>1024?'missing_state':p.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge??'')?'pkce_mismatch':requested.length<1||requested.some(s=>!scopes.includes(s))||!requested.includes('planner:read')?'invalid_scope':null;
   if(rejected){await send('event',{stage:'authorization_rejected',reason:rejected});return json({error:'invalid_request'},400);}
   const saved=await send('pending',{...p,permission:requested.includes('planner:write')?'write':'read',resource});
   if(!saved.ok)return saved;
   const {request_id}=await saved.json();
   return new Response(null,{status:302,headers:{Location:base+'/?connect_request='+request_id,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 if(path==='/oauth/token'&&request.method==='POST') {
   let p;try{const raw=await text(request);p=request.headers.get('Content-Type')?.startsWith('application/json')?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw));}catch{return json({error:'invalid_request'},400);}
   if(!p||typeof p!=='object'||Array.isArray(p))return json({error:'invalid_request'},400);
   await send('event',{stage:'exchange_received'});
   if(p.client_id!==clientId||p.resource!==resource||p.client_secret||p.client_assertion) {
     await send('event',{stage:'exchange_rejected',reason:p.client_id!==clientId?'client_mismatch':p.resource!==resource?'resource_mismatch':'client_auth_method'});
     return json({error:'invalid_client'},400);
   }
   return send('token',p);
 }
 return json({error:'invalid_request'},404);
}

export async function oauthStorage(tx,name,p,keyVersion,digest,json) {
 const now=Date.now();
 if(name==='event') {await connectionEvent(tx,keyVersion,p.stage,p.reason);return json({recorded:true});}
 if(name==='pending') {
   const pending=(await tx.get('oauthPending')??[]).filter(x=>x.expires>now);
   if(pending.length>=32)return json({error:'temporarily_unavailable'},429);
   const request_id=random();await tx.put('oauthPending',[...pending,{...p,request_id,keyVersion,expires:now+600000}]);
   await connectionEvent(tx,keyVersion,'authorization_started');
   return json({request_id});
 }
 if(name!=='token')return json({error:'invalid_request'},400);
 const refresh=p.grant_type==='refresh_token';
 if(!refresh&&p.grant_type!=='authorization_code')return json({error:'unsupported_grant_type'},400);
 const key=refresh?'connectorGrants':'oauthCodes',items=await tx.get(key)??[];
 const id=await digest(refresh?p.refresh_token??'':p.code??'');
 const grant=items.find(x=>refresh?x.refreshId===id:x.id===id);
 const rejected=!grant?'unknown_code':grant.keyVersion!==keyVersion?'owner_changed':(refresh?grant.refreshExpires:grant.expires)<=now?'expired_code':grant.clientId!==p.client_id?'client_mismatch':grant.resource!==p.resource?'resource_mismatch':!refresh&&grant.redirectUri!==p.redirect_uri?'redirect_mismatch':!refresh&&(typeof p.code_verifier!=='string'||p.code_verifier.length<43||p.code_verifier.length>128||await challenge(p.code_verifier)!==grant.challenge)?'pkce_mismatch':null;
 if(rejected) {await connectionEvent(tx,keyVersion,'exchange_rejected',rejected);return json({error:'invalid_grant'},400);}
 if(p.scope!==undefined) {
   const allowed=grant.permission==='write'?scopes:['planner:read'];
   if(typeof p.scope!=='string'||p.scope.split(/\s+/).some(s=>!allowed.includes(s)))return json({error:'invalid_scope'},400);
 }
 const grants=(await tx.get('connectorGrants')??[]).filter(x=>x.id!==grant.id&&(!x.refreshExpires||x.refreshExpires>now));
 if(grants.length>=10)return json({error:'temporarily_unavailable'},409);
 const access_token=random(),refresh_token=random();
 const next={id:await digest(access_token),refreshId:await digest(refresh_token),kind:'oauth',permission:grant.permission,keyVersion,clientId:grant.clientId,resource:grant.resource,expires:now+3600000,refreshExpires:now+30*86400000,createdAt:new Date().toISOString()};
 await tx.put('connectorGrants',[...grants,next]);
 if(!refresh)await tx.put('oauthCodes',items.filter(x=>x.id!==id));
 await connectionEvent(tx,keyVersion,refresh?'connection_renewed':'connection_issued');
 return json({access_token,refresh_token,token_type:'Bearer',expires_in:3600,scope:grant.permission==='write'?'planner:read planner:write':'planner:read'});
}

export async function approveOAuth(tx,body,keyVersion,digest,json,base) {
 const now=Date.now(),pending=await tx.get('oauthPending')??[];
 const request=pending.find(p=>p.request_id===body.request_id&&p.expires>now&&p.keyVersion===keyVersion);
 if(!request)return json({error:'Connection request expired. Restart Connect from ChatGPT.'},400);
 if(body.approved===true&&!['read','write'].includes(body.permission))return json({error:'Choose permission'},400);
 if(body.permission==='write'&&request.permission!=='write')return json({error:'Permission not requested'},400);
 await tx.put('oauthPending',pending.filter(p=>p.request_id!==body.request_id));
 const target=new URL(request.redirect_uri);target.searchParams.set('state',request.state);target.searchParams.set('iss',base);
 if(body.approved!==true)target.searchParams.set('error','access_denied');
 else {
   const code=random(),codes=(await tx.get('oauthCodes')??[]).filter(x=>x.expires>now);
   if(codes.length>=32)return json({error:'Too many pending authorizations'},429);
   await tx.put('oauthCodes',[...codes,{id:await digest(code),permission:body.permission,keyVersion,clientId:request.client_id,resource:request.resource,redirectUri:request.redirect_uri,challenge:request.code_challenge,expires:now+300000}]);
   target.searchParams.set('code',code);
 }
 await connectionEvent(tx,keyVersion,body.approved===true?'approval_granted':'approval_declined');
 return json({redirectUrl:target.href});
}
