// Copyright (c) 2026 Mrinal. Deterministic review of supplied captions, not external fact verification.
const platforms=['instagram','linkedin','x','youtubeDA','youtubeCS','manychat','whatsapp','telegram'];
const monthNames='jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const labels={vacancies:'Vacancies',deadline:'Deadline date',deadlineYear:'Deadline year',deadlineTime:'Deadline time',salary:'Monthly pay',marks:'Minimum marks'};
export function captionReviewKey(draft){return JSON.stringify(platforms.filter(id=>draft.selected?.includes(id)).map(id=>[id,String(draft.captions?.[id]||'')]));}
export function captionFacts(draft){
 const facts=[],issues=[];
 for(const id of platforms.filter(id=>draft.selected?.includes(id))){
  const text=String(draft.captions?.[id]||'').normalize('NFKC').replaceAll('\u00a0',' '),seen=new Set();
  for(const [lineIndex,raw] of text.split(/\r?\n/).entries()){
   const line=raw.replace(/https?:\/\/\S+/g,'').trim();if(!line)continue;
   const put=(kind,value,display=String(value))=>{const key=kind+':'+value;if(!seen.has(key)){facts.push({id,kind,value:String(value),display,snippet:line.slice(0,240)});seen.add(key);}};
   const suspicious=[...line.matchAll(new RegExp('\\b([OQIl]\\d{0,2}|\\d[OQIl]\\d?)\\s+(?:(?:temporary|[A-Za-z]+)\\s+){0,8}(?:posts?|vacancies|positions?|openings?)\\b','g')),...line.matchAll(new RegExp('\\b([OQIl]\\d{0,2}|\\d[OQIl]\\d?)\\s+(?:'+monthNames+')\\b','gi'))];
   for(const match of suspicious){if(!/[OQIl]/.test(match[1]))continue;const key='numeric:'+id+':'+lineIndex+':'+match[1];if(issues.some(i=>i.id===key))continue;issues.push({id:key,kind:'numeric',title:'Possible number typo',message:'“'+match[1]+'” contains a letter where a number is expected.',sources:[{id,value:match[1],snippet:line.slice(0,240)}]});}
   const direct=line.match(/\bvacanc(?:y|ies)\s*[:—–-]?\s*(\d{1,5})\b/i),reverse=line.match(/\b(\d{1,5})[ \t]+(?:(?!(?:years?|months?|days?|percent)\b)[a-z][a-z/-]*[ \t]+){0,9}(?:posts?|vacancies|positions?|openings?)\b/i);
   if(direct||reverse)put('vacancies',Number((direct||reverse)[1]));
   if(/\b(?:deadline|apply\s+by|last\s+date|closing\s+date)\b/i.test(line)){
    const date=line.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?[ \\t/-]*('+monthNames+')(?:[ \\t,/-]+(20\\d{2}))?\\b','i'));
    if(date){const day=Number(date[1]),month=months[date[2].slice(0,3).toLowerCase()],year=Number(date[3]||2024),valid=day>=1&&new Date(Date.UTC(year,month-1,day)).getUTCMonth()===month-1;if(valid){put('deadline',String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'),day+' '+date[2]);if(date[3])put('deadlineYear',year);}else issues.push({id:'date:'+id+':'+lineIndex,kind:'date',title:'Invalid calendar date',message:'Check this deadline date.',sources:[{id,value:date[0],snippet:line.slice(0,240)}]});}
    const time=line.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i);if(time){let hour=Number(time[1]);const minute=Number(time[2]),meridiem=time[3]?.toUpperCase();if(meridiem&&hour>=1&&hour<=12)hour=hour%12+(meridiem==='PM'?12:0);if(hour<24&&minute<60)put('deadlineTime',hour*60+minute,String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'));}
   }
   if(/\/\s*month\b|per\s+month\b|\bmonthly\b|\bsalary\b|\bstipend\b|\bremuneration\b/i.test(line)){
    const amount=line.match(/(?:₹|\bINR\s*|\bRs\.?\s*)([\d,]+(?:\.\d+)?)/i);if(amount)put('salary',Number(amount[1].replaceAll(',','')),amount[1]+'/month');
   }
   if(/\bminimum\b|\bat\s+least\b|\bmin\.?\s|≥/i.test(line)){const percent=line.match(/\b(\d{1,3}(?:\.\d+)?)\s*%/);if(percent)put('marks',Number(percent[1]),percent[1]+'%');}
  }
 }
 for(const [kind,title] of Object.entries(labels)){
  const values=facts.filter(f=>f.kind===kind),byPlatform=new Map();for(const f of values){const own=byPlatform.get(f.id)||[];own.push(f);byPlatform.set(f.id,own);}
  // Multiple values in a caption can describe different roles/categories. Do
  // not invent a single total or compare those categories automatically.
  const sources=[...byPlatform.values()].filter(v=>v.length===1).map(v=>v[0]);
  if(new Set(sources.map(f=>f.value)).size>1)issues.push({id:'conflict:'+kind,kind,title,message:title+' differs between selected captions.',sources:sources.map(f=>({id:f.id,value:f.display,snippet:f.snippet}))});
 }
 return {facts,issues};
}
export function captionReviewAccepted(draft,consent){return !captionFacts(draft).issues.length||consent?.reviewed===true&&consent.key===captionReviewKey(draft);}
