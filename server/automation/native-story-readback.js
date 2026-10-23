// Copyright (c) 2026 Mrinal. Read-only own-Story matching; no share/send controls.
import sharp from 'sharp';
import {nativeId,nativeBounds} from './android-native.js';
import {InterventionError} from './utils.js';
const own=n=>n.filter(x=>x.displayed==='true'&&x.package==='com.instagram.android');
export function ownStoryViewer(nodes,handle){
 const n=own(nodes),one=id=>n.filter(x=>x['resource-id']===nativeId(id));
 return one('reel_viewer_root').length===1&&one('reel_viewer_title').length===1&&one('reel_viewer_title')[0].text===handle&&one('self_toolbar_menu_button').length===1&&one('viewers_facepile_label').some(x=>x.text==='Activity');
}
export function storyAgeSeconds(value){
 const text=String(value||'').trim().toLowerCase();if(/^(now|just now)$/.test(text))return 0;
 const m=text.match(/^(\d+)\s*(s|m|h|d)$/);return m?Number(m[1])*({s:1,m:60,h:3600,d:86400}[m[2]]):null;
}
export async function storyPreviewPixels(image,canvas){
 return sharp(image).extract({left:Math.round(canvas.x+canvas.width*.15),top:Math.round(canvas.y+canvas.height*.18),width:Math.round(canvas.width*.70),height:Math.round(canvas.height*.70)}).resize(160,200,{fit:'fill'}).removeAlpha().raw().toBuffer();
}
export function compareStoryPixels(expected,actual){
 if(expected.length!==96000||actual.length!==expected.length)return {matches:false,meanDifference:255,closeFraction:0};
 let sum=0,close=0;for(let i=0;i<expected.length;i++){const d=Math.abs(expected[i]-actual[i]);sum+=d;if(d<=35)close++;}
 const meanDifference=sum/expected.length,closeFraction=close/expected.length;
 return {matches:meanDifference<=12&&closeFraction>=.90,meanDifference,closeFraction};
}
export function storyReadbackAvailable(nodes){
 const n=own(nodes),has=id=>n.some(x=>x['resource-id']===nativeId(id));
 if(n.some(x=>/story_share_controls_action_bar|share_story_button|music_editor_done_button|layout_edit_media_info_layout|caption_input_text_view/.test(x['resource-id']||'')||x.password==='true'))return false;
 return has('direct_external_share_container_view')||has('direct_private_share_container_view')||has('profile_tab')||has('row_feed_button_share')||has('reel_viewer_root');
}
export async function verifyOwnPublishedStory(s,{handle,preview,submittedAt,maxStories=8}={}){
 if(!handle||!preview||!Number.isFinite(submittedAt))throw new InterventionError('The reviewed Story comparison is unavailable. No Story was resent.');
 let nodes=await s.screen();
 if(!ownStoryViewer(nodes,handle)){
  await s.account(handle);nodes=await s.screen();
  const n=own(nodes),avatar=n.filter(x=>x['resource-id']===nativeId('row_profile_header_imageview')&&/^Your profile\..*story$/i.test(x['content-desc']||''));
  if(avatar.length!==1||!n.some(x=>x['resource-id']===nativeId('action_bar_title')&&x.text===handle))throw new InterventionError('The own-profile Story entry is unavailable. No Story was resent.');
  await s.clickId('row_profile_header_imageview_frame_layout');
  nodes=await s.until(n=>ownStoryViewer(n,handle)&&n,'The own Story viewer did not load. No Story was resent.',15000);
 }
 for(let i=0;i<maxStories;i++){
  s.signal?.throwIfAborted();if(!ownStoryViewer(nodes,handle))throw new InterventionError('Story verification left your own viewer. No Story was resent.');
  const current=own(nodes),age=storyAgeSeconds(current.find(x=>x['resource-id']===nativeId('reel_viewer_timestamp'))?.text),canvases=current.filter(x=>x['resource-id']===nativeId('reel_viewer_media_container'));
  if(age!==null&&age<=Math.max(0,(Date.now()-submittedAt)/1000)+90&&canvases.length===1){
   const canvas=nativeBounds(canvases[0]),actual=await storyPreviewPixels(await s.screenshot(),canvas),comparison=compareStoryPixels(preview,actual);
   if(comparison.matches)return {verifiedBy:'native_own_story_preview',instagramAccepted:true,acknowledgement:'matching_published_story',handle,ageSeconds:age,comparison,verifiedAt:new Date().toISOString(),completionDismissed:true};
  }
  if(i===maxStories-1)break;
  const canvas=current.find(x=>x['resource-id']===nativeId('reel_viewer_media_container'));if(!canvas)break;const b=nativeBounds(canvas);
  // The outer right margin advances a viewed Story, outside the centered card,
  // link, header and bottom actions. Never address Share, Send, or composer UI.
  await s.gesture([{type:'pointerMove',duration:0,x:Math.round(b.x+b.width*.97),y:Math.round(b.y+b.height*.55)},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]);
  await new Promise(resolve=>setTimeout(resolve,300));nodes=await s.screen();
 }
 throw new InterventionError('The published Story could not be matched to its reviewed card and link. Verify it before retrying; no Story was resent.');
}
