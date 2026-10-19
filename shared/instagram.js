// Copyright (c) 2026 Mrinal. All rights reserved.
import { detectManychatLinks, instagramPostUrl } from './manychat.js';
export const INSTAGRAM_STORY = { id:'instagramStory', delimiter:'INSTAGRAM_STORY', name:'Instagram Story', detail:'Share the feed post', color:'#c54786', icon:'instagram', maxImages:0, limit:0, optionalImport:true, textOnly:true, parentId:'instagram' };
export const DEFAULT_STORY_LAYOUT = {card:{x:.5,y:.43,width:.8},link:{x:.5,y:.81,width:.66}};
export function storyUrl(value) {
  try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&u.hostname&&u.href.length<=2048?u.href:null; } catch{return null;}
}
export function storyLinks(captions={}) {
  const found=[],seen=new Set();
  for(const id of ['instagramStory','linkedin','youtubeDA','youtubeCS','manychat','telegram','whatsapp','instagram']) {
    for(const link of detectManychatLinks(captions[id]||'')) {
      const url=storyUrl(link.url); if(!url||seen.has(url))continue;seen.add(url);
      const admission=/appl|admission|forms/i.test(link.label+' '+url);
      found.push({url,label:admission?'Application Form':link.label,source:id,score:admission?1:0});
    }
  }
  return found.sort((a,b)=>b.score-a.score);
}
export function storyLayout(value=DEFAULT_STORY_LAYOUT) {
  const out={};
  for(const key of ['card','link']){
    const v=value?.[key];
    if(!v||!['x','y','width'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])))throw new Error('Instagram Story: invalid item placement.');
    const minWidth=key==='card'?.45:.3,maxWidth=key==='card'?.88:.8;
    if(v.width<minWidth||v.width>maxWidth||v.x<v.width/2+.02||v.x>1-v.width/2-.02||v.y<(key==='card'?.26:.69)||v.y>(key==='card'?.62:.88))throw new Error('Instagram Story: keep items inside the safe area.');
    out[key]={x:v.x,y:v.y,width:v.width};
  }
  return out;
}
export function instagramOptions(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid Instagram options.');
  const music=value.music||{},story=value.story||{};
  if(typeof music!=='object'||typeof story!=='object'||Array.isArray(music)||Array.isArray(story))throw new Error('Invalid Instagram options.');
  if(music.enabled!==undefined&&typeof music.enabled!=='boolean'||story.enabled!==undefined&&typeof story.enabled!=='boolean'||story.linkEnabled!==undefined&&typeof story.linkEnabled!=='boolean')throw new Error('Invalid Instagram option switch.');
  const selection=music.selection;
  if((music.enabled)&&(!selection||typeof selection.id!=='string'||!/^[a-f0-9-]{36}$/.test(selection.id)))throw new Error('Instagram: choose a song from the Android music picker.');
  const source=typeof story.sourcePostUrl==='string'?story.sourcePostUrl.trim():'';
  if(source&&!instagramPostUrl(source))throw new Error('Instagram Story: use an exact Instagram post URL.');
  return {music:{enabled:music.enabled===true,...(selection?{selection:structuredClone(selection)}:{})},story:{enabled:story.enabled===true,linkEnabled:story.linkEnabled!==false,url:typeof story.url==='string'?story.url.trim():'',label:typeof story.label==='string'?story.label.trim():'',sourcePostUrl:source?instagramPostUrl(source):'',layout:storyLayout(story.layout)}};
}
export function storyErrors(story={},selected=[]) {
  const errors=[];
  if(story.linkEnabled!==false&&!storyUrl(story.url))errors.push('Instagram Story: choose or enter an HTTP(S) link.');
  if(story.linkEnabled!==false&&(typeof story.label!=='string'||!story.label.trim()||[...story.label.trim()].length>20))errors.push('Instagram Story: use a button label of 1-20 characters.');
  if(!selected.includes('instagram')&&!instagramPostUrl(story.sourcePostUrl))errors.push('Instagram Story: include the feed post or enter its exact published URL.');
  if(selected.includes('instagram')&&story.sourcePostUrl)errors.push('Instagram Story: clear the existing post URL to share the new feed post.');
  try{storyLayout(story.layout);}catch(e){errors.push(e.message);}
  return errors;
}
export function importStory(captions) {
  const raw=captions.instagramStory||'',link=storyLinks({instagramStory:raw})[0];
  return {enabled:Boolean(raw.trim()),linkEnabled:Boolean(link),url:link?.url||'',label:link?.label||'',sourcePostUrl:'',layout:structuredClone(DEFAULT_STORY_LAYOUT)};
}
