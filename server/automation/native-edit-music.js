// Copyright (c) 2026 Mrinal. Edit only one verified existing Instagram post; never create a feed post.
import sharp from 'sharp';
import {nativeId,nativeBounds,xpathLiteral} from './android-native.js';
import {verifyNativePost} from './native-reference.js';
import {normalizeNativeCaption,resolveMusic,previewMusicChoice,assistNativeStage,musicClipPosition} from './native-music.js';
import {digest} from './native-photos.js';
import {InterventionError} from './utils.js';
import {nativeViewportStamp,nativeNavigationCandidate,recoverNativeNavigation} from './native-navigation.js';
const visible=nodes=>nodes.filter(n=>n.displayed==='true'&&n.package==='com.instagram.android');
const one=(nodes,id)=>{const found=visible(nodes).filter(n=>n['resource-id']===nativeId(id));return found.length===1?found[0]:null;};
const has=(nodes,id)=>Boolean(one(nodes,id));
export function editInfoState(nodes,{handle,caption}={}){
 if(nodes.some(n=>n.displayed==='true'&&n.password==='true')||!has(nodes,'layout_edit_media_info_layout')||one(nodes,'action_bar_title')?.text!=='Edit info'||one(nodes,'edit_media_username')?.text!==handle)return null;
 const field=one(nodes,'edit_media_caption');if(!field||typeof field.text!=='string')return null;
 if(caption!==undefined&&normalizeNativeCaption(field.text)!==normalizeNativeCaption(caption))return null;
 return {caption:field.text};
}
export function editMusicRow(nodes){
 if(!has(nodes,'m2_audio_row'))return null;
 const title=one(nodes,'m2_audio_primary_text')?.text,artist=one(nodes,'m2_audio_secondary_text')?.text;
 if(!title)return null;return {title,artist:artist||''};
}
export const sameMusic=(actual,expected)=>Boolean(actual&&actual.title===expected.title&&actual.artist===expected.artist);
export function editAudioClip(nodes,chosen){
 if(one(nodes,'action_bar_title')?.text!=='Add audio'||!has(nodes,'music_editor_controls_container')||one(nodes,'song_title')?.text!==chosen.title||one(nodes,'track_artist')?.text!==chosen.artist||!has(nodes,'action_bar_button_action'))return null;
 return {title:chosen.title,artist:chosen.artist,nativeSuggestedClip:true,segmentStart:musicClipPosition(nodes)};
}
async function scroll(s,nodes,direction){const box=nativeBounds(one(nodes,'edit_media_scroll_view'));const x=Math.round(box.x+box.width/2),top=Math.round(box.y+50),bottom=Math.round(box.y+box.height-60);await s.adb(['shell','input','swipe',String(x),String(direction==='top'?top:bottom),String(x),String(direction==='top'?bottom:top),'400']);}
function editScrollState(nodes,identity){
 if(nodes.some(n=>n.displayed==='true'&&n.password==='true')||!has(nodes,'layout_edit_media_info_layout')||one(nodes,'action_bar_title')?.text!=='Edit info'||one(nodes,'edit_media_username')?.text!==identity.handle||!has(nodes,'edit_media_scroll_view'))return false;
 const fields=visible(nodes).filter(n=>n['resource-id']===nativeId('edit_media_caption'));
 return fields.length===0||fields.length===1&&(identity.caption===undefined||normalizeNativeCaption(fields[0].text)===normalizeNativeCaption(identity.caption));
}
// Instagram removes scrolled-off caption nodes from accessibility. Scroll only
// within the same account/editor, then require the complete caption again.
export async function anchorEditInfo(s,identity){
 const seen=new Set();
 for(let i=0;i<8;i++){const nodes=await s.screen();if(editInfoState(nodes,identity))return nodes;if(!editScrollState(nodes,identity))throw new InterventionError('The existing post account or caption changed. No music save was attempted.');const stamp=nativeViewportStamp(nodes);if(seen.has(stamp))break;seen.add(stamp);await scroll(s,nodes,'top');}
 throw new InterventionError('The complete existing-post caption could not be verified. No music save was attempted.');
}
export async function readEditMusic(s,identity,{leaveAtRow=false,ctx}={}){
 await anchorEditInfo(s,identity);
 const row=await assistNativeStage(s,ctx,{kind:'navigation',title:'Show the post’s music row',instructions:'In this post’s Edit info, scroll below Add product details until the song or Add music row is visible. Leave it there, then continue. Do not save.'},async()=>{
  const seen=new Set();
  for(let i=0;i<7;i++){const nodes=await s.screen();if(!editScrollState(nodes,identity))throw new InterventionError('The existing post account or caption changed. No music save was attempted.');const row=editMusicRow(nodes);if(row)return row;const stamp=nativeViewportStamp(nodes);if(seen.has(stamp))break;seen.add(stamp);await scroll(s,nodes,'bottom');}
  throw new InterventionError('Scroll below Add product details to check Instagram music. The published feed was not uploaded again.');
 },nodes=>editScrollState(nodes,identity)&&editMusicRow(nodes));
 if(!leaveAtRow)await anchorEditInfo(s,identity);return row;
}
export async function editPhotoProof(s,identity){
 await anchorEditInfo(s,identity);
 let previous='';
 for(let i=0;i<9;i++){
  const nodes=await s.screen();if(!editInfoState(nodes,identity))throw new InterventionError('The existing post caption changed. No music save was attempted.');
  const box=nativeBounds(one(nodes,'edit_media_scroll_view')),caption=nativeBounds(one(nodes,'edit_media_caption')),height=caption.y-box.y,area={left:box.x,top:box.y,width:box.width,height},stamp=JSON.stringify(area);
  // Anchor at the actual top, not at an arbitrary partly visible gallery.
  // Opening audio can restore a different vertical scroll position.
  if(height>=80&&stamp===previous){
   let last='';
   for(let frame=0;frame<8;frame++){
    const pixels=await sharp(await s.screenshot()).extract(area).resize(160,120,{fit:'fill'}).removeAlpha().raw().toBuffer(),hash=digest(pixels);
    if(hash===last)return {area,hash};last=hash;await new Promise(r=>setTimeout(r,250));
   }
   throw new InterventionError('The existing post thumbnails are still decoding. No music save was attempted.');
  }
  previous=height>=80?stamp:'';await scroll(s,nodes,'top');
 }
 throw new InterventionError('The existing post image preview could not be verified. No music save was attempted.');
}
function postMenuList(nodes){
 const sheet=one(nodes,'action_sheet_container'),list=one(nodes,'recycler_view');
 if(!sheet||!list||list.scrollable!=='true'||!visible(nodes).some(n=>n['resource-id']===nativeId('control_option_text')))return null;
 const outer=nativeBounds(sheet),box=nativeBounds(list);
 if(box.width<80||box.height<100||box.x<outer.x||box.y<outer.y||box.x+box.width>outer.x+outer.width||box.y+box.height>outer.y+outer.height)return null;
 return box;
}
// Called only after the exact post was verified and its own More menu opened.
// Scroll this menu, then select only its unique Edit row. Never Save or Share.
export async function selectPostEdit(s){
 let nodes=await s.until(n=>postMenuList(n)&&n,'The existing post action menu is unavailable.',15000),canScroll=true;const seen=new Set();
 for(let attempt=0;attempt<=6;attempt++){
  s.signal?.throwIfAborted();const box=postMenuList(nodes);if(!box)throw new InterventionError('The existing post action menu changed. No edit was opened.');
  const matches=visible(nodes).filter(n=>n['resource-id']===nativeId('control_option_text')&&n.text==='Edit');
  if(matches.length>1)throw new InterventionError('The existing post Edit option is ambiguous. No edit was opened.');
  if(matches.length===1){const row=nativeBounds(matches[0]);if(row.x<box.x||row.y<box.y||row.x+row.width>box.x+box.width||row.y+row.height>box.y+box.height)throw new InterventionError('The existing post Edit option is outside its verified menu.');await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('control_option_text'))+' and @text="Edit" and @displayed="true"]');return;}
  // A changed selector can still expose a unique clickable Edit label inside
  // this already verified post menu. It has no path to Save/Share/Delete.
  if(nativeNavigationCandidate(nodes,'post-edit',{guard:n=>Boolean(postMenuList(n))})){
    await recoverNativeNavigation(s,{action:'post-edit',guard:n=>Boolean(postMenuList(n)),ready:n=>has(n,'layout_edit_media_info_layout')&&one(n,'action_bar_title')?.text==='Edit info'});return;
  }
  const stamp=nativeViewportStamp(nodes);if(seen.has(stamp)||!canScroll||attempt===6)break;seen.add(stamp);
  canScroll=await s.request('/execute/sync','POST',{script:'mobile: scrollGesture',args:[{left:box.x+8,top:box.y+8,width:box.width-16,height:box.height-16,direction:'down',percent:.7}]});
  if(typeof canScroll!=='boolean')throw new InterventionError('The existing post menu did not confirm its scroll position. Continue manually; no edit was opened.');
  nodes=await s.screen();
 }
 throw new InterventionError('The existing post Edit option was not found after scrolling its menu. No edit was opened.');
}
export async function openEditInfo(s,url,handle,caption,ctx){
 await verifyNativePost(s,url,handle,caption);
 for(let i=0;i<7;i++){const nodes=await s.screen();if(has(nodes,'media_option_button')&&one(nodes,'row_feed_photo_profile_name')?.text===handle)break;if(!has(nodes,'row_feed_button_share'))throw new InterventionError('The exact post viewer changed before Edit.');const root=one(nodes,'action_bar_root');if(!root)throw new InterventionError('The native post bounds are unavailable.');const canvas=nativeBounds(root);await s.adb(['shell','input','swipe',String(Math.round(canvas.width/2)),String(Math.round(canvas.height*.25)),String(Math.round(canvas.width/2)),String(Math.round(canvas.height*.8)),'400']);}
 const nodes=await s.screen();if(!has(nodes,'media_option_button')||one(nodes,'row_feed_photo_profile_name')?.text!==handle)throw new InterventionError('The exact post menu is unavailable.');
 await s.clickId('media_option_button');
 return assistNativeStage(s,ctx,{kind:'navigation',verifiedPost:true,title:'Open Edit info in Instagram',instructions:'On this verified post, scroll its More menu and tap Edit. Leave Edit info open, then continue here. Do not save or share.'},async()=>{await selectPostEdit(s);return s.until(nodes=>editInfoState(nodes,{handle,caption}),'The existing post Edit info does not match its reviewed account and caption.');},nodes=>editInfoState(nodes,{handle,caption}));
}
export async function chooseEditMusic(s,chosen,identity,ctx={}){
 await assistNativeStage(s,ctx,{kind:'navigation',title:'Open the post music library',instructions:'In this post’s Edit info, scroll below Add product details and tap the song or Add music. Leave the music library open, then continue here. Do not save the post.'},async()=>{
  await readEditMusic(s,identity,{leaveAtRow:true});await s.clickId('m2_audio_row');await s.until(n=>has(n,'row_search_edit_text'),'The existing post music library did not open.');return true;
 },n=>has(n,'row_search_edit_text')&&n.some(x=>x.displayed==='true'&&/music_browser_container|music_search_clips_landing_page_container|audio_browser_track_/.test(x['resource-id']||'')));
 const track=await resolveMusic(s,chosen,ctx);await previewMusicChoice(s,track);await s.click('id','audio_bar_select_tap_target');
 const clip=await assistNativeStage(s,ctx,{kind:'navigation',title:'Wait for the audio clip',instructions:'Wait for the selected song’s Add audio clip screen in Instagram. Leave that screen open, then continue here. Do not save the post.'},()=>s.until(n=>editAudioClip(n,track),'The existing-post audio clip differs from the reviewed song.'),n=>editAudioClip(n,track));
 // This local Add audio Done returns to Edit info; the outer Done saves online.
 if(!editAudioClip(await s.screen(),track))throw new InterventionError('The local audio review changed.');await s.clickId('action_bar_button_action');await assistNativeStage(s,ctx,{kind:'navigation',title:'Return to Edit info',instructions:'Finish only the local Add audio screen to return to this post’s Edit info. Leave the outer Done or Save alone, then continue here.'},()=>s.until(n=>editScrollState(n,identity),'The local music selection did not return to Edit info.'),n=>editScrollState(n,identity));
 if(!sameMusic(await readEditMusic(s,identity),track))throw new InterventionError('The unsaved music row differs from the selected track.');return {...track,...clip};
}
export async function discardOwnedEdit(s,identity){
 await anchorEditInfo(s,identity);
 if(!editInfoState(await s.screen(),identity))throw new InterventionError('The existing post editor changed. Its draft was preserved.');
 await s.request('/back','POST',{});
 const next=await s.until(n=>(has(n,'row_feed_button_share')||visible(n).some(x=>/^(Discard|Discard changes|Discard edits)$/.test(x.text||'')))&&n,'The owned Edit info did not close.');
 if(has(next,'row_feed_button_share')&&!has(next,'layout_edit_media_info_layout'))return;
 const discard=visible(next).filter(n=>n['resource-id']===nativeId('igds_alert_dialog_primary_button')&&/^(Discard|Discard changes|Discard edits)$/.test(n.text||''));
 if(discard.length!==1)throw new InterventionError('The edit discard confirmation changed. Close only this unsaved music edit yourself.');
 await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('igds_alert_dialog_primary_button'))+' and @text='+xpathLiteral(discard[0].text)+' and @displayed="true"]');await s.until(n=>has(n,'row_feed_button_share')&&!has(n,'layout_edit_media_info_layout'),'The owned music rehearsal did not close.');
}
