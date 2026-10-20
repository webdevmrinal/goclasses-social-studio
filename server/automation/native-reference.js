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
export function nativePostAuthor(nodes,handle){const headers=nodes.filter(n=>visible(n)&&n['resource-id']===nativeId('row_feed_photo_profile_name'));return headers.length===1&&headers[0].text===handle;}
export function nativePublishedCaption(nodes,handle){const prefix=handle+' ';return nodes.filter(n=>visible(n)&&n.text?.startsWith(prefix)&&!n['resource-id']).map(n=>({...n,caption:n.text.slice(prefix.length)}));}
export async function copyNativePostUrl(s){
 const shares=(await s.screen()).filter(n=>visible(n)&&n['resource-id']===nativeId('row_feed_button_share'));
 if(shares.length!==1||!/^Send post[. ]/i.test(shares[0]['content-desc']||''))throw new InterventionError('The public post sharing control is ambiguous. Nothing was sent.');
 // A fresh sentinel prevents accepting any pre-existing clipboard URL.
 await s.request('/execute/sync','POST',{script:'mobile: setClipboard',args:[{content:Buffer.from('studio-receipt:'+randomUUID()).toString('base64'),contentType:'plaintext'}]});
 const share=await s.find('id',nativeId('row_feed_button_share'));await s.request('/element/'+share+'/click','POST',{});
 await s.until(nodes=>nodes.filter(n=>visible(n)&&n['resource-id']===nativeId('button')&&n['content-desc']==='Copy link').length===1,'Instagram did not expose Copy link.');
 await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('button'))+' and @content-desc="Copy link"]');
 const value=await s.request('/execute/sync','POST',{script:'mobile: getClipboard',args:[{}]});
 const url=instagramPostUrl(Buffer.from(value,'base64').toString('utf8'));
 if(!url)throw new InterventionError('Instagram did not return the exact post link. Nothing was sent.');
 if((await s.screen()).some(n=>visible(n)&&n['resource-id']===nativeId('button')&&n['content-desc']==='Copy link')){await s.request('/back','POST',{});await s.until(n=>!n.some(x=>visible(x)&&x['resource-id']===nativeId('button')&&x['content-desc']==='Copy link'),'The Copy link sheet did not close.');}
 return url;
}
async function profileGrid(s,handle){
 await deepLink(s,'https://www.instagram.com/'+encodeURIComponent(handle)+'/');
 await s.until(nodes=>nodes.some(n=>visible(n)&&n['resource-id']===nativeId('action_bar_title')&&n.text===handle)&&has(nodes,'profile_tab_layout'),'The configured native Instagram profile did not open.');
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
  await s.request('/back','POST',{});await new Promise(r=>setTimeout(r,500));
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
export async function verifyNativePost(s,url,handle,caption){
 const exact=instagramPostUrl(url);if(!exact)throw new InterventionError('An exact Instagram post URL is required.');
 await deepLink(s,exact);await s.until(nodes=>has(nodes,'row_feed_button_share'),'The exact Instagram post did not open.');
 if(!nativePostAuthor(await s.screen(),handle))throw new InterventionError('The post author does not match the configured Instagram account.');
 if(await copyNativePostUrl(s)!==exact)throw new InterventionError('Instagram opened a different post.');
 if(caption===undefined)return exact;
 for(let attempt=0;attempt<5;attempt++){
  const nodes=await s.screen(),fields=nativePublishedCaption(nodes,handle);
  if(fields.length===1){
   const field=fields[0];if(normalizeNativeCaption(field.caption)===normalizeNativeCaption(caption))return exact;
   if(/(?:\u2026|\.\.\.)?\s*more$/i.test(field.caption)){
    await s.click('xpath','//*[@text='+xpathLiteral(field.text)+']');
    await s.until(n=>nativePublishedCaption(n,handle).some(f=>normalizeNativeCaption(f.caption)===normalizeNativeCaption(caption)),'The published Instagram caption does not match the reviewed draft.',8000);return exact;
   }
   throw new Error('The published Instagram caption does not match the reviewed draft.');
  }
  const {width,height}=await sharp(await s.screenshot()).metadata();
  await s.request('/execute/sync','POST',{script:'mobile: scrollGesture',args:[{left:Math.round(width*.06),top:Math.round(height*.30),width:Math.round(width*.88),height:Math.round(height*.46),direction:'down',percent:.32}]});
 }
 throw new Error('The complete published Instagram caption could not be verified.');
}
export async function nativeInstagramPublication(s,handle,baseline,caption){
 // Final Share has already happened. Never leave a still-visible editor or retry Share.
 await s.until(n=>!has(n,'share_footer_button')&&!has(n,'caption_input_text_view'),'Instagram submission is still pending. Verify before retrying.',60000);
 const tiles=await profileGrid(s,handle),fresh=[];
 for(const tile of tiles.slice(0,4).filter(tile=>!/^Reel by /i.test(tile['content-desc']||''))){await gridPost(s,tile);const url=await copyNativePostUrl(s);if(!baseline.includes(url))fresh.push(url);await returnToGrid(s);}
 const matches=[];for(const url of fresh){try{await verifyNativePost(s,url,handle,caption);matches.push(url);}catch(error){if(error instanceof InterventionError)throw error;}}
 if(matches.length!==1)throw new Error('The exact new Instagram post could not be confirmed. Verify before retrying; nothing was sent twice.');
 return {postUrl:matches[0],candidates:fresh};
}
