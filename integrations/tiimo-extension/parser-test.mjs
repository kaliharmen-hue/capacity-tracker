import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseWeek} from './parse-week.mjs';
const source=await readFile(new URL('./parse-planner.js',import.meta.url),'utf8');
const {parsePlanner}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const snapshot={capturedAt:'2026-11-24T09:28:47.669Z',inputs:['Example task'],visibleText:'November\n2026\n3-days\nTUE\n24\nANYTIME (1)\nExample flexible\n30m\nAFTERNOON (1)\nExample timed\n12:45\n13:15\nWED\n25\nMORNING (0)'};
const parsed=parsePlanner(snapshot);
assert.equal(parsed.days[0].date,'2026-11-24');
assert.equal(parsed.days[0].activities.length,2);
assert.equal(parsed.days[0].activities[0].durationMinutes,30);
assert.equal(parsed.days[0].activities[1].start,'12:45');
assert.equal(parsed.days[0].activities[1].completed,null);
assert.equal(parsed.coverage,'partial');
const week=parsePlanner({...snapshot,visibleText:'November\n2026\nWEEK 48\nWeek\nMON\n23\nTUE\n24\nExample appointment\n1h'});
assert.equal(week.days.flatMap(d=>d.activities).length,0,'Do not assign weekly entries to guessed dates');
const rollover=parsePlanner({...snapshot,visibleText:'December\n2026\n3-days\nTHU\n31\nFRI\n1\nANYTIME (1)\nExample\n1h'});
assert.equal(rollover.days[1].date,'2027-01-01');
assert.throws(()=>parsePlanner({...snapshot,truncated:true}),/Truncated/);

const names=['MON','TUE','WED','THU','FRI','SAT','SUN'];
const columns=names.flatMap((name,i)=>[
 {text:name,ancestors:[{tag:'H6'},null,null,{rect:[i*100,0,100,48]}]},
 {text:String([28,29,30,31,1,2,3][i])},
]);
function grid(scale,offset) {
 return Array.from({length:24},(_,i)=>({
  text:String(i).padStart(2,'0')+':00',ancestors:[null,null,{rect:[0,offset+i*scale,40,scale]}],
 }));
}
const report={visibleText:'January\n2027\nWEEK 53',capturedAt:snapshot.capturedAt};
for(const [scale,offset] of [[60,0],[90,-240]]) {
 const entry={text:'Duplicate example',ancestors:[null,{tag:'P'},null,{rect:[420,offset+8+scale*2,40,20]}]};
 const parsedWeek=parseWeek({...report,items:[...columns,...grid(scale,offset),entry,entry]});
 assert.equal(parsedWeek.days[0].date,'2026-12-28');
 assert.equal(parsedWeek.days[4].activities.length,2);
 assert.equal(parsedWeek.days[4].activities[0].start,'02:00');
 assert.equal(parsedWeek.days[4].activities[0].completed,null);
}
const incomplete=[...columns,...grid(60,0).slice(0,-1)];
assert.throws(()=>parseWeek({...report,items:incomplete}),/Incomplete hour grid/);
assert.throws(()=>parseWeek({...report,items:[...incomplete,grid(60,0)[0]]}),/Incomplete hour grid/);
console.log('Parser regression checks passed');
