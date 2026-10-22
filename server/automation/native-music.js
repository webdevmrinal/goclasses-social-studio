// Copyright (c) 2026 Mrinal. All rights reserved.
import {instagramHashtags} from '../../shared/instagram.js';
import {nativeId,nativeBounds,xpathLiteral,isPhotoAccessPicker,cancelInstagramPhotoAccess} from './android-native.js';
import {InterventionError} from './utils.js';
const present=(nodes,name)=>nodes.some(n=>n.displayed==='true'&&n['resource-id']===nativeId(name));
export function musicClipPosition(nodes){
  const clips=nodes.filter(n=>n.displayed==='true'&&n.tag==='android.widget.SeekBar'&&n['content-desc']?.startsWith('Select the part of the audio track'));
  return clips.length===1&&/^\d+(?:\.\d+)?$/.test(clips[0].text||'')?clips[0].text:null;
}
export async function waitForMusicClip(s,readyControl,message){
  let previous=null;
  return s.until(nodes=>{
    const segmentStart=present(nodes,readyControl)?musicClipPosition(nodes):null;
    const stable=segmentStart!==null&&segmentStart===previous;previous=segmentStart;
    return stable?{nodes,segmentStart}:false;
  },message);
}
export function musicResults(nodes) {
  return nodes.flatMap((node,index)=>{
    const id=node['resource-id']?.match(/^audio_browser_track_\d+_(\d+)$/)?.[1];
    if(!id||node.displayed!=='true')return [];
    const following=nodes.findIndex((n,i)=>i>index&&/^audio_browser_track_\d+_\d+$/.test(n['resource-id']||''));
    const next=nodes.slice(index+1,following<0?nodes.length:following);
    const title=next.find(n=>n['resource-id']===nativeId('song_title'))?.text;
    const details=next.find(n=>n['resource-id']===nativeId('artist_name'))?.text;
    const match=details?.match(/^(.*?)\s*[\u2022\u00b7]\s*(\d+:\d+)$/u);
    return title&&match?[{key:id,title,artist:match[1].trim(),length:match[2],selector:node['resource-id']}]:[];
  });
}
// Lookup tolerates presentation differences; subsequent clip/Save guards use the
// exact native result returned here. Remixes and covers remain distinct titles.
export const normalizeMusicText=value=>String(value||'').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu,'$1').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}\p{M}]+/gu,' ').trim().replace(/\s+/g,' ');
const musicTitle=value=>normalizeMusicText(String(value||'').replace(/\s*[([ -]*(?:official audio|official music video|official video)[)\] ]*$/i,''));
export function matchesMusicReference(actual,expected){
 if(!actual||!expected||expected.key&&actual.key!==expected.key)return false;
 if(!musicTitle(expected.title)||musicTitle(actual.title)!==musicTitle(expected.title))return false;
 const artist=value=>normalizeMusicText(value).replace(/\b(?:feat|ft|featuring)\b/g,' ').replace(/\s+/g,' ').trim();
 const wanted=artist(expected.artist),credit=artist(actual.artist);
 return Boolean(wanted&&(' '+credit+' ').includes(' '+wanted+' ')&&(!expected.length||actual.length===expected.length));
}
export function visibleMusicChoice(nodes){
 const selected=nodes.filter(n=>n.displayed==='true'&&n['resource-id']==='audio_bar_select_tap_target');
 if(selected.length!==1)return null;
 const label=selected[0]['content-desc']||'',rows=musicResults(nodes).filter(r=>label==='Select track '+r.title+' by '+r.artist);
 const parts=label.match(/^Select track (.+) by (.+)$/u),track=(rows.length===1?rows[0]:null)||(parts?{title:parts[1],artist:parts[2]}:null);
 return track&&musicPlayback(nodes,track)!==null?track:null;
}
const candidate=(rows,chosen)=>{const matches=[...new Map(rows.filter(r=>matchesMusicReference(r,chosen)).map(r=>[r.key,r])).values()];return matches.length===1?matches[0]:matches.length>1?'ambiguous':null;};
// Manual navigation is resumed by a read-only verifier, never by replaying the
// action that failed. No Save/Share control is allowed in this handoff.
export async function assistNativeStage(s,ctx,details,attempt,inspect){
 try{return await attempt();}catch(error){
  s.signal?.throwIfAborted();if(!ctx?.intervene||error.name==='AccountMismatchError')throw error;
  return ctx.intervene({...details,reason:error.message},async()=>{s.signal?.throwIfAborted();return inspect(await s.screen());});
 }
}
export async function resolveMusic(s,chosen,ctx={}){
 const manual=async reason=>{
  if(!ctx.intervene)throw new InterventionError(reason);
  return ctx.intervene({kind:'music',title:'Choose the song in Instagram',instructions:'In the emulator, tap the song to preview it. Leave the music library open, then check your selection here. Do not tap the arrow, Done, Save or Share.',requested:{title:chosen.title,artist:chosen.artist},reason},async()=>visibleMusicChoice(await s.screen()));
 };
 try{
  let nodes=await s.screen();assertMusicLibrary(nodes);
  const preview=visibleMusicChoice(nodes);if(matchesMusicReference(preview,chosen))return preview;
  let found=candidate(musicResults(nodes),chosen);
  if(found==='ambiguous')return await manual('Several visible tracks match. Choose the version you want.');
  if(found)return found;
  await ctx.step?.('Looking for '+chosen.title+' in Instagram music...');
  const rows=await searchMusic(s,chosen.title);found=candidate(rows,chosen);
  if(found==='ambiguous')return await manual('Several tracks match this title and artist. Choose the version you want.');
  if(found)return found;
  // Only a short bounded browse; a person can finish a dynamic list faster.
  const seen=new Set([rows.map(r=>r.key).join(',')]);
  for(let i=0;rows.length&&i<2;i++){
   const next=await scrollMusicPage(s),stamp=next.map(r=>r.key).join(',');if(seen.has(stamp))break;seen.add(stamp);
   found=candidate(next,chosen);if(found==='ambiguous')return await manual('Several tracks match. Choose the version you want.');if(found)return found;
  }
  return await manual('The requested song could not be matched confidently.');
 }catch(error){s.signal?.throwIfAborted();if(!ctx.intervene)throw error;return manual(error.message);}
}
export async function previewMusicChoice(s,track){
 if(musicPlayback(await s.screen(),track)===null){
  if(!track.selector)throw new InterventionError('The approved preview changed. Check the selected song again.');
  await s.click('id',track.selector);await s.until(n=>musicPlayback(n,track)!==null,'The selected song preview changed.');
 }
}
const musicIndex=track=>Number(track.selector?.match(/^audio_browser_track_(\d+)_/)?.[1]??NaN);
function assertMusicLibrary(nodes){
  if(!present(nodes,'row_search_edit_text')||!nodes.some(n=>n.displayed==='true'&&/music_browser_container|music_search_clips_landing_page_container|audio_browser_track_/.test(n['resource-id']||'')))throw new InterventionError('The Instagram music library changed. Reopen the picker; no track was selected.');
}
export async function musicPage(s){
  let previous='',stable=0;
  return s.until(nodes=>{assertMusicLibrary(nodes);const rows=musicResults(nodes),stamp=JSON.stringify(rows);stable=stamp===previous?stable+1:0;previous=stamp;return rows.length&&stable>=1?rows:false;},'Instagram music is still loading. Try again.');
}
export async function expandMusicTray(s,{requireRows=true}={}){
  const nodes=await s.screen();assertMusicLibrary(nodes);
  const handle=nodes.find(n=>n.displayed==='true'&&n['resource-id']===nativeId('bottom_sheet_drag_handle_frame'));
  if(!handle){if(present(nodes,'music_browser_container')||present(nodes,'music_search_clips_landing_page_container'))return requireRows?musicPage(s):musicResults(nodes);throw new InterventionError('The native music tray handle is unavailable. Reopen the picker.');}
  const b=nativeBounds(handle),containers=nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('bottom_sheet_container')).map(nativeBounds),top=Math.min(...containers.map(b=>b.y));
  if(!Number.isFinite(top))throw new InterventionError('The music tray bounds are unavailable.');
  if(b.y>top+50){
    await s.adb(['shell','input','swipe',String(Math.round(b.x+b.width/2)),String(Math.round(b.y+b.height/2)),String(Math.round(b.x+b.width/2)),String(Math.round(top+b.height/2)),'500']);
    await s.until(nodes=>{assertMusicLibrary(nodes);const h=nodes.find(n=>n.displayed==='true'&&n['resource-id']===nativeId('bottom_sheet_drag_handle_frame'));return h&&nativeBounds(h).y<=top+50;},'Instagram did not expand the music tray.');
  }
  return requireRows?musicPage(s):musicResults(await s.screen());
}
export async function scrollMusicPage(s,direction='down'){
  const nodes=await s.screen();assertMusicLibrary(nodes);
  const lists=nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('content_list'));
  if(lists.length!==1||!['up','down'].includes(direction))throw new InterventionError('The music list is unavailable.');
  const b=nativeBounds(lists[0]),bar=nodes.find(n=>n.displayed==='true'&&n['resource-id']==='audio_bar'),bottom=Math.min(b.y+b.height,bar?nativeBounds(bar).y:Infinity)-24,top=b.y+24;
  if(bottom-top<150)throw new InterventionError('Expand the Instagram music tray before browsing.');
  const start=bottom-(bottom-top)*.08,end=top+(bottom-top)*.08,x=Math.round(b.x+b.width/2);
  await s.adb(['shell','input','swipe',String(x),String(Math.round(direction==='down'?start:end)),String(x),String(Math.round(direction==='down'?end:start)),'500']);
  return musicPage(s);
}
export async function revealMusicResult(s,chosen,onPage=()=>{}){
  const expected=musicIndex(chosen),seen=new Set();
  for(let i=0;i<18;i++){
    const rows=await musicPage(s);onPage(rows);
    const matches=rows.filter(r=>(!chosen.key||r.key===chosen.key)&&matchesMusicReference(r,chosen));
    if(matches.length>1)throw new InterventionError('More than one exact song matched. Add its Instagram audio link or ID. Nothing was selected.');
    if(matches.length===1)return matches[0];
    const stamp=rows.map(r=>r.key).join(',');if(seen.has(stamp))break;seen.add(stamp);
    const first=musicIndex(rows[0]),direction=Number.isFinite(expected)&&expected<first?'up':'down';
    onPage(await scrollMusicPage(s,direction));
  }
  throw new InterventionError('That exact song is no longer available in this list. Search again.');
}
export function musicPlayback(nodes,track){
  if(!nodes.some(n=>n.displayed==='true'&&n['resource-id']==='audio_bar_select_tap_target'&&n['content-desc']==='Select track '+track.title+' by '+track.artist))return null;
  const pause=nodes.some(n=>n.displayed==='true'&&n['content-desc']==='Pause track '+track.title+' by '+track.artist),play=nodes.some(n=>n.displayed==='true'&&n['content-desc']==='Play track '+track.title+' by '+track.artist);
  return pause===play?null:pause;
}
export async function setMusicPlayback(s,track,playing){
  const nodes=await s.screen();assertMusicLibrary(nodes);const current=musicPlayback(nodes,track);
  if(current===null)throw new InterventionError('The audio preview changed on the emulator. Preview the song again.');
  if(current!==playing)await s.click('id','audio_bar_playback_tap_target');
  await s.until(nodes=>musicPlayback(nodes,track)===playing,'Instagram did not confirm the playback change.');
  return {key:track.key,title:track.title,artist:track.artist,paused:!playing};
}
export function inheritedStoryAudio(nodes){
 const own=nodes.filter(n=>n.displayed==='true'&&n.package==='com.instagram.android'),unique=(id,desc)=>own.filter(n=>n['resource-id']===nativeId(id)&&(desc===undefined||n['content-desc']===desc)).length===1;
 if(!unique('music_editor_done_button','Done')||!unique('delete_button','Remove music')||!unique('album_art_button','Return to music search'))return null;
 const segmentStart=musicClipPosition(own),duration=own.filter(n=>/^\d+ second clip$/.test(n['content-desc']||''));if(segmentStart===null||duration.length!==1)return null;
 return {inherited:true,segmentStart,durationSeconds:Number(duration[0]['content-desc'].split(' ')[0]),verifiedBy:'native_inherited_audio_controls'};
}
export async function openStoryMusicLibrary(s){
  let nodes=await s.screen();
  if(present(nodes,'row_search_edit_text'))return;
  if(!present(nodes,'music_editor_done_button')){
    if(!present(nodes,'story_share_controls_action_bar')||!nodes.some(n=>n.displayed==='true'&&n['resource-id']==='music_button'))throw new InterventionError('The owned Story music controls changed. Nothing was shared.');
    await s.click('id','music_button');
    nodes=await s.until(nodes=>(present(nodes,'row_search_edit_text')||present(nodes,'music_editor_done_button'))&&nodes,'Story music did not open.');
  }
  // Reposts can inherit feed audio: Music opens its clip editor, not the library.
  // Use the observed return control, then reselect and verify the exact real ID.
  if(present(nodes,'music_editor_done_button')){
    if(!nodes.some(n=>n.displayed==='true'&&n['resource-id']===nativeId('album_art_button')&&n['content-desc']==='Return to music search'))throw new InterventionError('The inherited Story music cannot be changed safely. Nothing was shared.');
    await s.clickId('album_art_button');
  }
  await s.until(nodes=>present(nodes,'row_search_edit_text'),'Story music library did not open.');
}
export async function openMusicLibrary(s) {
  await s.until(nodes=>present(nodes,'media_thumbnail_tray_button'),'The Instagram photo editor is still loading.');
  await s.click('xpath','//android.widget.TextView[@text="Audio"]/parent::*');
  await s.until(nodes=>present(nodes,'row_search_edit_text'),'Instagram music is unavailable on this account.');
  return expandMusicTray(s);
}
export async function searchMusic(s,query) {
  await expandMusicTray(s,{requireRows:false});
  await s.clickId('row_search_edit_text');
  await s.text('id',nativeId('row_search_edit_text'),query);
  await s.until(nodes=>nodes.some(n=>n['resource-id']===nativeId('row_search_edit_text')&&n.text===query),'Instagram did not accept the music query.');
  // Hiding only the observed keyboard reveals more actual library results.
  const nodes=await s.screen();
  if(nodes.some(n=>n['resource-id']==='android:id/input_method_nav_back'))await s.click('id','android:id/input_method_nav_back');
  await new Promise(resolve=>setTimeout(resolve,1200));
  let stamp='',stable=0;
  const result=await s.until(nodes=>{
    const results=musicResults(nodes);
    const next=JSON.stringify(results);stable=next===stamp?stable+1:0;stamp=next;
    return results.length&&stable>=2?results:nodes.some(n=>/no results|couldn't find/i.test(n.text||''))?[]:false;
  },'Instagram music search did not finish. Try a more specific title or artist.');
  return result;
}
export function feedMusicClip(nodes,chosen){
  const visible=nodes.filter(n=>n.displayed==='true'),unique=id=>visible.filter(n=>n['resource-id']===nativeId(id));
  if(unique('music_editor_controls_container').length!==1||unique('bottom_sheet_done_button').length!==1||unique('song_title').length!==1||unique('track_artist').length!==1)return null;
  if(unique('song_title')[0].text!==chosen.title||unique('track_artist')[0].text!==chosen.artist)return null;
  const segmentStart=musicClipPosition(visible),durations=visible.filter(n=>/^\d+ second clip$/.test(n['content-desc']||''));
  if(segmentStart===null||durations.length!==1)return null;
  const durationSeconds=Number(durations[0]['content-desc'].match(/^\d+/)[0]);
  if(durationSeconds<1||durationSeconds>90)return null;
  return {durationSeconds,segmentStart,durationDescription:durations[0]['content-desc'],bounds:unique('music_editor_controls_container')[0].bounds};
}
export async function waitForFeedMusicClip(s,chosen){
  let previous='';
  return s.until(nodes=>{const clip=feedMusicClip(nodes,chosen),stamp=clip?JSON.stringify(clip):'';const stable=stamp&&stamp===previous;previous=stamp;return stable?clip:false;},'Instagram music review is still loading or does not match the selected track. Nothing was shared.');
}
export async function configureFeedMusicClip(s,chosen,duration=30,onProgress=async()=>{}){
  if(![15,30].includes(duration))throw new InterventionError('Choose a 15 or 30 second music clip. Nothing was shared.');
  await onProgress('Checking the selected song and native clip duration...');
  let clip=await waitForFeedMusicClip(s,chosen);
  // Native Instagram exposes the actual duration on the clip control. Avoid
  // opening an unchanged NumberPicker, and target its semantic parent when needed.
  if(clip.durationSeconds!==duration){
    await onProgress('Setting the Instagram music clip to '+duration+' seconds...');
    await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('music_editor_controls_container'))+' and @displayed="true"]//*[@content-desc='+xpathLiteral(clip.durationDescription)+' and @displayed="true"]/parent::*[@clickable="true"]');
    const read=async()=>s.until(nodes=>{const fields=nodes.filter(n=>n.displayed==='true'&&n['resource-id']==='android:id/numberpicker_input');if(fields.length!==1||!/^\d+(?: SECONDS)?$/.test(fields[0].text||''))return false;return {seconds:parseInt(fields[0].text)};},'The Instagram clip duration picker did not load. Nothing was shared.');
    let {seconds}=await read();
    for(let i=0;seconds!==duration&&i<90;i++){
      const next=seconds+(seconds<duration?1:-1);
      await s.click('xpath','//android.widget.Button[@text='+xpathLiteral(next+' SECONDS')+' and @displayed="true"]');
      await s.until(nodes=>{const fields=nodes.filter(n=>n.displayed==='true'&&n['resource-id']==='android:id/numberpicker_input');return fields.length===1&&parseInt(fields[0].text)===next;},'Instagram did not confirm the requested clip duration. Nothing was shared.');
      ({seconds}=await read());
    }
    if(seconds!==duration)throw new InterventionError('The requested music duration could not be set. Nothing was shared.');
    await s.clickId('music_duration_picker_done_button');
    clip=await waitForFeedMusicClip(s,chosen);
    if(clip.durationSeconds!==duration)throw new InterventionError('The reviewed music duration changed. Nothing was shared.');
  }
  await onProgress('Confirming the song and returning to the photo editor...');
  await s.clickId('bottom_sheet_done_button');
  await s.until(nodes=>present(nodes,'media_thumbnail_tray_button')&&present(nodes,'audio_pill_empty_background')&&!present(nodes,'music_editor_controls_container'),'Instagram did not finish applying the verified music clip. Nothing was shared.');
  return {durationSeconds:clip.durationSeconds,segmentStart:clip.segmentStart};
}
export async function applyTrack(s,chosen,duration=30,onProgress,ctx){
  if(![15,30].includes(duration))throw new InterventionError('Choose a 15 or 30 second music clip. Nothing was shared.');
  const candidate=ctx?await resolveMusic(s,chosen,ctx):await revealMusicResult(s,chosen);
  await previewMusicChoice(s,candidate);
  await s.click('id','audio_bar_select_tap_target');
  await s.until(nodes=>present(nodes,'audio_pill_empty_background')&&present(nodes,'media_thumbnail_tray_button'),'Instagram did not apply the chosen song.');
  await s.clickId('audio_pill_empty_background');
  return {...candidate,...await configureFeedMusicClip(s,candidate,duration,onProgress)};
}
export const normalizeNativeCaption=value=>String(value??'').replace(/\r\n?/g,'\n').normalize('NFC').trim();
export function captionField(nodes){const fields=nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('caption_input_text_view'));return fields.length===1?fields[0]:null;}
export async function nativeCaption(s,caption) {
  if(instagramHashtags(caption).length>5)throw new InterventionError('Instagram accepts up to 5 hashtags. Edit this caption before posting; nothing was shared.');
  await s.clickId('media_thumbnail_tray_button');
  let nodes=await s.until(nodes=>present(nodes,'caption_input_text_view')&&nodes,'Instagram post review is still loading.');
  if(nodes.some(n=>n.text==='Sharing posts')){
    await s.click('xpath','//android.widget.TextView[@text="OK"]/parent::*');
    nodes=await s.until(nodes=>!nodes.some(n=>n.text==='Sharing posts')&&present(nodes,'caption_input_text_view')&&nodes,'Instagram sharing information did not close.');
  }
  await s.clickId('caption_input_text_view');
  await s.replaceText('id',nativeId('caption_input_text_view'),caption);
  nodes=await s.until(nodes=>normalizeNativeCaption(captionField(nodes)?.text)===normalizeNativeCaption(caption)&&nodes,'The Android caption does not match the reviewed draft. Nothing was shared.',8000);
  if(nodes.some(n=>n['resource-id']===nativeId('next_button_textview')&&n.text==='OK'))await s.clickId('next_button_textview');
  await s.until(nodes=>present(nodes,'share_footer_button'),'Instagram final review did not load.');
  // Caption editing can leave a fractional scroll offset. Capture all image
  // baselines at the same confirmed top position used after music review.
  await nativeReviewTop(s,await s.screen(),{restoreStart:true});
}
const reviewOverlay=nodes=>['music_editor_controls_container','music_editor_done_button','row_search_edit_text'].some(id=>present(nodes,id));
async function scrollPostReview(s,nodes,direction){
  const views=nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('scroll_view'));
  if(!present(nodes,'share_footer_button')||reviewOverlay(nodes)||views.length!==1)throw new InterventionError('The native post review changed. Nothing was shared.');
  const elementId=await s.find('xpath','//*[@resource-id='+xpathLiteral(nativeId('scroll_view'))+' and @displayed="true"]');
  const canScrollMore=await s.request('/execute/sync','POST',{script:'mobile: scrollGesture',args:[{elementId,direction,percent:.7}]});
  if(typeof canScrollMore!=='boolean')throw new InterventionError('Instagram did not confirm the review scroll position. Nothing was shared.');
  return {nodes:await s.until(nodes=>present(nodes,'share_footer_button')&&nodes,'The native review is still scrolling. Nothing was shared.'),canScrollMore};
}
async function nativeReviewTop(s,nodes,{restoreStart=false}={}){
  let atStart=!restoreStart;
  for(let attempt=0;attempt<8;attempt++){
    if(reviewOverlay(nodes))throw new InterventionError('The native post review changed. Nothing was shared.');
    if(atStart&&present(nodes,'share_footer_button')&&captionField(nodes)&&present(nodes,'photo_media_preview_image_view'))return nodes;
    const scrolled=await scrollPostReview(s,nodes,'up');nodes=scrolled.nodes;atStart=scrolled.canScrollMore===false;
  }
  if(atStart&&present(nodes,'share_footer_button')&&captionField(nodes)&&present(nodes,'photo_media_preview_image_view'))return nodes;
  throw new InterventionError('Instagram did not restore the image and caption review. Nothing was shared.');
}
export async function verifyNativeCaption(s,caption,music){
  let nodes=await nativeReviewTop(s,await s.screen());
  const matches=nodes=>present(nodes,'share_footer_button')&&normalizeNativeCaption(captionField(nodes)?.text)===normalizeNativeCaption(caption);
  if(!matches(nodes))throw new InterventionError('The Android post or caption changed after review. Nothing was shared.');
  if(music){
    let confirmed=false,didScroll=false;
    for(let attempt=0;attempt<8;attempt++){
      const titles=nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('music_track_title')),artists=nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('music_track_subtitle'));
      if(titles.length&&artists.length){
        if(titles.length!==1||artists.length!==1||titles[0].text!==music.title||artists[0].text!==music.artist)throw new InterventionError('The reviewed Instagram music changed. Nothing was shared.');
        confirmed=true;break;
      }
      nodes=(await scrollPostReview(s,nodes,'down')).nodes;didScroll=true;
    }
    if(!confirmed)throw new InterventionError('Instagram did not expose the selected song below the caption. Nothing was shared.');
    // Restore the same media/caption viewport before the final image hash check.
    nodes=await nativeReviewTop(s,nodes,{restoreStart:didScroll});
    if(!matches(nodes))throw new InterventionError('The Android caption changed during music review. Nothing was shared.');
  }
}
export async function discardPost(s,caption) {
  for(let i=0;i<14;i++){
    const nodes=(await s.screen()).filter(node=>node.displayed==='true');
    if(isPhotoAccessPicker(nodes)){await cancelInstagramPhotoAccess(s);continue;}
    const editor=nodes.find(n=>n['resource-id']===nativeId('caption_input_text_view'));
    if(editor&&normalizeNativeCaption(editor.text)!==normalizeNativeCaption(caption))throw new InterventionError('The Android draft was changed by someone. It was preserved.');
    if(nodes.some(n=>n.text==='Start over?'&&n['resource-id']===nativeId('action_sheet_header_text_view'))){
      await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('action_sheet_row_text_view'))+' and @text="Start over"]');continue;
    }
    // Instagram retains the profile tab behind its music sheet. Close owned
    // editors first; a visible background profile tab is not proof of cleanup.
    if(nodes.some(n=>/music_browser_container|music_search_clips_landing_page_container|audio_browser_track_/.test(n['resource-id']||''))||present(nodes,'bottom_sheet_done_button')||present(nodes,'media_thumbnail_tray_button')||editor){await s.request('/back','POST',{});await new Promise(r=>setTimeout(r,300));continue;}
    if(present(nodes,'new_post_title')&&present(nodes,'action_bar_cancel')){await s.clickId('action_bar_cancel');await new Promise(r=>setTimeout(r,300));continue;}
    if(present(nodes,'profile_tab'))return;
    throw new InterventionError('The Android screen changed. Its draft was preserved for review.');
  }
  throw new InterventionError('Close the owned Android draft before starting another run.');
}
