export function parseWeek(report) {
 const items=report.items||[], warnings=[];
 if(report.truncated) throw Error("Truncated report");
 const text=report.visibleText||"";
 const match=text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\n(\d{4})\nWEEK (\d+)/);
 if(!match) throw Error("Weekly calendar heading missing");
 const year=+match[2], week=+match[3];
 if(week<1||week>53) throw Error("Invalid ISO week");
 const month=new Date(Date.parse(match[1]+" 1, 2000 UTC")).getUTCMonth();
 const names=["MON","TUE","WED","THU","FRI","SAT","SUN"];
 const columns=names.map(name=>{
 const item=items.find(x=>x.text===name&&x.ancestors?.[0]?.tag==="H6");
 const rect=item?.ancestors?.[3]?.rect;
 if(!rect) throw Error("Missing day column "+name);
 const index=items.indexOf(item);
 return { day: Number(items[index+1]?.text), rect };
 });
 const candidates=[year-1,year,year+1].map(isoYear=>{
  const jan4=new Date(Date.UTC(isoYear,0,4));
  const monday=+jan4-((jan4.getUTCDay()+6)%7)*86400000+(week-1)*604800000;
  if(new Date(monday+3*86400000).getUTCFullYear()!==isoYear) return null;
  const dates=names.map((_,i)=>new Date(monday+i*86400000));
  return dates.some(date=>date.getUTCFullYear()===year&&date.getUTCMonth()===month)
   && dates.every((date,i)=>date.getUTCDate()===columns[i].day)?dates:null;
 }).filter(Boolean);
 if(candidates.length!==1) throw Error("Ambiguous week date");
 const days=candidates[0].map((date,i)=>({date:date.toISOString().slice(0,10),rect:columns[i].rect,activities:[]}));
 const ticks=items.filter(x=>/^(?:[01]\d|2[0-3]):00$/.test(x.text)&&x.ancestors?.[2]?.rect);
 if(ticks.length!==24||new Set(ticks.map(tick=>tick.text)).size!==24) throw Error("Incomplete hour grid");
 const zero=ticks.find(x=>x.text==="00:00").ancestors[2].rect[1];
 const scale=(ticks.find(x=>x.text==="23:00").ancestors[2].rect[1]-zero)/23;
 if(scale<=0||ticks.some(x=>Math.abs(x.ancestors[2].rect[1]-zero-Number(x.text.slice(0,2))*scale)>2)) throw Error("Irregular hour grid");
 for(const item of items){
 const a=item.ancestors||[];
 if(a[1]?.tag!=="P"||!/[\p{L}\p{N}]/u.test(item.text)) continue;
 const rect=a[3]?.rect;if(!rect)continue;
 const day=days.find(d=>rect[0]>=d.rect[0]&&rect[0]<d.rect[0]+d.rect[2]);
 if(!day)continue;
 // Entries before the first hour tick in DOM order belong to the anytime area.
 const flexible=items.indexOf(item)<items.indexOf(ticks[0]);
 const raw=(rect[1]-zero-8)*60/scale;
 const minutes=Math.round(raw/5)*5;
 const start=!flexible&&minutes>=0&&minutes<1440?String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0"):null;
 day.activities.push({title:item.text,start,flexible,timeConfidence:start?"estimated-grid":"unknown",durationMinutes:null,completed:null});
 }
 return {source:"tiimo-week",coverage:"partial",capturedAt:report.capturedAt,days:days.map(({rect,...day})=>day),warnings};
}
