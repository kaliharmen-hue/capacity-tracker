// Parse diagnostic snapshots without inferring completion or deletion.
export function parsePlanner(snapshot) {
 const lines = String(snapshot.visibleText || "").split(/\n/).map(s=>s.trim()).filter(Boolean);
 const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
 const monthIndex = lines.findIndex((s,i)=>months.includes(s)&&/^\d{4}$/.test(lines[i+1]||""));
 if(monthIndex<0) throw new Error("Calendar month/year missing");
 const year=Number(lines[monthIndex+1]), month=months.indexOf(lines[monthIndex])+1;
 const weekdays=["SUN","MON","TUE","WED","THU","FRI","SAT"];
 const days=[]; let day=null, section=null;
 const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
 const duration=/^(?:(\d+)h(?:\s+(\d+)m)?|(\d+)m)$/;
 const warnings=[];
 for(let i=monthIndex+2;i<lines.length;i++){
  const s=lines[i];
  if(weekdays.includes(s)&&/^\d{1,2}$/.test(lines[i+1]||"")){
   const n=Number(lines[++i]); const date=new Date(Date.UTC(year,month-1,n));
   const valid=date.getUTCMonth()===month-1&&weekdays[date.getUTCDay()]===s;
   day={date:valid?date.toISOString().slice(0,10):null,weekday:s,dayOfMonth:n,activities:[]};days.push(day);section=null;
   if(!valid) warnings.push("Ambiguous date: "+s+" "+n);
   continue;
  }
  const heading=s.match(/^(ANYTIME|MORNING|AFTERNOON|EVENING)\s*\((\d+)\)$/i);
  if(heading){section=heading[1].toLowerCase();continue;}
  if(!day||!section)continue;
  const next=lines[i+1]||"", after=lines[i+2]||"";
  if(time.test(next)&&time.test(after)){
   const mins=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
   const delta=mins(after)-mins(next);
   day.activities.push({title:s,section,start:next,end:after,durationMinutes:delta>=0?delta:null,completed:null});i+=2;
  }else{
   const d=next.match(duration);
   if(d){day.activities.push({title:s,section,start:null,end:null,durationMinutes:Number(d[1]||0)*60+Number(d[2]||d[3]||0),completed:null});i++;}
  }
 }
 return {capturedAt:snapshot.capturedAt,source:"tiimo-visible",coverage:"partial",tasks:(snapshot.inputs||[]).map(title=>({title,completed:null})),days,warnings};
}
