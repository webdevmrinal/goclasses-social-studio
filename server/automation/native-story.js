// Copyright (c) 2026 Mrinal. All rights reserved.
import sharp from 'sharp';
import {nativeId,nativeBounds,xpathLiteral} from './android-native.js';
import {InterventionError} from './utils.js';
import {digest} from './native-photos.js';
const has=(nodes,id)=>nodes.some(n=>n.displayed==='true'&&n['resource-id']===nativeId(id));
export async function changedSticker(before,after,canvas,lower=false) {
  const left=canvas.x+24,top=Math.round(canvas.y+canvas.height*(lower==='all'?.3:lower?.68:.34));
  const width=canvas.width-48,height=Math.round(canvas.height*(lower==='all'?.61:lower?.23:.30));
  const crop=bytes=>sharp(bytes).extract({left,top,width,height}).removeAlpha().raw().toBuffer();
  const a=await crop(before),b=await crop(after);
  let minX=width,maxX=-1,minY=height,maxY=-1,count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*3;
    if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))<45)continue;
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;
  }
  const box={x:left+minX,y:top+minY,width:maxX-minX+1,height:maxY-minY+1};
  if(count<150||box.width<70||box.height<20||box.width>canvas.width*.88||box.height>canvas.height*.2)throw new InterventionError('The new Story link sticker could not be located safely. Nothing was shared.');
  return box;
}
export async function addStoryLink(s,{url,label,layout}) {
  let nodes=await s.screen();
  if(!has(nodes,'story_share_controls_action_bar'))throw new InterventionError('Instagram is not in the reviewed Story editor.');
  const canvas=nativeBounds(nodes.find(n=>n['resource-id']===nativeId('camera_photo_texture_view')));
  const before=await s.screenshot();
  await s.click('id','asset_button');
  await s.until(nodes=>nodes.some(n=>n['content-desc']==='Link Sticker'),'Link sticker is not available on this account.');
  await s.click('accessibility id','Link Sticker');
  await s.until(nodes=>has(nodes,'link_sticker_list_web_url_edit_text'),'Link editor is still loading.');
  await s.text('id',nativeId('link_sticker_list_web_url_edit_text'),url);
  await s.clickId('link_sticker_custom_cta_row');
  await s.until(nodes=>has(nodes,'link_sticker_custom_cta_edit_text'),'Custom link text is not available.');
  await s.text('id',nativeId('link_sticker_custom_cta_edit_text'),label);
  nodes=await s.screen();
  if(nodes.find(n=>n['resource-id']===nativeId('link_sticker_list_web_url_edit_text'))?.text!==url||nodes.find(n=>n['resource-id']===nativeId('link_sticker_custom_cta_edit_text'))?.text!==label)throw new InterventionError('The Story URL or button text differs from the reviewed values.');
  await s.clickId('link_sticker_list_done_button');
  await s.until(nodes=>has(nodes,'story_share_controls_action_bar')&&!has(nodes,'link_sticker_list_web_url_edit_text'),'The Story link preview did not load.');
  let sticker;
  for(let attempt=0;attempt<12;attempt++){
    await new Promise(resolve=>setTimeout(resolve,300));
    try{sticker=await changedSticker(before,await s.screenshot(),canvas);break;}catch(error){if(attempt===11)throw error;}
  }
  const destination={x:canvas.x+canvas.width*(layout?.link.x??.5),y:canvas.y+canvas.height*(layout?.link.y??.81)};
  if(destination.y>=canvas.y+canvas.height-120*(canvas.width/720))throw new Error('Unsafe Story sticker position.');
  let moved=sticker;
  for(let attempt=0;attempt<3;attempt++){
    const center={x:moved.x+moved.width/2,y:moved.y+moved.height/2};
    if(Math.abs(center.x-destination.x)<canvas.width*.025&&Math.abs(center.y-destination.y)<canvas.height*.025)break;
    await s.adb(['shell','input','swipe',String(Math.round(center.x)),String(Math.round(center.y)),String(Math.round(destination.x)),String(Math.round(destination.y)),'650']);
    await new Promise(resolve=>setTimeout(resolve,450));
    moved=await changedSticker(before,await s.screenshot(),canvas,'all');
  }
  if(Math.abs((moved.x+moved.width/2)-destination.x)>canvas.width*.07||Math.abs((moved.y+moved.height/2)-destination.y)>canvas.height*.055)throw new InterventionError('The Story link sticker did not move below the image.');
  return {canvas,sticker:moved,url,label};
}
// The shortcut publishes immediately. Preparation and TEST must never tap it.
const reviewedStoryAudiences=new WeakMap(),storySubmitAttempts=new WeakMap();
function directStoryControl(nodes){
 const matches=nodes.filter(n=>n.displayed==='true'&&n.package==='com.instagram.android'&&n['resource-id']===nativeId('your_story_share_shortcut_button'));
 if(!has(nodes,'story_share_controls_action_bar')||has(nodes,'share_story_button')||matches.length!==1)throw new InterventionError('Open the prepared Story editor with Your story visible. Leave that button untouched; the app will share in LIVE only.');
 const control=matches[0];
 if((control.class||control.tag)!=='android.widget.Button'||control['content-desc']!=='Your story'||control.enabled!=='true'||control.clickable!=='true')throw new InterventionError('The Your story control changed. Nothing was shared.');
 const b=nativeBounds(control);if(b.width<=0||b.height<=0)throw new InterventionError('The Your story control is not visible. Nothing was shared.');
 return control;
}
function facebookStoryEnabled(nodes){return nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('sharing_preferences_label')&&n.text==='And Facebook Story').length;}
export async function prepareStoryAudience(s,options={}) {
 const nodes=await s.screen(),facebookEnabled=options.facebookEnabled!==false;
 if(has(nodes,'share_story_button')){
  // A user may open audience options during a handoff. Inspect only; never
  // click the blue arrow or this sheet's final Share to prepare a direct send.
  const facebook=facebookStoryEnabled(nodes);
  if(facebook!==(facebookEnabled?1:0))throw new InterventionError(facebookEnabled?'Enable Facebook Story sharing in Instagram sharing options, or turn off Also share to Facebook in a new review. Nothing was shared.':'Turn off Facebook Story sharing in Instagram sharing options. Nothing was shared.');
  await s.find('xpath','//*[@resource-id='+xpathLiteral(nativeId('row_add_to_story_container'))+']//*[@resource-id='+xpathLiteral(nativeId('recipient_picker_radio_button'))+' and @checked="true"]');
  if(nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('recipient_picker_radio_button')&&n.checked==='true').length!==1)throw new InterventionError('The Story audience is ambiguous. Nothing was shared.');
  reviewedStoryAudiences.set(s,{session:s.id,facebookEnabled});
  await s.request('/back','POST',{});
  await s.until(next=>has(next,'story_share_controls_action_bar')&&!has(next,'share_story_button'),'Return to the prepared Story editor. Do not tap Your story.');
 }
 return storyAudienceEvidence(s,options);
}
export async function storyAudienceEvidence(s,options={}) {
 const nodes=await s.screen(),control=directStoryControl(nodes),facebookEnabled=options.facebookEnabled!==false,review=reviewedStoryAudiences.get(s);
 if(facebookEnabled&&!(review&&review.session===s.id&&review.facebookEnabled===true))throw new InterventionError('Enable Facebook Story sharing in Instagram sharing options, or turn off Also share to Facebook in a new review. Nothing was shared.');
 if(!facebookEnabled&&facebookStoryEnabled(nodes))throw new InterventionError('Facebook is enabled on this Story. Turn it off before continuing. Nothing was shared.');
 const canvases=nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('camera_photo_texture_view'));
 if(canvases.length!==1)throw new InterventionError('The Story image preview disappeared.');
 const canvas=canvases[0],b=nativeBounds(canvas),image=await sharp(await s.screenshot()).extract({left:b.x,top:b.y,width:b.width,height:b.height}).raw().toBuffer();
 return {destinations:facebookEnabled?['instagram','facebook']:['instagram'],bounds:canvas.bounds,hash:digest(image),publishControl:{id:control['resource-id'],bounds:control.bounds}};
}
export async function publishStory(s,evidence,options={}){
 s.signal?.throwIfAborted();
 if(JSON.stringify(await storyAudienceEvidence(s,options))!==JSON.stringify(evidence))throw new InterventionError('The reviewed Story changed. Nothing was shared.');
 const session=s.id??null;if(storySubmitAttempts.get(s)===session)throw new InterventionError('Story sharing was already attempted. Verify Instagram before retrying.');
 const selector='//android.widget.Button[@package="com.instagram.android" and @resource-id='+xpathLiteral(nativeId('your_story_share_shortcut_button'))+' and @content-desc="Your story" and @bounds='+xpathLiteral(evidence.publishControl.bounds)+' and @displayed="true" and @enabled="true"]';
 const id=await s.find('xpath',selector);s.signal?.throwIfAborted();
 // Record before the single publishing request, including a lost response.
 storySubmitAttempts.set(s,session);await s.request('/element/'+id+'/click','POST',{});
}
const storyCompletionDoneAttempts=new WeakMap();
const storyReceiptEditors=new Set(['share_story_button','story_share_controls_action_bar','music_editor_done_button','music_editor_controls_container','link_sticker_list_web_url_edit_text','caption_input_text_view','new_post_title'].map(nativeId));
const storyToast=/^(Your story has been shared|Added to your story|Story shared)$/i;
const ownVisible=nodes=>nodes.filter(n=>n.displayed==='true'&&n.package==='com.instagram.android');
function completionDone(nodes){
 const controls=ownVisible(nodes).filter(n=>n['resource-id']===nativeId('send_button'));
 if(controls.length!==1)return null;
 const control=controls[0];
 if((control.class||control.tag)!=='android.widget.Button'||control['content-desc']!=='Done'||!['','Done'].includes(control.text||'')||control.enabled!=='true'||control.clickable!=='true')return null;
 try{const b=nativeBounds(control);if(b.width<=0||b.height<=0)return null;}catch{return null;}
 return control;
}
// Used only after this worker's reviewed final Share. The observed aftermath
// acknowledges Instagram acceptance; it does not independently verify Facebook.
export function nativeStoryPublicationEvidence(nodes){
 const current=ownVisible(nodes);
 if(nodes.some(n=>n.displayed==='true'&&n.password==='true')||current.some(n=>storyReceiptEditors.has(n['resource-id'])))return null;
 if(current.some(n=>storyToast.test(n.text||'')))return {verifiedBy:'native_story_toast',instagramAccepted:true,acknowledgement:'story_shared_toast'};
 const exact=(id,text,description)=>{const matches=current.filter(n=>n['resource-id']===nativeId(id));return matches.length===1&&matches[0].text===text&&(description===undefined||matches[0]['content-desc']===description);};
 if(!exact('title_text_view','Also share to')||!exact('title','Also share to','Also share to'))return null;
 if(current.filter(n=>n['resource-id']===nativeId('direct_recipient_add_to_highlights_row')).length!==1||!exact('add_to_highlights_label','Add to highlights')||!completionDone(current))return null;
 return {verifiedBy:'native_story_completion_sheet',instagramAccepted:true,acknowledgement:'also_share_to_done'};
}
export async function confirmNativeStoryPublication(s,{onDiagnostic,timeout=30000}={}){
 s.signal?.throwIfAborted();
 const report=async details=>{await onDiagnostic?.(details);s.signal?.throwIfAborted();};
 await report({phase:'waiting_for_acknowledgement'});
 const evidence=await s.until(nodes=>nativeStoryPublicationEvidence(nodes),'Story submission began. Check Instagram before retrying; no duplicate send was attempted.',timeout);
 const receipt={...evidence,verifiedAt:new Date().toISOString(),completionDismissed:false};
 await report({phase:'acknowledged',...receipt});
 if(evidence.verifiedBy!=='native_story_completion_sheet')return receipt;
 try{
  // Revalidate the whole sheet before its one non-publishing Done action. Never
  // address recipient Send controls, even though this Done reuses send_button.
  const nodes=await s.screen(),current=nativeStoryPublicationEvidence(nodes),control=completionDone(nodes),session=s.id??null;
  if(current?.verifiedBy!=='native_story_completion_sheet'||!control||storyCompletionDoneAttempts.get(s)===session){await report({phase:'completion_pending',...receipt});return receipt;}
  s.signal?.throwIfAborted();storyCompletionDoneAttempts.set(s,session);
  await s.click('xpath','//android.widget.Button[@package="com.instagram.android" and @content-desc="Done" and @bounds='+xpathLiteral(control.bounds)+' and @displayed="true" and @enabled="true"]');
  await s.until(next=>!ownVisible(next).some(n=>n['resource-id']===nativeId('title_text_view')&&n.text==='Also share to'||n['resource-id']===nativeId('send_button')&&n['content-desc']==='Done'),'The acknowledged Story completion sheet did not close.',10000);
  receipt.completionDismissed=true;
  await report({phase:'completion_dismissed',...receipt});
 }catch(error){
  s.signal?.throwIfAborted();
  // A proven acknowledgment survives an ambiguous cleanup response. Do not
  // repeat Done, Share, or any recipient Send to recover that response.
  await report({phase:'completion_pending',...receipt});
 }
 return receipt;
}
export async function discardStory(s) {
  // Called only for this worker's unchanged rehearsal. Unwind its native
  // music/editor stack as well as the Story audience sheet.
  for(let attempt=0;attempt<14;attempt++){
    const nodes=(await s.screen()).filter(n=>n.displayed==='true');
    const discard=nodes.some(n=>n['resource-id']===nativeId('igds_alert_dialog_primary_button')&&n.text==='Discard');
    if(discard){
      await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('igds_alert_dialog_primary_button'))+' and @text="Discard"]');
    }else if(has(nodes,'music_browser_container')){
      await s.request('/back','POST',{});
    }else if(has(nodes,'music_editor_cancel_button')){
      await s.clickId('music_editor_cancel_button');
    }else if(has(nodes,'music_editor_done_button')){
      // Inherited feed music uses a clip editor without a Cancel resource.
      await s.request('/back','POST',{});
    }else if(has(nodes,'link_sticker_list_cancel_button')){
      await s.clickId('link_sticker_list_cancel_button');
    }else if(has(nodes,'share_story_button')){
      await s.request('/back','POST',{});
    }else if(has(nodes,'story_share_controls_action_bar')&&has(nodes,'cancel_button')){
      await s.clickId('cancel_button');
    }else if(has(nodes,'direct_external_share_container_view')){
      if(nodes.some(n=>/EditText$/.test(n.class||'')&&n.text&&!/^Search(?:\.\.\.|\u2026)?$/i.test(n.text)))throw new InterventionError('The sharing menu changed. Its message was preserved.');
      await s.request('/back','POST',{});
    }else if(has(nodes,'profile_header_create_button')&&has(nodes,'profile_tab')){
      return;
    }else if(has(nodes,'gallery_title_text')||has(nodes,'row_feed_button_share')){
      await s.request('/back','POST',{});
    }else{
      // Back/Discard can briefly expose a blank transition on slow emulators.
      // Wait for a recognized surface; never click or dismiss an unknown one.
      await s.until(next=>['music_browser_container','music_editor_cancel_button','music_editor_done_button','link_sticker_list_cancel_button','share_story_button','direct_external_share_container_view','gallery_title_text','row_feed_button_share'].some(id=>has(next,id))||has(next,'story_share_controls_action_bar')&&has(next,'cancel_button')||has(next,'profile_header_create_button')&&has(next,'profile_tab')||next.some(n=>n.displayed==='true'&&n['resource-id']===nativeId('igds_alert_dialog_primary_button')&&n.text==='Discard'),'The native screen changed. Close the owned rehearsal before continuing; unknown drafts were preserved.',10000);
      continue;
    }
    await new Promise(resolve=>setTimeout(resolve,450));
  }
  throw new InterventionError('The owned Story rehearsal could not be closed safely.');
}
