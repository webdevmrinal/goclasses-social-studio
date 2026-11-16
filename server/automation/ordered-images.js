// Serialize image preparation, then bind the visible order to reviewed content.
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {uploadImages,InterventionError,waitUntilReady} from './utils.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const failure=label=>new InterventionError(label+' image order or content differs from the reviewed selection. Nothing was published. Check the cover image first.');
export async function orderedImageSources(files){
 return Promise.all(files.map(async(file,index)=>{
  const buffer=typeof file==='string'?await fs.readFile(file):file.buffer,info=await sharp(buffer).metadata(),format=info.format==='jpeg'?'jpg':info.format;
  if(!['jpg','png','webp'].includes(format))throw new InterventionError('Only reviewed photos can use the ordered photo uploader.');
  const pixels=await sharp(buffer).autoOrient().flatten({background:'#ffffff'}).toColourspace('srgb').resize(96,96,{fit:'fill'}).blur(1).removeAlpha().raw().toBuffer();
  return {pixels,hash:hash(pixels),fileHash:hash(buffer),payload:{name:String(index+1).padStart(2,'0')+'_'+(index?'slide':'cover')+'.'+format,mimeType:'image/'+(format==='jpg'?'jpeg':format),buffer}};
 }));
}
async function previewImages(page,images,count,label,knownHashes){
 return waitUntilReady(page,async()=>{
  const rows=await images.evaluateAll(async(els,known)=>Promise.all(els.filter(img=>img.getClientRects().length&&getComputedStyle(img).visibility!=='hidden').map(async(img,index)=>{
   if(!img.complete||!img.naturalWidth||!img.naturalHeight)return null;
   try{const response=await fetch(img.currentSrc||img.src);if(!response.ok)return null;const bytes=new Uint8Array(await response.arrayBuffer()),hash=crypto.subtle?[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join(''):null,r=img.getBoundingClientRect();let data;
    if(!hash||!known.includes(hash)){let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));data=btoa(raw);}
    return {hash,data,top:r.top,left:r.left,index};
   }catch{return null;}
  })),knownHashes);
  if(rows.length>count)throw failure(label);if(rows.length!==count||rows.some(r=>!r))return false;
  return Promise.all(rows.sort((a,b)=>Math.abs(a.top-b.top)>8?a.top-b.top:a.left-b.left||a.index-b.index).map(async r=>{
   const bytes=r.data?Buffer.from(r.data,'base64'):undefined,pixels=bytes?await sharp(bytes).autoOrient().flatten({background:'#ffffff'}).toColourspace('srgb').resize(96,96,{fit:'fill'}).blur(1).removeAlpha().raw().toBuffer():undefined;
   return {hash:r.hash||hash(bytes),pixels};
  }));
 },{timeout:30000,message:label+' photo previews are still loading or could not be checked. Nothing was published.'});
}
function distance(a,b){let sum=0,squared=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];sum+=Math.abs(d);squared+=d*d;}return {mean:sum/a.length,rms:Math.sqrt(squared/a.length)};}
export async function verifyOrderedImages(page,images,sources,evidence,{label='Post'}={}){
 const actual=await previewImages(page,images,sources.length,label,[...sources.map(s=>s.fileHash),...(evidence||[]).map(e=>e.hash)]);
 for(let i=0;i<actual.length;i++){
  if(sources[i].fileHash===actual[i].hash||evidence?.[i]?.hash===actual[i].hash)continue;
  if(!actual[i].pixels)throw failure(label);
  const expected=distance(sources[i].pixels,actual[i].pixels);if(expected.mean>5||expected.rms>12)throw failure(label);
  for(let j=0;j<sources.length;j++)if(j!==i&&sources[j].hash!==sources[i].hash&&distance(sources[j].pixels,actual[i].pixels).mean+.1<expected.mean)throw failure(label);
 }
 return actual.map(({hash})=>({hash}));
}
export async function uploadOrderedImages(page,files,step,{input,appendInput=input,images,label='Post',signal}={}){
 signal?.throwIfAborted();if(await images.evaluateAll(els=>els.some(img=>img.getClientRects().length&&getComputedStyle(img).visibility!=='hidden'&&img.src)))throw new InterventionError(label+' already contains media. Its existing draft was preserved.');
 const sources=await orderedImageSources(files);
 for(let i=0;i<sources.length;i++){
  signal?.throwIfAborted();await step('Uploading photo '+(i+1)+' of '+sources.length+' in reviewed order...');
  await uploadImages(page,[sources[i].payload],async()=>{},{input:i?appendInput:input});
  await verifyOrderedImages(page,images,sources.slice(0,i+1),undefined,{label});
 }
 return {sources,evidence:await verifyOrderedImages(page,images,sources,undefined,{label})};
}
