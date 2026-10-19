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
export async function openMusicLibrary(s) {
  await s.until(nodes=>present(nodes,'media_thumbnail_tray_button'),'The Instagram photo editor is still loading.');
  await s.click('xpath','//android.widget.TextView[@text="Audio"]/parent::*');
  await s.until(nodes=>present(nodes,'row_search_edit_text'),'Instagram music is unavailable on this account.');
  return musicResults(await s.screen());
}
export async function searchMusic(s,query) {
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
  let nodes=await s.screen(),candidate=musicResults(nodes).filter(r=>r.key===chosen.key&&r.title===chosen.title&&r.artist===chosen.artist);
  if(candidate.length!==1)throw new InterventionError('That track is no longer in the active search results. Search again.');
  await s.click('id',candidate[0].selector);
  await s.until(nodes=>nodes.some(n=>n['resource-id']==='audio_bar_select_tap_target'),'Instagram track preview is still loading.');
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
  for(let i=0;i<8;i++){
    const nodes=await s.screen();
    if(present(nodes,'profile_tab'))return;
    const editor=nodes.find(n=>n['resource-id']===nativeId('caption_input_text_view'));
    if(editor&&editor.text!==caption)throw new InterventionError('The Android draft was changed by someone. It was preserved.');
    if(nodes.some(n=>n.text==='Start over?'&&n['resource-id']===nativeId('action_sheet_header_text_view'))){
      await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('action_sheet_row_text_view'))+' and @text="Start over"]');continue;
    }
    if(present(nodes,'new_post_title')&&present(nodes,'action_bar_cancel')){await s.clickId('action_bar_cancel');continue;}
    if(present(nodes,'row_search_edit_text')||present(nodes,'bottom_sheet_done_button')||present(nodes,'media_thumbnail_tray_button')||editor){await s.request('/back','POST',{});continue;}
    throw new InterventionError('The Android screen changed. Its draft was preserved for review.');
  }
  throw new InterventionError('Close the owned Android draft before starting another run.');
}
