// Copyright (c) 2026 Mrinal. All rights reserved.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {nativeId,nativeBounds,xpathLiteral} from './android-native.js';
import {InterventionError} from './utils.js';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const visible=n=>n.displayed==='true'&&n.package==='com.instagram.android';
export async function pushAlbum(s,files) {
  const folder='Studio_'+randomUUID().replaceAll('-','').slice(0,14),remote='/sdcard/Pictures/'+folder;
  const manifest=[];
  await s.adb(['shell','mkdir','-p',remote]);
  for(let i=0;i<files.length;i++){
    const ext=path.extname(files[i]).toLowerCase();
    if(!['.png','.jpg','.jpeg','.webp'].includes(ext))throw new Error('Android accepts only the reviewed image formats.');
    const bytes=await fs.readFile(files[i]),file=remote+'/'+String(i+1).padStart(2,'0')+ext;
    await s.adb(['push',files[i],file],60000);
    if((await s.adb(['shell','sha256sum',file])).split(/\s/)[0]!==digest(bytes))throw new Error('Android image transfer did not preserve the reviewed file.');
    await s.adb(['shell','touch',file]);
    await s.adb(['shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+file]);
    manifest.push({file,hash:digest(bytes),bytes});
  }
  return {folder,remote,manifest};
}
export async function removeAlbum(s,album) {
  for(const m of album?.manifest||[]){
    if((await s.adb(['shell','sha256sum',m.file]).catch(()=>'' )).split(/\s/)[0]!==m.hash)continue;
    await s.adb(['shell','rm','--',m.file]);
    await s.adb(['shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+m.file]).catch(()=>{});
  }
  if(/^\/sdcard\/Pictures\/Studio_[a-f0-9]{14}$/.test(album?.remote||''))await s.adb(['shell','rmdir',album.remote]).catch(()=>{});
}
export async function openGallery(s,folder) {
  await s.clickId('profile_header_create_button');
  const label='Create new post';
  await s.until(nodes=>nodes.some(n=>visible(n)&&n['content-desc']===label),'Instagram Create menu is still loading.');
  await s.click('accessibility id',label);
  await s.until(nodes=>nodes.some(n=>visible(n)&&n['resource-id']===nativeId('gallery_folder_menu_tv')),'Instagram photo picker is still loading.');
  await allowAlbum(s,{manifest:s.uploadAlbum?.manifest||[]});
  await s.clickId('gallery_folder_menu_tv');
  const option=await s.until(nodes=>nodes.find(n=>visible(n)&&n.text===folder),'The isolated upload album is not visible. No other photos were selected.');
  await s.click('xpath','//*[@text='+xpathLiteral(option.text)+']');
  await s.until(nodes=>nodes.some(n=>visible(n)&&n['resource-id']===nativeId('gallery_folder_menu_tv')&&n.text===folder),'The photo picker did not open the expected isolated album.');
}
async function imagePixels(bytes,width,height) {
  return sharp(bytes).rotate().resize(width,height,{fit:'cover',position:'centre'}).removeAlpha().raw().toBuffer();
}
export async function thumbnailScore(actual,expected) {
  // Normalize each channel: Instagram's selected-thumbnail white wash preserves structure.
  const size=48,a=await imagePixels(actual,size,size),b=await imagePixels(expected,size,size);
  let correlation=0;
  for(let c=0;c<3;c++){
    let n=0,sa=0,sb=0,saa=0,sbb=0,sab=0;
    for(let y=2;y<size-2;y++)for(let x=2;x<size-2;x++){
      if(x>size*.68&&y<size*.32)continue; // Native selection badge.
      const av=a[(y*size+x)*3+c],bv=b[(y*size+x)*3+c];n++;sa+=av;sb+=bv;saa+=av*av;sbb+=bv*bv;sab+=av*bv;
    }
    const denom=Math.sqrt(Math.max(0,saa-sa*sa/n)*Math.max(0,sbb-sb*sb/n));
    correlation+=denom?(sab-sa*sb/n)/denom:Math.abs(sa/n-sb/n)<3?1:0;
  }
  return correlation/3;
}
export async function previewScore(screenshot,node,bytes) {
  const b=nativeBounds(node);
  if(b.width<30||b.height<30) return -1;
  // Both Android and Instagram add selection circles and a dark gradient at
  // the top. Compare an identical interior crop, never those UI decorations.
  const dx=Math.round(b.width*.04),dy=Math.round(b.height*.28),width=b.width-dx*2,height=Math.round(b.height*.66);
  const actual=await sharp(screenshot).extract({left:b.x+dx,top:b.y+dy,width,height}).png().toBuffer();
  const expected=await sharp(bytes).rotate().resize(b.width,b.height,{fit:'cover',position:'centre'}).extract({left:dx,top:dy,width,height}).png().toBuffer();
  return thumbnailScore(actual,expected);
}
export async function selectAlbumPhotos(s,album) {
  const files=album.manifest;
  if(files.length>1){
    let nodes=await s.screen(),toggle=nodes.find(n=>visible(n)&&n['resource-id']===nativeId('multi_select_slide_button_alt'));
    if(!toggle)throw new InterventionError('Instagram carousel selection is unavailable.');
    for(let attempt=0;attempt<2&&toggle.checked!=='true';attempt++){
      await s.clickId('multi_select_slide_button_alt');
      try{await s.until(nodes=>nodes.some(n=>n['resource-id']===nativeId('multi_select_slide_button_alt')&&n.checked==='true'),'Carousel control did not switch yet.',3500);}catch(e){if(e.message!=='Carousel control did not switch yet.')throw e;}
      toggle=(await s.screen()).find(n=>n['resource-id']===nativeId('multi_select_slide_button_alt'))||{};
    }
    if(toggle.checked!=='true')throw new InterventionError('Instagram did not enable carousel selection.');
    // Clear the single default item before selecting in reviewed order.
    const selected=(await s.screen()).filter(n=>visible(n)&&n['resource-id']===nativeId('gallery_grid_item_thumbnail')&&/^Selected media number/.test(n['content-desc']||''));
    for(const node of selected)await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('gallery_grid_item_thumbnail'))+' and @bounds='+xpathLiteral(node.bounds)+']');
  }
  for(let index=0;index<files.length;index++){
    let chosen=false;
    for(let attempt=0;attempt<8&&!chosen;attempt++){
      const nodes=await s.screen();
      if(!nodes.some(n=>n['resource-id']===nativeId('gallery_folder_menu_tv')&&n.text===album.folder))throw new InterventionError('Instagram left the reviewed upload album.');
      const thumbs=nodes.filter(n=>visible(n)&&n['resource-id']===nativeId('gallery_grid_item_thumbnail'));
      const screenshot=await s.screenshot(),scores=[];
      for(const node of thumbs)scores.push({node,score:await previewScore(screenshot,node,files[index].bytes)});
      scores.sort((a,b)=>b.score-a.score);
      if(scores[0]?.score>=0.93 && (!scores[1]||scores[0].score-scores[1].score>=0.012)){
        const {node}=scores[0];
        await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('gallery_grid_item_thumbnail'))+' and @bounds='+xpathLiteral(node.bounds)+']');
        if(files.length>1)await s.until(nodes=>nodes.some(n=>n['resource-id']===nativeId('gallery_grid_item_thumbnail')&&n.bounds===node.bounds&&n['content-desc']?.startsWith('Selected media number '+(index+1)+' ')),'Instagram did not preserve the reviewed image order.');
        chosen=true;break;
      }
      const grid=nodes.find(n=>visible(n)&&n['resource-id']===nativeId('media_picker_grid_view'));
      if(!grid)break;
      const b=nativeBounds(grid);
      // Only the observed gallery grid can be scrolled, never a publishing surface.
      await s.request('/execute/sync','POST',{script:'mobile: scrollGesture',args:[{left:b.x+4,top:b.y+4,width:b.width-8,height:b.height-8,direction:attempt<4?'down':'up',percent:0.65}]});
    }
    if(!chosen)throw new InterventionError('The Android photo preview could not be matched uniquely to the reviewed image. Nothing was shared.');
  }
  await s.until(nodes=>nodes.some(n=>visible(n)&&n['resource-id']===nativeId('next_button_textview')&&n.enabled==='true'),'Instagram is still preparing the selected images.');
  await s.clickId('next_button_textview');
  // Large carousels can decode slowly on the dedicated low-memory emulator.
  await s.until(nodes=>nodes.some(n=>visible(n)&&n['resource-id']===nativeId('media_thumbnail_tray_button')),'Instagram photo editor is still loading.',90000);
}
export async function photoEvidence(s) {
  const nodes=(await s.screen()).filter(n=>visible(n)&&n['resource-id']===nativeId('photo_media_preview_image_view'));
  const screenshot=await s.screenshot(),pictures=[];
  for(const node of nodes){const b=nativeBounds(node);if(b.width&&b.height)pictures.push({bounds:node.bounds,hash:digest(await sharp(screenshot).extract({left:b.x,top:b.y,width:b.width,height:b.height}).raw().toBuffer())});}
  if(!pictures.length)throw new InterventionError('The native Instagram image preview is unavailable.');
  return pictures;
}

export async function allowAlbum(s,album) {
  await s.until(nodes=>nodes.some(n=>n['resource-id']===nativeId('gallery_folder_menu_tv')),'Instagram photo access is not ready.');
  if(!(await s.screen()).some(n=>n['resource-id']===nativeId('btn_manage')))return;
  await s.clickId('btn_manage');
  await s.until(nodes=>nodes.some(n=>n.text==='Select more photos'),'Choose limited photo access in the emulator.');
  await s.click('xpath','//*[@text="Select more photos"]');
  await s.until(nodes=>nodes.some(n=>n['resource-id']==='com.google.android.providers.media.module:id/button_add'),'Android limited-photo picker did not open.');
  const picked=new Set(),matched=new Set();
  for(let attempt=0;attempt<8;attempt++){
    const current=await s.screen(),shot=await s.screenshot();
    const thumbs=current.filter(n=>n.displayed==='true'&&n.tag==='android.widget.FrameLayout'&&/^Photo taken on /.test(n['content-desc']||''));
    for(const thumb of thumbs){
      const key=thumb['content-desc']+'|'+thumb.bounds;if(picked.has(key))continue;
      for(let i=0;i<album.manifest.length;i++){
        if(await previewScore(shot,thumb,album.manifest[i].bytes)<.93)continue;
        if(thumb.selected!=='true')await s.click('xpath','//android.widget.FrameLayout[@content-desc='+xpathLiteral(thumb['content-desc'])+' and @bounds='+xpathLiteral(thumb.bounds)+']');
        picked.add(key);matched.add(i);break;
      }
    }
    if(matched.size===album.manifest.length)break;
    await s.request('/execute/sync','POST',{script:'mobile: scrollGesture',args:[{left:4,top:500,width:712,height:750,direction:'down',percent:.65}]});
  }
  if(matched.size!==album.manifest.length)throw new InterventionError('Grant access to the Studio upload album in Android, then rerun preparation. No other photos were selected.');
  const add=(await s.screen()).find(n=>n['resource-id']==='com.google.android.providers.media.module:id/button_add');
  if(!/^Allow \(\d+\)$/.test(add?.text||''))throw new InterventionError('Android did not confirm the selected upload copies.');
  await s.click('id','com.google.android.providers.media.module:id/button_add');
  await s.until(nodes=>nodes.some(n=>n['resource-id']===nativeId('gallery_folder_menu_tv')),'Instagram did not return to its gallery.');
}
