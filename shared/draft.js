// Copyright (c) 2026 Mrinal. Draft lifecycle helpers shared with offline tests.
import {PLATFORMS} from './platforms.js';
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
