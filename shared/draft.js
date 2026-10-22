// Copyright (c) 2026 Mrinal. Draft lifecycle helpers shared with offline tests.
import {PLATFORMS} from './platforms.js';
import {TEXT_ONLY_PLATFORMS} from './media.js';
import {DEFAULT_STORY_LAYOUT,instagramMethod} from './instagram.js';
export function freshDraft(postingMethod='web'){
 return {captions:Object.fromEntries(PLATFORMS.map(p=>[p.id,''])),selected:[],mediaIds:[],mediaByPlatform:{},textOnlyPlatforms:[],manychat:{postUrl:'',links:[],linksMode:'auto'},instagram:{postingMethod,music:{enabled:false},story:{enabled:false,linkEnabled:false,url:'',label:'',sourcePostUrl:'',layout:structuredClone(DEFAULT_STORY_LAYOUT)}}};
}
export function workspaceFingerprint(draft){return JSON.stringify(Object.fromEntries(['captions','selected','mediaIds','mediaByPlatform','textOnlyPlatforms','manychat','instagram'].map(key=>[key,draft[key]])));}
export function reconcilePublishedDraft(draft,run){
 const marker=draft.submission;if(!marker||marker.runId!==run?.id||run.mode!=='LIVE'||!['completed','completed_with_errors','stopped','interrupted'].includes(run.status))return null;
 const next=structuredClone(draft);delete next.submission;
 if(marker.fingerprint!==workspaceFingerprint(draft))return {draft:next,cleared:false};
 const posted=run.items.filter(item=>item.status==='posted').map(item=>item.id);if(!posted.length)return {draft:next,cleared:false};
 if(next.selected.every(id=>posted.includes(id)))return {draft:freshDraft(instagramMethod(next.instagram)),cleared:true};
 for(const id of posted)next.captions[id]='';next.selected=next.selected.filter(id=>!posted.includes(id));
 const postUrl=run.items.find(item=>item.id==='instagram'&&item.status==='posted')?.publication?.postUrl;
 if(posted.includes('instagram')){next.instagram.music={enabled:false};if(postUrl){next.instagram.story.sourcePostUrl=postUrl;if(!posted.includes('manychat'))next.manychat.postUrl=postUrl;}}
 if(posted.includes('instagramStory'))next.instagram.story=freshDraft().instagram.story;
 if(posted.includes('manychat'))next.manychat=freshDraft().manychat;
 return {draft:next,cleared:false,posted};
}

export function restartChoices(run){
 const items=new Map((run.items||[]).map(item=>[item.id,item])),ids=new Set(items.keys()),linked=Boolean(run.instagram?.story?.sourcePostUrl||run.sourceInstagramPublication?.postUrl);
 if(ids.has('instagramMusic')||ids.has('instagramStory')||run.instagram?.story?.enabled)ids.add('instagram');
 if(run.instagram?.story?.enabled)ids.add('instagramStory');
 const rows=PLATFORMS.filter(p=>ids.has(p.id)).map(p=>{const item=items.get(p.id),published=item?.status==='posted'||p.id==='instagram'&&linked,uncertain=item?.status==='uncertain';return {id:p.id,published,uncertain,available:Boolean(run.captions?.[p.id]?.trim()),checked:!published&&!uncertain};});
 if(ids.has('instagramStory')){const item=items.get('instagramStory');rows.push({id:'instagramStory',published:item?.status==='posted',uncertain:item?.status==='uncertain',available:Boolean(run.captions?.instagram?.trim()),checked:item?.status!=='posted'&&item?.status!=='uncertain'});}
 return rows;
}
export function draftFromRun(run,selected){
 const choices=restartChoices(run),requested=selected??choices.filter(c=>c.available&&c.checked&&(c.id!=='instagramStory'||choices.some(p=>p.id==='instagram'&&p.available&&p.checked))).map(c=>c.id);
 if(!Array.isArray(requested)||new Set(requested).size!==requested.length||requested.some(id=>!choices.some(c=>c.id===id&&c.available&&!c.uncertain)))throw new Error('Choose available destinations. Verify uncertain outcomes in Activity first.');
 if(requested.includes('instagramStory')&&!requested.includes('instagram'))throw new Error('Select Instagram feed to create a new Story source.');
 if(!requested.length)throw new Error('Select at least one destination.');
 const d=freshDraft(instagramMethod(run.instagram));d.restartOf=run.id;d.captions=Object.fromEntries(PLATFORMS.map(p=>[p.id,typeof run.captions?.[p.id]==='string'?run.captions[p.id]:'']));d.captions.instagramStory=run.captions?.instagramStory||'';d.selected=choices.filter(c=>requested.includes(c.id)).map(c=>c.id);
 d.mediaIds=[...new Set((run.media||[]).map(m=>m.id))];
 d.mediaByPlatform=Object.fromEntries(PLATFORMS.filter(p=>Object.hasOwn(run.mediaByPlatform||{},p.id)).map(p=>[p.id,[...new Set(run.mediaByPlatform[p.id].filter(id=>d.mediaIds.includes(id)))]]));
 d.textOnlyPlatforms=TEXT_ONLY_PLATFORMS.filter(id=>Object.hasOwn(d.mediaByPlatform,id)&&d.mediaByPlatform[id].length===0);
 d.instagram={postingMethod:instagramMethod(run.instagram),music:structuredClone(run.instagram?.music||{enabled:false}),story:{...d.instagram.story,...structuredClone(run.instagram?.story||{}),enabled:d.selected.includes('instagramStory'),sourcePostUrl:''}};
 d.manychat={postUrl:'',links:structuredClone(run.manychat?.links||[]),linksMode:run.manychat?.linksMode||'auto'};
 return d;
}
