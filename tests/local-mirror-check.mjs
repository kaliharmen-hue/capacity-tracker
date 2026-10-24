import assert from 'node:assert/strict';
const base='http://127.0.0.1:8795';
const date='2026-10-20';
async function sync(records){const r=await fetch(base+'/api/personal-os/sync',{method:'POST',headers:{Authorization:'Bearer mirror-test','Content-Type':'application/json'},body:JSON.stringify({records})});assert.equal(r.status,200);return r.json();}
await sync([{date,daily:{date,notes:'Synthetic local runtime check',energyScore:7,updatedAt:'2026-10-20T12:00:00Z'},whoop:{date,recoveryScore:80}}]);
await sync([{date,daily:null,capacity:null,whoop:{date,recoveryScore:82}}]);
await sync([]);
await Promise.all(['2026-10-21','2026-10-22'].map(date=>sync([{date,daily:{date,notes:'Synthetic concurrent device'}}])));
const r=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer mirror-reader-test','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_personal_os_day',arguments:{date}}})});
assert.equal(r.status,200);const rpc=await r.json();assert(!rpc.result.isError);const record=JSON.parse(rpc.result.content[0].text);assert.equal(record.daily.notes,'Synthetic local runtime check');assert(record.whoop);
console.log('Cloudflare local runtime: rich → WHOOP-only → empty → concurrent uploads → MCP day preserved the historical Daily Log and WHOOP.');
