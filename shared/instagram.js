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
    const epsilon=1e-9;
    if(v.width<minWidth-epsilon||v.width>maxWidth+epsilon||v.x<v.width/2+.02-epsilon||v.x>1-v.width/2-.02+epsilon||v.y<(key==='card'?.26:.69)-epsilon||v.y>(key==='card'?.62:.88)+epsilon)throw new Error('Instagram Story: keep items inside the safe area.');
    out[key]={x:v.x,y:v.y,width:v.width};
  }
  return out;
}
// Explicit feed transport; older reviewed drafts keep their original behavior.
export const instagramHashtags=text=>[...String(text||'').matchAll(/(^|[^\p{L}\p{N}_])#([\p{L}\p{M}\p{N}_]+)/gu)].map(m=>'#'+m[2]);
export function instagramMethod(value={}) {
  return value?.postingMethod ?? (value?.music?.enabled===true?'android':'web');
}
export function usesInstagramAndroid(value,id='instagram') {
  return id==='instagramStory'||id==='instagram'&&instagramMethod(value)==='android';
}
export function instagramMusicEnabled(value,id='instagram') {
  return value?.music?.enabled===true&&usesInstagramAndroid(value,id);
}
export function instagramOptions(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid Instagram options.');
  const music=value.music||{},story=value.story||{},postingMethod=instagramMethod(value);
  if(!['web','android'].includes(postingMethod))throw new Error('Instagram: choose Web or Android for feed posting.');
  if(typeof music!=='object'||typeof story!=='object'||Array.isArray(music)||Array.isArray(story))throw new Error('Invalid Instagram options.');
  if(music.enabled!==undefined&&typeof music.enabled!=='boolean'||story.enabled!==undefined&&typeof story.enabled!=='boolean'||story.linkEnabled!==undefined&&typeof story.linkEnabled!=='boolean')throw new Error('Invalid Instagram option switch.');
  const selection=music.selection;
  const enabled=music.enabled===true&&(postingMethod==='android'||story.enabled===true);
  if(enabled&&(!selection||typeof selection.id!=='string'||!/^[a-f0-9-]{36}$/.test(selection.id)))throw new Error('Instagram: choose a song from the Android music picker.');
  const source=typeof story.sourcePostUrl==='string'?story.sourcePostUrl.trim():'';
  if(source&&!instagramPostUrl(source))throw new Error('Instagram Story: use an exact Instagram post URL.');
  return {postingMethod,music:{enabled,...(selection?{selection:structuredClone(selection)}:{})},story:{enabled:story.enabled===true,linkEnabled:story.linkEnabled!==false,url:typeof story.url==='string'?story.url.trim():'',label:typeof story.label==='string'?story.label.trim():'',sourcePostUrl:source?instagramPostUrl(source):'',layout:storyLayout(story.layout)}};
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

// Positions stay normalized so mouse, touch and keyboard edits share the same review.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function snapStoryPosition(layout,key,x,y,{hasLink=true,cardHeight=.53,linkHeight=.07,thresholdX=.025,thresholdY=.016}={}){
  const item=layout[key];if(!item||!['card','link'].includes(key))throw new Error('Unknown Story item.');
  const other=key==='card'?'link':'card',minX=item.width/2+.02,maxX=1-item.width/2-.02,height=clamp(key==='card'?cardHeight:linkHeight,.03,.85),minY=key==='card'?Math.max(.26,.12+height/2):.69,maxY=key==='card'?Math.min(.62,.9-height/2):Math.min(.88,.9-height/2);
  if(minY>maxY)throw new Error('This Story item is too tall for the safe area. Use Auto-align or a smaller card.');
  x=clamp(x,minX,maxX);y=clamp(y,minY,maxY);
  const xs=[{position:.5,guide:.5}],ys=key==='card'?[.5]:[DEFAULT_STORY_LAYOUT.link.y];
  if(hasLink){
    const peer=layout[other];xs.push({position:peer.x,guide:peer.x},{position:peer.x-peer.width/2+item.width/2,guide:peer.x-peer.width/2},{position:peer.x+peer.width/2-item.width/2,guide:peer.x+peer.width/2});
    ys.push(key==='card'?layout.link.y-(cardHeight+linkHeight)/2-.05:layout.card.y+(cardHeight+linkHeight)/2+.05);
  }
  const near=(value,targets,threshold,min,max)=>targets.filter(t=>Number.isFinite(t)&&t>=min&&t<=max&&Math.abs(t-value)<=threshold).sort((a,b)=>Math.abs(a-value)-Math.abs(b-value))[0];
  const sx=xs.filter(t=>t.position>=minX&&t.position<=maxX&&Math.abs(t.position-x)<=thresholdX).sort((a,b)=>Math.abs(a.position-x)-Math.abs(b.position-x))[0],sy=near(y,ys,thresholdY,minY,maxY);
  return {x:sx?.position??x,y:sy??y,guides:{x:sx?.guide??null,y:sy??null}};
}
export function alignStoryItems(layout,{hasLink=true,cardHeight=.53,linkHeight=.07}={}){
  const result=storyLayout(layout),height=clamp(cardHeight,.1,.85),sticker=clamp(linkHeight,.03,.18),gap=.05;
  const minCard=Math.max(.26,.12+height/2),maxCard=Math.min(.62,.9-height/2);
  if(minCard>maxCard)throw new Error('The post card is too tall for the Story safe area. Check its native preview.');
  result.card.x=.5;
  if(!hasLink){result.card.y=clamp(.5,minCard,maxCard);return result;}
  result.link.x=.5;
  const top=.12+(.78-height-gap-sticker)/2;
  result.link.y=clamp(top+height+gap+sticker/2,.69,Math.min(.88,.9-sticker/2));
  const upper=Math.min(maxCard,result.link.y-sticker/2-gap-height/2);
  if(upper<minCard)throw new Error('The post card and link need more space. Check their native sizes before sharing.');
  result.card.y=clamp(result.link.y-sticker/2-gap-height/2,minCard,upper);
  return storyLayout(result);
}
