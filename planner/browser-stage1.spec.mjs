import {test,expect} from '@playwright/test';
const key='personal-planner-sync-v1';
const id='11111111-1111-4111-8111-111111111111';
const old={id,title:'Synthetic legacy task',project:'Example',status:'Inbox',deadline:'',version:1};
test.beforeEach(async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{"error":"Synthetic offline test"}'}));
 await page.addInitScript(({key,old})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({base:[old],draft:[old]}));},{key,old});
 await page.goto('http://127.0.0.1:8765/');
 await expect(page.locator('#notice')).toContainText('Sign in');
});
test('daily routine shortcuts stay separate and remain usable on mobile',async({page,context})=>{
 const routines=page.getByRole('region',{name:'Daily routines'});
 await expect(routines.locator('.routine-card')).toHaveCount(3);
 await expect(routines).toContainText('Personal morning opening');
 await expect(routines).toContainText('Hangar47 workday opening');
 await expect(routines).toContainText('Hangar47 workday shutdown');
 await expect(page.locator('#tasks')).not.toContainText('Daily routines');
 await expect(routines.locator('a')).toHaveCount(3);
 await expect(routines.locator('textarea[readonly]')).toHaveCount(3);
 expect(await routines.locator('a').evaluateAll(links=>links.map(link=>link.href))).toEqual(Array(3).fill('https://chatgpt.com/'));
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await routines.getByRole('button',{name:'Copy Personal morning opening prompt'}).click();
 await expect(page.locator('#routine-status')).toContainText('Prompt copied');
 await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('Personal morning opening');
 await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft.length,key)).toBe(1);
 await page.setViewportSize({width:375,height:812});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await expect.poll(()=>routines.locator('.routine-card').first().evaluate(element=>getComputedStyle(element.parentElement).gridTemplateColumns)).toMatch(/^[^ ]+$/);
});
test('legacy record, editable fields, persisted reload and mobile layout',async({page})=>{
 await page.getByRole('button',{name:'Projects',exact:true}).click();
 await page.locator('.project-card').filter({hasText:'Example'}).locator('summary').first().click();
 const task=page.locator('.task');
 await expect(task).toContainText(old.title);
 await task.getByLabel('Status',{exact:true}).selectOption('In progress');
 await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft[0].status,key)).toBe('In progress');
 await task.getByText('Planning and notes',{exact:true}).click();
 const today=await page.evaluate(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')});
 const draft=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft[0],key);
 const edit=async(label,value,field)=>{const input=task.getByLabel(label,{exact:true});await input.fill(value);await input.press('Tab');await expect.poll(async()=>(await draft())[field]).toBe(field==='durationMinutes'?Number(value):value)};
 await edit('Planned working date',today,'plannedDate');
 await edit('Estimated minutes (optional)','35','durationMinutes');
 await task.getByLabel('Responsibility',{exact:true}).selectOption('Collaborative');
 await expect.poll(async()=>(await draft()).responsibility).toBe('Collaborative');
 await task.getByLabel('Area',{exact:true}).selectOption('Hangar47');
 await expect.poll(async()=>(await draft()).area).toBe('Hangar47');
 await task.getByLabel('Commitment type',{exact:true}).selectOption('fixed');
 await expect.poll(async()=>(await draft()).commitmentType).toBe('fixed');
 await edit('Task notes','Synthetic notes','notes');
 await edit('Progress notes','Synthetic progress','progressNotes');
 await edit('Conversation link','https://example.org/chat','conversationUrl');
 await edit('Resource link','https://example.org/resource','resourceUrl');
 await expect(task.getByLabel('Optional deadline')).toHaveValue('');
 await expect(task.getByRole('link',{name:'Open resource link'})).toHaveAttribute('href','https://example.org/resource');
 await page.getByRole('button',{name:'Today',exact:true}).click();
 await expect(task).toContainText(old.title);
 await page.reload();
 await expect(page.locator('#notice')).toContainText('Sign in');
 await page.getByRole('button',{name:'In progress',exact:true}).click();
 await task.getByText('Planning and notes',{exact:true}).click();
 await expect(task.getByLabel('Progress notes',{exact:true})).toHaveValue('Synthetic progress');
 await expect(task.getByLabel('Estimated minutes (optional)',{exact:true})).toHaveValue('35');
 await expect(task.getByLabel('Area',{exact:true})).toHaveValue('Hangar47');
 await page.setViewportSize({width:375,height:812});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await expect(task.getByLabel('Resource link',{exact:true})).toBeVisible();
});

test('dashboard separates focus, waiting, tomorrow, projects and category filters',async({page})=>{
 const today=await page.evaluate(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')});
 const tomorrow=await page.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')});
 const make=(id,title,status,project,extra={})=>({id,title,status,project,deadline:'',plannedDate:'',durationMinutes:null,responsibility:'',commitmentType:'flexible',area:'',notes:'',progressNotes:'',conversationUrl:'',resourceUrl:'',version:1,...extra});
 const tasks=[
  make('11111111-1111-4111-8111-111111111111','Today focus','Next action','Personal', {plannedDate:today,durationMinutes:40,responsibility:'ChatGPT',area:'Personal'}),
  make('22222222-2222-4222-8222-222222222222','Waiting task','Waiting','Hangar47'),
  make('33333333-3333-4333-8333-333333333333','Tomorrow task','Next action','Personal Training',{plannedDate:tomorrow}),
  make('44444444-4444-4444-8444-444444444444','Future in progress','In progress','Hangar47',{plannedDate:tomorrow}),
  make('55555555-5555-4555-8555-555555555555','Unknown duration today','Scheduled','Personal',{plannedDate:today})
 ];
 await page.evaluate(({key,tasks})=>localStorage.setItem(key,JSON.stringify({base:tasks,draft:tasks})),{key,tasks});
 await page.reload();
 await expect(page.locator('#notice')).toContainText('Sign in');
 await expect(page.getByText('Today’s Focus')).toBeVisible();
 await expect(page.locator('#tasks')).toContainText('Today focus');
 await expect(page.locator('.focus-panel').first()).toContainText('Known task time: 40m');
 await expect(page.locator('#tasks')).toContainText('Waiting for Others');
 await expect(page.locator('#tasks')).toContainText('Waiting task');
 await expect(page.locator('#tasks')).toContainText('Tomorrow task');
 await expect(page.locator('.focus-panel').first()).not.toContainText('Future in progress');
 await page.getByRole('button',{name:'In progress',exact:true}).click();
 await expect(page.locator('#tasks')).toContainText('Future in progress');
 await page.getByRole('button',{name:'Projects',exact:true}).click();
 await expect(page.locator('.project-card')).toHaveCount(3);
 await page.locator('.project-card[data-project="Hangar47"] > summary').first().click();
 await expect(page.locator('.project-card[data-project="Hangar47"]')).toContainText('In progress');
 await page.getByRole('button',{name:'Hangar47',exact:true}).click();
 await expect(page.locator('#tasks')).toContainText('Waiting task');
 await expect(page.locator('#tasks')).not.toContainText('Today focus');
 await page.setViewportSize({width:375,height:812});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('offline edits sync on sign-in and later remote changes sync on focus',async({page})=>{
 let authenticated=false;
 let remote={revision:0,tasks:[]};
 const patches=[];
 await page.unroute('**/api/**');
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/api/login'&&request.method()==='POST'){
   authenticated=true;return route.fulfill({status:200,contentType:'application/json',body:'{"signedIn":true}'});
  }
  if(url.pathname==='/api/tasks'&&request.method()==='GET'){
   if(!authenticated)return route.fulfill({status:401,contentType:'application/json',body:'{"error":"Sign in"}'});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(remote)});
  }
  if(url.pathname==='/api/tasks'&&request.method()==='PATCH'){
   if(!authenticated)return route.fulfill({status:401,contentType:'application/json',body:'{"error":"Sign in"}'});
   const body=request.postDataJSON();patches.push(body.changes);
   for(const change of body.changes){
    const task={...change.after,version:++remote.revision};
    const index=remote.tasks.findIndex(item=>item.id===task.id);
    if(index<0)remote.tasks.push(task);else remote.tasks[index]=task;
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(remote)});
  }
  return route.fulfill({status:404,contentType:'application/json',body:'{"error":"Not found"}'});
 });
 await page.evaluate(({key,old})=>localStorage.setItem(key,JSON.stringify({base:[],draft:[old]})),{key,old});
 await page.reload();
 await expect(page.locator('#notice')).toContainText('Sign in');
 await page.getByRole('button',{name:'Projects',exact:true}).click();
 await page.locator('.project-card').filter({hasText:'Example'}).locator('summary').first().click();
 const task=page.locator('.task');
 await task.getByLabel('Status',{exact:true}).selectOption('In progress');
 await task.getByText('Planning and notes',{exact:true}).click();
 const today=await page.evaluate(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')});
 await task.getByLabel('Planned working date',{exact:true}).fill(today);
 await task.getByLabel('Planned working date',{exact:true}).press('Tab');
 await task.getByLabel('Progress notes',{exact:true}).fill('Offline progress note');
 await task.getByLabel('Progress notes',{exact:true}).press('Tab');
 await page.getByText('Settings',{exact:true}).click();
 await page.getByLabel('Owner key',{exact:true}).fill('A'.repeat(43));
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('#notice')).toContainText('Synced at');
 expect(patches).toHaveLength(1);
 expect(patches[0][0].after).toMatchObject({status:'In progress',plannedDate:today,progressNotes:'Offline progress note'});
 remote.tasks[0]={...remote.tasks[0],progressNotes:'Remote progress update',version:remote.tasks[0].version+1};
 await page.waitForTimeout(5100);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(task.getByLabel('Progress notes',{exact:true})).toHaveValue('Remote progress update');
});
