import {test,expect} from '@playwright/test';

const origin='http://127.0.0.1:8794';
const ownerKey='A'.repeat(43);

test('Worker saves Stage 1 edits and MCP reads, creates and updates expanded task fields',async({page,context})=>{
 const title='Worker Stage 1 '+crypto.randomUUID();
 await page.goto(origin);
 await expect(page.locator('#notice')).toContainText('Sign in');
 await page.getByText('Settings',{exact:true}).click();
 await page.getByLabel('Owner key',{exact:true}).fill(ownerKey);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('#account-status')).toContainText('Signed in');
 await page.locator('#title').fill(title);
 await page.locator('#capture-submit').click();
 await expect(page.locator('#notice')).toContainText('Synced at');
 const row=page.locator('.task').filter({hasText:title});
 await row.getByText('Planning and notes',{exact:true}).click();
 const today=await page.evaluate(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')});
 const current=()=>page.evaluate(title=>JSON.parse(localStorage.getItem('personal-planner-sync-v1')).draft.find(t=>t.title===title),title);
 const taskId=(await current()).id;
 const edit=async(label,value,field)=>{
  const control=row.getByLabel(label,{exact:true});
  await control.fill(value);
  await control.press('Tab');
  await expect.poll(async()=>(await current())[field]).toBe(value);
 };
 await edit('Planned working date',today,'plannedDate');
 const duration=row.getByLabel('Estimated minutes (optional)',{exact:true});
 await duration.fill('42');await duration.press('Tab');
 await expect.poll(async()=>(await current()).durationMinutes).toBe(42);
 await row.getByLabel('Responsibility',{exact:true}).selectOption('ChatGPT');
 await expect.poll(async()=>(await current()).responsibility).toBe('ChatGPT');
 await row.getByLabel('Commitment type',{exact:true}).selectOption('fixed');
 await expect.poll(async()=>(await current()).commitmentType).toBe('fixed');
 await edit('Task notes','Synthetic task instructions','notes');
 await edit('Progress notes','Synthetic first progress update','progressNotes');
 await edit('Conversation link','https://example.org/conversation','conversationUrl');
 await edit('Resource link','https://example.org/resource','resourceUrl');
 await page.getByRole('button',{name:'All',exact:true}).click();
 await row.getByLabel('Status',{exact:true}).selectOption('In progress');
 await expect.poll(async()=>(await current()).status).toBe('In progress');
 await expect(page.locator('#notice')).toContainText('Synced at');
 await page.reload();
 await expect(page.locator('#account-status')).toContainText('Signed in');
 await page.getByRole('button',{name:'In progress',exact:true}).click();
 const refreshed=page.locator('.task').filter({hasText:title});
 await refreshed.getByText('Planning and notes',{exact:true}).click();
 await expect(refreshed.getByLabel('Planned working date',{exact:true})).toHaveValue(today);
 await expect(refreshed.getByLabel('Estimated minutes (optional)',{exact:true})).toHaveValue('42');
 await expect(refreshed.getByLabel('Progress notes',{exact:true})).toHaveValue('Synthetic first progress update');

 const listed=await context.request.post(origin+'/mcp',{data:{jsonrpc:'2.0',id:1,method:'tools/list'}});
 expect(listed.ok()).toBeTruthy();
 const tools=(await listed.json()).result.tools;
 const taskFields=tools.find(t=>t.name==='update_task').inputSchema.properties;
 for(const field of ['plannedDate','durationMinutes','responsibility','commitmentType','notes','progressNotes','conversationUrl','resourceUrl'])expect(taskFields).toHaveProperty(field);

 await page.getByText('Settings',{exact:true}).click();
 await page.getByText('Advanced integration keys',{exact:true}).click();
 await page.locator('#connector-permission').selectOption('write');
 await page.locator('#connector-create').click();
 await expect.poll(()=>page.locator('#connector-key').inputValue()).toHaveLength(64);
 const token=await page.locator('#connector-key').inputValue();
 const call=async(name,args={})=>{
  const response=await context.request.post(origin+'/mcp',{headers:{Authorization:'Bearer '+token},data:{jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}}});
  expect(response.ok()).toBeTruthy();
  const result=(await response.json()).result;
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0].text);
 };
 const snapshot=await call('list_tasks');
 expect(snapshot.tasks.find(t=>t.id===taskId)).toMatchObject({plannedDate:today,durationMinutes:42,responsibility:'ChatGPT',commitmentType:'fixed'});
 const requestId=crypto.randomUUID();
 const created=await call('create_task',{request_id:requestId,title:'MCP synthetic '+requestId,status:'In progress',plannedDate:today,durationMinutes:15,responsibility:'Collaborative',commitmentType:'flexible',notes:'MCP test note',progressNotes:'MCP test progress',conversationUrl:'https://example.org/chat',resourceUrl:'https://example.org/file'});
 expect(created.task).toMatchObject({id:requestId,status:'In progress',plannedDate:today,durationMinutes:15,notes:'MCP test note'});
 const updated=await call('update_task',{id:requestId,expected_version:created.task.version,progressNotes:'MCP updated progress'});
 expect(updated.task).toMatchObject({plannedDate:today,durationMinutes:15,notes:'MCP test note',progressNotes:'MCP updated progress',resourceUrl:'https://example.org/file'});
});
