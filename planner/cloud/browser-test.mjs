import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.PLAYWRIGHT_PATH || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const base='http://127.0.0.1:8794';
try {
 const context=await browser.newContext();const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();
 await page.goto(base);
 await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Sign in'));
 assert.equal(await page.locator('#login').isVisible(),false,'Settings starts collapsed');
 await page.getByText('Settings',{exact:true}).click();
 await page.locator('#owner-key').fill('A'.repeat(43));await page.locator('#login-submit').click();
 await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('Signed in'));
 const cookie=(await context.cookies()).find(c=>c.name==='__Host-planner');
 assert(cookie.httpOnly && cookie.secure);assert.equal(cookie.sameSite,'Strict');
 const title='Browser synthetic '+crypto.randomUUID();
 await page.locator('#title').fill(title);await page.locator('#capture-submit').click();
 await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Synced at'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('Signed in'));
 await page.getByText(title,{exact:true}).waitFor();
 // Offline edits stay local, survive reload state, and upload after reconnect.
 await context.setOffline(true);
 const offline='Offline synthetic '+crypto.randomUUID();
 await page.locator('#title').fill(offline);await page.locator('#capture-submit').click();
 await page.getByText(offline,{exact:true}).waitFor();
 assert((await page.evaluate(()=>localStorage.getItem('personal-planner-sync-v1'))).includes(offline));
 await context.setOffline(false);
 await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Synced at'));
 // Use only local synthetic owner credentials to exercise Settings/API/MCP.
 await page.getByText('Settings',{exact:true}).click();
 await page.locator('#connector-permission').selectOption('write');await page.locator('#connector-create').click();
 await page.waitForFunction(()=>document.querySelector('#connector-key').value.length===64);
 const token=await page.locator('#connector-key').inputValue();
 const rpc=async(name,args={})=>{
   const r=await context.request.post(base+'/mcp',{headers:{Authorization:'Bearer '+token},data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}});
   return {status:r.status(),data:await r.json()};
 };
 const external='External synthetic '+crypto.randomUUID();
 let response=await rpc('create_task',{request_id:crypto.randomUUID(),title:external});
 assert.equal(response.status,200);assert(!response.data.result.isError);
 // Advance the browser's clock so the visible-tab poll runs without a real minute wait.
 await page.clock.fastForward(65000);await page.clock.runFor(1000);
 await page.getByText(external,{exact:true}).waitFor();
 await page.locator('#connector-revoke').click();
 await page.waitForFunction(()=>document.querySelector('#connector-status').textContent.includes('revoked'));
 assert.equal((await rpc('list_tasks')).status,401);
 assert.equal(await page.locator('#connector-key').inputValue(),'');
 assert.deepEqual(errors,[]);
 console.log('Browser Settings, session cookie, autosync, offline queue, polling, connector create and revocation passed.');
} finally {await browser.close();}
