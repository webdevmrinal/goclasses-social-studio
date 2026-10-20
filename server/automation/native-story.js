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
export async function prepareStoryAudience(s) {
  // The observed blue arrow opens audience review. It does not publish.
  await s.click('accessibility id','Share to');
  await s.until(nodes=>has(nodes,'share_story_button'),'Instagram Story sharing options are still loading.');
  return storyAudienceEvidence(s);
}
export async function storyAudienceEvidence(s) {
  const nodes=await s.screen();
  const facebook=nodes.filter(n=>n.displayed==='true'&&n['resource-id']===nativeId('sharing_preferences_label')&&n.text==='And Facebook Story');
  if(!has(nodes,'share_story_button')||facebook.length!==1)throw new InterventionError('Enable Facebook Story sharing in Instagram sharing options, then retry only this Story. Nothing was shared.');
  await s.find('xpath','//*[@resource-id='+xpathLiteral(nativeId('row_add_to_story_container'))+']//*[@resource-id='+xpathLiteral(nativeId('recipient_picker_radio_button'))+' and @checked="true"]');
  if(nodes.filter(n=>n['resource-id']===nativeId('recipient_picker_radio_button')&&n.checked==='true').length!==1)throw new InterventionError('The Story audience is ambiguous. Nothing was shared.');
  const canvas=nodes.find(n=>n['resource-id']===nativeId('camera_photo_texture_view'));
  if(!canvas)throw new InterventionError('The Story image preview disappeared.');
  const b=nativeBounds(canvas),image=await sharp(await s.screenshot()).extract({left:b.x,top:b.y,width:b.width,height:b.height}).raw().toBuffer();
  return {destinations:['instagram','facebook'],bounds:canvas.bounds,hash:digest(image)};
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
