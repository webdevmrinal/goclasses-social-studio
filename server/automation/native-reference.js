// Copyright (c) 2026 Mrinal. Native-only public post receipts. No desktop browser or send actions.
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {nativeId,nativeBounds,xpathLiteral} from './android-native.js';
import {normalizeNativeCaption} from './native-music.js';
import {instagramPostUrl} from '../../shared/manychat.js';
import {InterventionError} from './utils.js';
const visible=n=>n.displayed==='true'&&n.package==='com.instagram.android';
const has=(nodes,id)=>nodes.some(n=>visible(n)&&n['resource-id']===nativeId(id));
const deepLink=(s,url)=>s.request('/execute/sync','POST',{script:'mobile: deepLink',args:[{url,package:'com.instagram.android'}]});
export function nativeGridTiles(nodes){
 return nodes.filter(n=>visible(n)&&n['resource-id']===nativeId('image_button')).flatMap(n=>{const m=n['content-desc']?.match(/row (\d+), column (\d+)/i);return m?[{...n,ordinal:(+m[1]-1)*3+(+m[2]-1)}]:[];}).sort((a,b)=>a.ordinal-b.ordinal);
}
function postSection(nodes){
 // A profile post viewer also exposes part of the following post. XML order
 // preserves each header's section even when that following header is visible.
 const current=nodes.filter(visible),header=n=>n['resource-id']===nativeId('row_feed_profile_header'),first=current.findIndex(header);
 if(first<0)return current; // Legacy viewers still require exactly one author.
 const leading=current.slice(0,first).some(n=>n['resource-id']===nativeId('row_feed_button_share'));
 const start=leading?0:first,end=current.findIndex((n,index)=>index>start&&header(n));
 return current.slice(start,end<0?undefined:end);
}
export function nativePostAuthor(nodes,handle){const headers=postSection(nodes).filter(n=>n['resource-id']===nativeId('row_feed_photo_profile_name'));return headers.length===1&&headers[0].text===handle;}
function captionControls(nodes,field,label){
 // Native caption action spans are consecutive Button children in source order.
 // Require their visible bounds to fit the caption, not an overlapping next post.
 let box;try{box=nativeBounds(field);}catch{return [];}
 const index=nodes.findIndex(n=>n.text===field.text&&n.bounds===field.bounds&&n.class===field.class);
 if(index<0)return [];
 const controls=[];
 for(const child of nodes.slice(index+1)){
  if((child.class||child.tag)!=='android.widget.Button')break;
  if(!visible(child)||child['resource-id']||child['content-desc']!==label||child.clickable!=='true')continue;
  let b;try{b=nativeBounds(child);}catch{continue;}
  if(b.width>0&&b.height>0&&b.x>=box.x&&b.y>=box.y&&b.x+b.width<=box.x+box.width&&b.y+b.height<=box.y+box.height)controls.push(child);
 }
 return controls;
}
export function nativePublishedCaption(nodes,handle){
 const prefix=handle+' ';
 return postSection(nodes).filter(n=>n.text?.startsWith(prefix)&&!n['resource-id']).map(n=>({...n,caption:n.text.slice(prefix.length)}));
}
export function nativePostShare(nodes){
 const shares=postSection(nodes).filter(n=>n['resource-id']===nativeId('row_feed_button_share'));
 return shares.length===1&&/^Send post[. ]/i.test(shares[0]['content-desc']||'')?shares[0]:null;
}
export async function copyNativePostUrl(s){
 const control=nativePostShare(await s.screen());
 if(!control)throw new InterventionError('The public post sharing control is ambiguous. Nothing was sent.');
 // A fresh sentinel prevents accepting any pre-existing clipboard URL.
 await s.request('/execute/sync','POST',{script:'mobile: setClipboard',args:[{content:Buffer.from('studio-receipt:'+randomUUID()).toString('base64'),contentType:'plaintext'}]});
 const share=control.bounds?await s.find('xpath','//*[@resource-id='+xpathLiteral(nativeId('row_feed_button_share'))+' and @bounds='+xpathLiteral(control.bounds)+']'):await s.find('id',nativeId('row_feed_button_share'));
 await s.request('/element/'+share+'/click','POST',{});
 await s.until(nodes=>nodes.filter(n=>visible(n)&&n['resource-id']===nativeId('button')&&n['content-desc']==='Copy link').length===1,'Instagram did not expose Copy link.');
 await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('button'))+' and @content-desc="Copy link"]');
 const value=await s.request('/execute/sync','POST',{script:'mobile: getClipboard',args:[{}]});
 const url=instagramPostUrl(Buffer.from(value,'base64').toString('utf8'));
 if(!url)throw new InterventionError('Instagram did not return the exact post link. Nothing was sent.');
 const after=await s.screen();if(after.some(n=>visible(n)&&n['resource-id']===nativeId('direct_private_share_container_view'))){if(after.some(n=>visible(n)&&/EditText$/.test(n.class||n.tag||'')&&n.text&&!/^Search(?:\.\.\.|\u2026)?$/i.test(n.text)))throw new InterventionError('The share message changed. Its draft was preserved.');await s.request('/back','POST',{});await s.until(n=>!n.some(x=>visible(x)&&x['resource-id']===nativeId('direct_private_share_container_view')),'The empty link-copy share sheet did not close.');}
 else if(after.some(n=>visible(n)&&n['resource-id']===nativeId('button')&&n['content-desc']==='Copy link')){await s.request('/back','POST',{});await s.until(n=>!n.some(x=>visible(x)&&x['resource-id']===nativeId('button')&&x['content-desc']==='Copy link'),'The Copy link sheet did not close.');}
 return url;
}
async function profileGrid(s,handle,{refresh=false}={}){
 await deepLink(s,'https://www.instagram.com/'+encodeURIComponent(handle)+'/');
 await s.until(nodes=>nodes.some(n=>visible(n)&&n['resource-id']===nativeId('action_bar_title')&&n.text===handle)&&has(nodes,'profile_tab_layout'),'The configured native Instagram profile did not open.');
 if(refresh){
  // One bounded refresh of the verified public profile. Never reopen an editor
  // or repeat Share just because its new grid item has not appeared yet.
  const {width,height}=await sharp(await s.screenshot()).metadata();
  for(let attempt=0;attempt<2;attempt++){
   const nodes=await s.screen();
   if(!has(nodes,'profile_tab_layout')||!nodes.some(n=>visible(n)&&n['resource-id']===nativeId('action_bar_title')&&n.text===handle))throw new InterventionError('The public Instagram profile changed during receipt refresh.');
   await s.request('/execute/sync','POST',{script:'mobile: scrollGesture',args:[{left:Math.round(width*.06),top:Math.round(height*.27),width:Math.round(width*.88),height:Math.round(height*.55),direction:'up',percent:.9}]});
  }
 }
 const countNode=(await s.screen()).find(n=>visible(n)&&n['resource-id']===nativeId('profile_header_familiar_post_count_value'));
 const count=/^[\d,]+$/.test(countNode?.text||'')?Number(countNode.text.replaceAll(',','')):6,target=Math.min(6,count);
 for(let attempt=0;attempt<3;attempt++){
  const nodes=await s.screen(),tiles=nativeGridTiles(nodes);if(tiles.length>=target&&tiles.slice(0,target).every(n=>nativeBounds(n).height>40))return tiles;
  const {width,height}=await sharp(await s.screenshot()).metadata();
  await s.request('/execute/sync','POST',{script:'mobile: scrollGesture',args:[{left:Math.round(width*.06),top:Math.round(height*.27),width:Math.round(width*.88),height:Math.round(height*.55),direction:'down',percent:.8}]});
 }
 throw new InterventionError('The recent Instagram profile posts could not be verified.');
}
async function returnToGrid(s){
 for(let attempt=0;attempt<3;attempt++){
  const nodes=await s.screen();if(has(nodes,'profile_tab_layout'))return;
  if(!has(nodes,'row_feed_profile_header')&&!has(nodes,'row_feed_button_share')&&!nodes.some(n=>visible(n)&&n['content-desc']==='Copy link'))throw new InterventionError('The public post viewer changed during verification.');
  await s.request('/back','POST',{});
  await s.until(next=>has(next,'profile_tab_layout'),'The public profile did not return.',15000);return;
 }
 throw new InterventionError('The public profile did not return.');
}
async function gridPost(s,tile){
 const current=nativeGridTiles(await s.screen()).find(n=>n.ordinal===tile.ordinal&&n['content-desc']===tile['content-desc']);
 if(!current)throw new InterventionError('The Instagram profile grid changed during verification.');
 await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('image_button'))+' and @content-desc='+xpathLiteral(current['content-desc'])+']');
 await s.until(nodes=>has(nodes,'row_feed_button_share'),'The selected public Instagram post did not open.');
}
export async function nativeInstagramBaseline(s,handle){
 const tiles=await profileGrid(s,handle),urls=[];
 const photos=tiles.slice(0,6).filter(tile=>!/^Reel by /i.test(tile['content-desc']||''));
 for(const tile of photos){await gridPost(s,tile);urls.push(await copyNativePostUrl(s));await returnToGrid(s);}
 if(new Set(urls).size!==photos.length)throw new InterventionError('The Instagram profile links were ambiguous. Nothing was shared.');
 await s.account(handle);return urls;
}
const captionMismatch='The published Instagram caption does not match the reviewed draft.';
const captionUnavailable='The complete published Instagram caption could not be verified.';
const captionAmbiguous='The current published Instagram caption is ambiguous.';
const truncated=value=>/(?:\u2026|\.\.\.)?\s*more$/i.test(value);
function captionMatch(nodes,handle,caption,{expandedFromMore=false}={}){
 const fields=nativePublishedCaption(nodes,handle);
 if(fields.length>1)return {matched:false,reason:'caption_ambiguous',message:captionAmbiguous};
 if(!fields.length)return null;
 const field=fields[0],actual=normalizeNativeCaption(field.caption),expected=normalizeNativeCaption(caption);
 if(actual===expected)return {matched:true};
 // This observed native surface appends a non-accessible collapse label. Only
 // the same call's verified More-to-expanded transition proves that UI suffix.
 if(actual===expected+' less')return expandedFromMore||captionControls(nodes,field,'less').length===1?{matched:true}:{reveal:field};
 if(truncated(actual)){
  const prefix=normalizeNativeCaption(actual.replace(/(?:\u2026|\.\.\.)?\s*more$/i,''));
  if(expected.startsWith(prefix))return {expand:field};
 }
 return {matched:false,reason:'caption_mismatch',message:captionMismatch};
}
async function inspectNativeViewer(s,handle,caption){
 const initial=await s.screen();
 if(!nativePostAuthor(initial,handle))return {matched:false,reason:'author_unverified',message:'The post author does not match the configured Instagram account or is ambiguous.'};
 if(caption===undefined)return {matched:true};
 let expandedFromMore=false;
 for(let attempt=0;attempt<5;attempt++){
  const nodes=attempt?await s.screen():initial;let result=captionMatch(nodes,handle,caption,{expandedFromMore});
  if(result?.expand){
   const field=result.expand,controls=captionControls(nodes,field,'more');
   if(controls.length>1)throw new InterventionError('The current Instagram caption expand control is ambiguous.');
   const query=controls.length===1?'//*[@package="com.instagram.android" and @text='+xpathLiteral(field.text)+' and @bounds='+xpathLiteral(field.bounds)+']//android.widget.Button[@content-desc="more" and @bounds='+xpathLiteral(controls[0].bounds)+' and @displayed="true"]':'//*[@text='+xpathLiteral(field.text)+']';
   await s.click('xpath',query);
   expandedFromMore=controls.length===1;
   result=await s.until(next=>{const value=captionMatch(next,handle,caption,{expandedFromMore});return value&&!value.expand&&value;},captionUnavailable,8000);
  }
  if(result&&!result.reveal)return result;
  if(attempt===4)break;
  const {width,height}=await sharp(await s.screenshot()).metadata();
  await s.request('/execute/sync','POST',{script:'mobile: scrollGesture',args:[{left:Math.round(width*.06),top:Math.round(height*.30),width:Math.round(width*.88),height:Math.round(height*.46),direction:'down',percent:.32}]});
 }
 return {matched:false,reason:'caption_unavailable',message:captionUnavailable};
}
// Verify an already-open public post without navigation or opening Copy link.
export async function verifyNativeViewer(s,handle,caption){
 const result=await inspectNativeViewer(s,handle,caption);
 if(!result.matched)throw new InterventionError(result.message);
 return true;
}
export async function verifyNativePost(s,url,handle,caption){
 const exact=instagramPostUrl(url);if(!exact)throw new InterventionError('An exact Instagram post URL is required.');
 await deepLink(s,exact);await s.until(nodes=>has(nodes,'row_feed_button_share'),'The exact Instagram post did not open.');
 await verifyNativeViewer(s,handle,caption);
 if(await copyNativePostUrl(s)!==exact)throw new InterventionError('Instagram opened a different post.');
 return exact;
}
export async function nativeInstagramPublication(s,handle,baseline,caption,onDiagnostic){
 // Final Share has already happened. Never leave a still-visible editor or retry Share.
 await s.until(n=>!has(n,'share_footer_button')&&!has(n,'caption_input_text_view'),'Instagram submission is still pending. Verify before retrying.',60000);
 const previous=new Set(baseline),matches=new Set(),diag={phase:'current_post',passes:0,inspected:0,matching:0,copied:0,candidates:[],rejected:[]};
 const report=async()=>onDiagnostic?.(structuredClone(diag));
 const reject=(ordinal,reason)=>{if(diag.rejected.length<12)diag.rejected.push({ordinal,reason});};
 await report();
 const current=await s.screen(),currentCaption=captionMatch(current,handle,caption);
 if(nativePostAuthor(current,handle)&&has(current,'row_feed_button_share')&&(currentCaption?.matched||currentCaption?.expand||currentCaption?.reveal)){
  const result=await inspectNativeViewer(s,handle,caption);
  if(result.matched){
   diag.matching++;const url=await copyNativePostUrl(s);diag.copied++;
   if(!previous.has(url)){
    diag.candidates.push(url);diag.phase='confirmed';await report();
    return {postUrl:url,candidates:[url]};
   }
   reject(null,'previous_post');await report();
  }
 }

 for(let pass=0;pass<2;pass++){
  diag.passes=pass+1;diag.phase=pass?'refreshing':'scanning';await report();
  const tiles=await profileGrid(s,handle,{refresh:pass===1});diag.phase='scanning';
  for(const tile of tiles.slice(0,4).filter(tile=>!/^Reel by /i.test(tile['content-desc']||''))){
   await gridPost(s,tile);diag.inspected++;
   let result;
   try{result=await inspectNativeViewer(s,handle,caption);}
   catch(error){diag.phase='failed';diag.failure=error instanceof InterventionError?'viewer_unavailable':'inspection_failed';await report();throw error;}
   if(result.matched){
    diag.matching++;const url=await copyNativePostUrl(s);diag.copied++;
    if(previous.has(url))reject(tile.ordinal,'previous_post');
    else{matches.add(url);if(!diag.candidates.includes(url)&&diag.candidates.length<8)diag.candidates.push(url);}
   }else reject(tile.ordinal,result.reason);
   await report();await returnToGrid(s);
  }
  if(matches.size)break;
 }
 if(matches.size!==1){
  diag.phase='failed';diag.failure=matches.size?'multiple_new_matches':'no_verified_new_post';await report();
  const reason=matches.size?'More than one new Instagram post matches the reviewed draft.':'The new Instagram post is not visible or its author and complete caption could not be verified.';
  throw new InterventionError(reason+' Verify Instagram before retrying; nothing was sent twice.');
 }
 diag.phase='confirmed';await report();
 return {postUrl:[...matches][0],candidates:diag.candidates};
}
