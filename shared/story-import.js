// Story metadata is separate from public caption text. No evaluation or HTML.
const marker=/^[ \t]*\[INSTAGRAM_STORY\][ \t]*$/gim;
export function stickerLabel(value){
 return [...String(value||'').normalize('NFC').replace(/[\u0000-\u001f\u007f\u200b\u2060]/g,' ').replace(/\s+/g,' ').trim()].slice(0,20).join('').trim();
}
export function importedStoryUrl(value){
 const text=String(value||'').trim().replace(/^<(.*)>$/,'$1').replace(/&(?:amp|#38|#x26);/gi,'&');
 try{const u=new URL(text);return ['http:','https:'].includes(u.protocol)&&u.hostname&&!u.username&&!u.password&&u.href.length<=2048?u.href:null;}catch{return null;}
}
export function rankedStoryLinks(links=[]){
 const seen=new Set();return (Array.isArray(links)?links:[]).filter(l=>l&&Number.isSafeInteger(l.priority)&&l.priority>0).map((l,index)=>({...l,index,url:importedStoryUrl(l.url),label:stickerLabel(l.label)})).filter(l=>l.url&&l.label).sort((a,b)=>a.priority-b.priority||a.index-b.index).filter(l=>{if(seen.has(l.url))return false;seen.add(l.url);return true;}).map(({priority,label,url})=>({priority,label,url}));
}
export function extractStoryImport(value){
 let text=String(value||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 const fenced=text.trim().match(/^```(?:text|plaintext)?[ \t]*\n([\s\S]*)\n```$/i);if(fenced)text=fenced[1];
 const starts=[...text.matchAll(marker)],ends=[...text.matchAll(/^[ \t]*\[\/INSTAGRAM_STORY\][ \t]*$/gim)],errors=[],warnings=[];
 if(!starts.length&&!ends.length)return {text,errors,warnings};
 if(starts.length!==1||ends.length!==1||ends[0].index<starts[0].index)return {text:'',errors:['Use one complete [INSTAGRAM_STORY] ... [/INSTAGRAM_STORY] block.'],warnings};
 const start=starts[0],end=ends[0],body=text.slice(start.index+start[0].length,end.index),links=[];let enabled=true,inLinks=false,seenEnabled=false;
 for(const raw of body.split('\n')){
  const line=raw.trim();if(!line||line.startsWith('#'))continue;
  const flag=line.match(/^enabled\s*:\s*(true|false)\s*$/i);if(flag){if(seenEnabled)errors.push('Story enabled must appear only once.');seenEnabled=true;enabled=flag[1].toLowerCase()==='true';continue;}
  if(/^links\s*:\s*(?:\[\s*\])?\s*$/i.test(line)){inLinks=true;continue;}
  const entry=line.match(/^(\d{1,6})\s*\|\s*([^|]*)\|\s*(.+)$/u);
  if(!inLinks||!entry){errors.push('Story links must use: 1 | Short label | https://example.com/');continue;}
  const priority=Number(entry[1]),label=stickerLabel(entry[2]),url=importedStoryUrl(entry[3]);
  if(!priority||!url){warnings.push('Skipped a Story link with an invalid priority or HTTP(S) URL.');continue;}
  if(label!==entry[2].trim())warnings.push('A Story label was cleaned or shortened to 20 characters.');
  links.push({priority,label:label||'View Details',url});
 }
 if(links.length>20)errors.push('Use at most 20 ranked Story links.');
 const ranked=rankedStoryLinks(links);
 return {text:text.slice(0,start.index)+'\n'+text.slice(end.index+end[0].length),story:{enabled,links:ranked},errors,warnings};
}

export function exportStoryImport(story={}){
 const links=rankedStoryLinks(story.importedLinks),current=importedStoryUrl(story.url),label=stickerLabel(story.label);
 let rows=story.linkEnabled!==false&&current&&label?[{priority:1,label,url:current},...links.filter(l=>l.url!==current).map((l,index)=>({...l,priority:index+2}))]:[];
 return '[INSTAGRAM_STORY]\nenabled: '+(story.enabled===true)+'\n'+(rows.length?'links:\n'+rows.map(l=>'  '+l.priority+' | '+l.label+' | '+l.url).join('\n'):'links: []')+'\n[/INSTAGRAM_STORY]';
}
