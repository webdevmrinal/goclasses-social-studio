// Copyright (c) 2026 Mrinal. Bind native channel attachments to the reviewed local file.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {wait,InterventionError} from './utils.js';

const fail=()=>new InterventionError('The channel attachment does not match the reviewed file. Nothing was sent.');
export async function channelFileSource(file,media,kind){
 const bytes=await fs.readFile(file),hash=createHash('sha256').update(bytes).digest('hex');
 if(media?.fileHash&&media.fileHash!==hash)throw fail();
 return {kind,hash,size:bytes.length,name:path.basename(media?.name||file),width:media?.width,height:media?.height,durationSeconds:media?.durationSeconds,bytes};
}
export function channelFilePayload(source){return {name:source.name,mimeType:source.kind==='document'?'application/pdf':source.name.toLowerCase().endsWith('.mov')?'video/quicktime':'video/mp4',buffer:source.bytes};}
export async function pinChannelFileInput(page,input,source){
 const key='__studioChannelFile_'+randomUUID().replaceAll('-','');
 const ok=await page.evaluate(async({el,key,source})=>{
  if(el.type!=='file'||el.files.length!==1)return false;
  const file=el.files[0],bytes=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(file.size!==source.size||hash!==source.hash)return false;
  window[key]={input:el,file,hash,name:file.name,size:file.size};return true;
 },{el:input,key,source:{hash:source.hash,size:source.size}});
 if(!ok)throw fail();return {key,hash:source.hash,size:source.size};
}
export async function verifyChannelFileInput(page,proof){
 if(!proof||!await page.evaluate(proof=>{const s=window[proof.key];return !!s&&s.hash===proof.hash&&s.size===proof.size&&s.input.type==='file'&&s.input.files.length===1&&s.input.files[0]===s.file;},proof))throw fail();
}
export async function releaseChannelFileInput(page,proof){if(proof?.key)await page.evaluate(key=>{delete window[key];},proof.key).catch(()=>{});}
export async function verifyChannelVideo(preview,source,evidence,{timeout=60000}={}){
 const end=Date.now()+timeout;
 do{
  const videos=preview.locator('video');if(await videos.count()>1)throw fail();
  if(await videos.count()===1){
   const proof=await videos.evaluateAll(async(videos,previous)=>{
    const video=videos[0],src=video.currentSrc||video.src;
    if(previous&&(src!==previous.src||video.src!==previous.src))return {changed:true};
    if(!video.getClientRects().length||video.readyState<1||!video.videoWidth||!video.videoHeight||!Number.isFinite(video.duration)||!src.startsWith('blob:'))return null;
    // Blob URLs identify immutable blobs. Reuse only this exact proven URL;
    // a changed URL is refused even when its filename looks the same.
    if(previous)return {...previous,width:video.videoWidth,height:video.videoHeight,durationSeconds:video.duration};
    const response=await fetch(src);if(!response.ok)return null;const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    return {hash,size:bytes.byteLength,width:video.videoWidth,height:video.videoHeight,durationSeconds:video.duration,src};
   },evidence).catch(()=>null);
   if(proof?.changed)throw fail();
   if(proof){
    if(proof.hash!==source.hash||proof.size!==source.size||evidence&&proof.hash!==evidence.hash||source.width&&proof.width!==source.width||source.height&&proof.height!==source.height||source.durationSeconds&&Math.abs(proof.durationSeconds-source.durationSeconds)>.25)throw fail();
    return proof;
   }
  }
  if(Date.now()>=end)throw new InterventionError('The channel video preview did not finish loading. Nothing was sent.');
  await wait(200);
 }while(true);
}
export async function pinTelegramDocument(dialog,source,inputProof){
 const card=dialog.locator('.document');
 if(await card.count()!==1||await dialog.locator('video,.popup-item-album,.popup-item-media img').count())throw fail();
 const names=card.locator('.document-name');if(await names.count()!==1||(await names.innerText()).trim()!==source.name)throw fail();
 const key='__studioTelegramDocument_'+randomUUID().replaceAll('-','');
 const handle=await card.elementHandle();try{await dialog.page().evaluate(({el,key})=>{window[key]={card:el,parent:el.parentElement,html:el.innerHTML};},{el:handle,key});}finally{await handle.dispose();}
 return {key,inputProof};
}
export async function verifyTelegramDocument(page,dialog,source,evidence){
 await verifyChannelFileInput(page,evidence?.inputProof);
 if(await dialog.locator('.document').count()!==1||await dialog.locator('video,.popup-item-album,.popup-item-media img').count()||(await dialog.locator('.document .document-name').innerText()).trim()!==source.name)throw fail();
 if(!await page.evaluate(key=>{const s=window[key];return !!s&&s.card.isConnected&&s.card.parentElement===s.parent&&s.card.innerHTML===s.html;},evidence.key))throw fail();
}
export async function releaseTelegramDocument(page,evidence){if(evidence?.key)await page.evaluate(key=>{delete window[key];},evidence.key).catch(()=>{});}
