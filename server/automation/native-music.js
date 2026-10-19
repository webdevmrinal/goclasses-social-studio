// Copyright (c) 2026 Mrinal. All rights reserved.
import {nativeId,nativeBounds,xpathLiteral} from './android-native.js';
import {InterventionError} from './utils.js';
const present=(nodes,name)=>nodes.some(n=>n.displayed==='true'&&n['resource-id']===nativeId(name));
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
const musicIndex=track=>Number(track.selector?.match(/^audio_browser_track_(\d+)_/)?.[1]??NaN);
function assertMusicLibrary(nodes){
  if(!present(nodes,'row_search_edit_text')||!nodes.some(n=>n.displayed==='true'&&/music_browser_container|music_search_clips_landing_page_container|audio_browser_track_/.test(n['resource-id']||'')))throw new InterventionError('The Instagram music library changed. Reopen the picker; no track was selected.');
}
export async function musicPage(s){
  let previous='',stable=0;
  return s.until(nodes=>{assertMusicLibrary(nodes);const rows=musicResults(nodes),stamp=JSON.stringify(rows);stable=stamp===previous?stable+1:0;previous=stamp;return rows.length&&stable>=1?rows:false;},'Instagram music is still loading. Try again.');
}
export async function expandMusicTray(s){
  const nodes=await s.screen();assertMusicLibrary(nodes);
  const handle=nodes.find(n=>n.displayed==='true'&&n['resource-id']===nativeId('bottom_sheet_drag_handle_frame'));
  if(!handle){if(present(nodes,'music_browser_container'))return musicPage(s);throw new InterventionError('The native music tray handle is unavailable. Reopen the picker.');}
  const b=nativeBounds(handle),containers=nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('bottom_sheet_container')).map(nativeBounds),top=Math.min(...containers.map(b=>b.y));
  if(!Number.isFinite(top))throw new InterventionError('The music tray bounds are unavailable.');
  if(b.y>top+50){
    await s.adb(['shell','input','swipe',String(Math.round(b.x+b.width/2)),String(Math.round(b.y+b.height/2)),String(Math.round(b.x+b.width/2)),String(Math.round(top+b.height/2)),'500']);
    await s.until(nodes=>{assertMusicLibrary(nodes);const h=nodes.find(n=>n.displayed==='true'&&n['resource-id']===nativeId('bottom_sheet_drag_handle_frame'));return h&&nativeBounds(h).y<=top+50;},'Instagram did not expand the music tray.');
  }
  return musicPage(s);
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
    const matches=rows.filter(r=>r.key===chosen.key&&r.title===chosen.title&&r.artist===chosen.artist&&(!chosen.length||r.length===chosen.length));
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
  await expandMusicTray(s);
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
export async function applyTrack(s,chosen,duration=30) {
  const candidate=await revealMusicResult(s,chosen);let nodes;
  await s.click('id',candidate.selector);
  await s.until(nodes=>musicPlayback(nodes,chosen)!==null,'Instagram track preview is still loading.');
  await s.click('id','audio_bar_select_tap_target');
  await s.until(nodes=>present(nodes,'audio_pill_empty_background')&&present(nodes,'media_thumbnail_tray_button'),'Instagram did not apply the chosen song.');
  await s.clickId('audio_pill_empty_background');
  nodes=await s.until(nodes=>present(nodes,'music_editor_controls_container')&&nodes,'Instagram music clip editor is still loading.');
  if(nodes.find(n=>n['resource-id']===nativeId('song_title'))?.text!==chosen.title||nodes.find(n=>n['resource-id']===nativeId('track_artist'))?.text!==chosen.artist)throw new InterventionError('The applied song does not match the reviewed title and artist.');
  const seek=nodes.find(n=>n.tag==='android.widget.SeekBar'&&n['content-desc']?.startsWith('Select the part of the audio track'));
  if(!seek)throw new InterventionError('Instagram did not expose the clip position for verification.');
  const sb=nativeBounds(seek);
  const durationControl=nodes.find(n=>n.tag==='android.view.View'&&n.clickable==='true'&&n.displayed==='true'&&nativeBounds(n).x<sb.x&&Math.abs(nativeBounds(n).y-sb.y)<25&&nativeBounds(n).width<130);
  if(!durationControl)throw new InterventionError('Instagram clip duration control is unavailable.');
  await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('music_editor_controls_container'))+']//android.view.View[@bounds='+xpathLiteral(durationControl.bounds)+']');
  const read=async()=>+(await s.until(nodes=>nodes.find(n=>n['resource-id']==='android:id/numberpicker_input')?.text,'The duration picker did not open.')).match(/^\d+/)?.[0];
  let seconds=await read();
  if(![15,30].includes(duration))throw new Error('Choose a 15 or 30 second music clip.');
  for(let i=0;seconds!==duration&&i<90;i++){
    const next=seconds+(seconds<duration?1:-1);
    await s.click('xpath','//android.widget.Button[@text='+xpathLiteral(next+' SECONDS')+']');
    await s.until(nodes=>nodes.some(n=>n['resource-id']==='android:id/numberpicker_input'&&parseInt(n.text)===next),'Instagram did not change the clip duration.');
    seconds=await read();
  }
  if(seconds!==duration)throw new InterventionError('The requested music duration could not be set.');
  await s.clickId('music_duration_picker_done_button');
  nodes=await s.until(nodes=>present(nodes,'music_editor_controls_container')&&nodes,'The music clip editor did not return.');
  const segmentStart=nodes.find(n=>n.tag==='android.widget.SeekBar')?.text;
  if(!/^\d+(?:\.\d+)?$/.test(segmentStart||''))throw new InterventionError('The music clip position could not be verified.');
  await s.clickId('bottom_sheet_done_button');
  return {durationSeconds:seconds,segmentStart};
}
export async function nativeCaption(s,caption) {
  await s.clickId('media_thumbnail_tray_button');
  let nodes=await s.until(nodes=>present(nodes,'caption_input_text_view')&&nodes,'Instagram post review is still loading.');
  if(nodes.some(n=>n.text==='Sharing posts')){
    await s.click('xpath','//android.widget.TextView[@text="OK"]/parent::*');
    nodes=await s.until(nodes=>!nodes.some(n=>n.text==='Sharing posts')&&present(nodes,'caption_input_text_view')&&nodes,'Instagram sharing information did not close.');
  }
  await s.clickId('caption_input_text_view');
  await s.text('id',nativeId('caption_input_text_view'),caption);
  nodes=await s.screen();
  if(nodes.find(n=>n['resource-id']===nativeId('caption_input_text_view'))?.text!==caption)throw new InterventionError('The Android caption does not match the reviewed draft.');
  if(nodes.some(n=>n['resource-id']===nativeId('next_button_textview')&&n.text==='OK'))await s.clickId('next_button_textview');
  await s.until(nodes=>present(nodes,'share_footer_button'),'Instagram final review did not load.');
}
export async function verifyNativeCaption(s,caption,music) {
  const nodes=await s.screen();
  const normalize=value=>String(value).replace(/\r\n/g,'\n').trim();
  if(!present(nodes,'share_footer_button')||normalize(nodes.find(n=>n['resource-id']===nativeId('caption_input_text_view'))?.text)!==normalize(caption))throw new InterventionError('The Android post or caption changed after review. Nothing was shared.');
  if(music&&(nodes.find(n=>n['resource-id']===nativeId('music_track_title'))?.text!==music.title||nodes.find(n=>n['resource-id']===nativeId('music_track_subtitle'))?.text!==music.artist))throw new InterventionError('The reviewed Instagram music changed.');
}
export async function discardPost(s,caption) {
  for(let i=0;i<14;i++){
    const nodes=(await s.screen()).filter(node=>node.displayed==='true');
    const editor=nodes.find(n=>n['resource-id']===nativeId('caption_input_text_view'));
    if(editor&&editor.text!==caption)throw new InterventionError('The Android draft was changed by someone. It was preserved.');
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
