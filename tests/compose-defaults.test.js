// Offline upload and selection defaults; no social account or device actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import sharp from 'sharp';
import {createApp} from '../server/index.js';
import {freshDraft,workspaceFingerprint} from '../shared/draft.js';
import {mediaFor,updateDraftMedia,setTextOnly,selectionErrors} from '../shared/media.js';
import {detectManychatLinks,resetManychatImport,validateManychatDraft} from '../shared/manychat.js';
import {importStory} from '../shared/instagram.js';
import {pngChunk,inspectImage} from '../server/image-metadata.js';
const photos=[{id:'a',kind:'image'},{id:'b',kind:'image'},{id:'c',kind:'image'}];
test('new drafts keep Story off, prepare imported link suggestions without enabling it, and use Instagram photo 2',()=>{
 const d=freshDraft();d.mediaIds=photos.map(m=>m.id);assert.equal(d.instagram.story.enabled,false);assert.equal(importStory({instagramStory:'Application Form\nhttps://example.org/apply'}).enabled,false);
 for(const id of ['linkedin','whatsapp','telegram'])assert.deepEqual(mediaFor(d,photos,id).map(m=>m.id),['b']);
 assert.deepEqual(mediaFor(d,photos,'instagram').map(m=>m.id),['a','b','c']);
 d.mediaByPlatform.instagram=['c','a'];for(const id of ['linkedin','whatsapp','telegram'])assert.deepEqual(mediaFor(d,photos,id).map(m=>m.id),['a']);
 d.mediaByPlatform.linkedin=['b'];d.mediaByPlatform.telegram=[];setTextOnly(d,'telegram',true);d.mediaByPlatform.instagram=['b','c'];assert.deepEqual(mediaFor(d,photos,'linkedin').map(m=>m.id),['b']);assert.deepEqual(mediaFor(d,photos,'telegram'),[]);assert.deepEqual(mediaFor(d,photos,'whatsapp').map(m=>m.id),['c']);
});
test('secondary selection follows lossless replacement IDs and falls back to the sole photo',()=>{
 const d=freshDraft();d.mediaIds=['a'];for(const id of ['linkedin','whatsapp','telegram'])assert.deepEqual(mediaFor(d,[photos[0]],id).map(m=>m.id),['a']);
 d.mediaByPlatform.instagram=['a','b'];updateDraftMedia(d,['a','clean-b'],{b:'clean-b'});const library=[photos[0],{id:'clean-b',kind:'image'}];for(const id of ['linkedin','whatsapp','telegram'])assert.deepEqual(mediaFor(d,library,id).map(m=>m.id),['clean-b']);
 const before=workspaceFingerprint(d);d.mediaDefaults.instagramSecond=false;assert.notEqual(workspaceFingerprint(d),before);assert.deepEqual(mediaFor(d,library,'linkedin'),library);assert.deepEqual(mediaFor(d,library,'whatsapp'),[photos[0]]);
 assert(selectionErrors({...d,mediaDefaults:{instagramSecond:'true'}}).length);
 // A video/PDF draft still uses its supported attachment route, independently of photo defaults.
 const clip={id:'v',kind:'video',format:'mp4',width:320,height:640,durationSeconds:3};assert.deepEqual(mediaFor(freshDraft(),[clip],'telegram'),[clip]);
});
test('automatic ManyChat buttons handle bold, adjacent Markdown, bare domains, query entities and collaboration text',()=>{
 const text='**Application Form:** **https://example.org/apply?id=7&amp;source=ig**\n[Official notice](https://example.org/notice_(CS).pdf)[Brochure](https://example.org/brochure.pdf)\nJoin: t.me/goclasses\nContact help@example.com';
 const links=detectManychatLinks(text);assert.deepEqual(links.map(l=>l.url),['https://example.org/apply?id=7&source=ig','https://example.org/notice_(CS).pdf','https://example.org/brochure.pdf','https://t.me/goclasses']);assert(links.every(l=>l.label.length>0&&[...l.label].length<=20));assert.equal(links[0].label,'Application Form');assert.throws(()=>validateManychatDraft({},text),/three/);
 const imported=resetManychatImport();assert.equal(imported.linksMode,'auto');assert.deepEqual(validateManychatDraft(imported,'Apply: goclasses.in/apply').links,[{label:'Apply',url:'https://goclasses.in/apply'}]);assert.deepEqual(detectManychatLinks('Email staff@admissions.example.com'),[]);assert.deepEqual(detectManychatLinks('A greeting with no URLs.'),[]);
});
async function fixture(t){
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-auto-clean-')),{app,queue}=await createApp({dataDir,browser:{page:()=>assert.fail('No social browser')},queueOptions:{runner:()=>assert.fail('No publishing')}}),server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{assert.equal(queue.runs.length,0);server.closeAllConnections();await new Promise(r=>server.close(r));assert.equal(path.dirname(dataDir),path.resolve(os.tmpdir()));assert(path.basename(dataDir).startsWith('studio-auto-clean-'));await fs.rm(dataDir,{recursive:true,force:true});});
 return {dataDir,origin,upload:async files=>{const form=new FormData();for(const f of files)form.append('images',new Blob([f.bytes],{type:f.type}),f.name);return fetch(origin+'/api/upload',{method:'POST',headers:{Origin:origin},body:form});}};
}
for(const format of ['png','jpeg','webp'])test(format+' upload automatically cleans origin metadata, verifies image quality, and preserves a retrievable original',async t=>{
 const f=await fixture(t);let bytes=await sharp({create:{width:71,height:43,channels:format==='png'?4:3,background:'#3568A980'}}).withMetadata({orientation:6,exif:{IFD0:{Artist:'ChatGPT OpenAI Media Service',ImageDescription:'trainedAlgorithmicMedia'}}}).toFormat(format).toBuffer();if(format==='png')bytes=Buffer.concat([bytes.subarray(0,33),pngChunk('caBX',Buffer.from('jumb c2pa ChatGPT')),bytes.subarray(33)]);
 const response=await f.upload([{bytes,type:'image/'+format,name:'Poster.'+format}]);assert.equal(response.status,201);const {media,sources}=await response.json(),m=media[0];assert.equal(media.length,1);assert.equal(sources.length,1);assert.equal(m.autoCleaned,true);assert.equal(m.sourceId,sources[0].id);assert.equal(m.width,71);assert.equal(m.height,43);assert(m.verification.pixelsEqual&&m.verification.compressedPixelsUnchanged&&m.verification.dimensionsEqual);assert.equal(m.verification.platformLabelPrediction,'unknown');assert.equal(m.metadata.credentials,false);assert.deepEqual(m.metadata.aiMarkers,[]);
 const cleanBytes=Buffer.from(await(await fetch(f.origin+m.url)).arrayBuffer()),original=Buffer.from(await(await fetch(f.origin+sources[0].url)).arrayBuffer());assert.deepEqual(original,bytes);assert.equal((await inspectImage(cleanBytes)).report.credentials,false);assert(!cleanBytes.includes(Buffer.from('ChatGPT')));assert.deepEqual(await sharp(cleanBytes).rotate().raw().toBuffer(),await sharp(bytes).rotate().raw().toBuffer());assert.equal((await fs.readdir(path.join(f.dataDir,'incoming'))).length,0);
});
test('cleaning is atomic across an image followed by an invalid document',async t=>{
 const f=await fixture(t),plain=await sharp({create:{width:20,height:20,channels:3,background:'red'}}).png().toBuffer(),bytes=Buffer.concat([plain.subarray(0,33),pngChunk('caBX',Buffer.from('c2pa ChatGPT')),plain.subarray(33)]),response=await f.upload([{bytes,type:'image/png',name:'Good.png'},{bytes:Buffer.from('%PDF-1.7\ninvalid'),type:'application/pdf',name:'Bad.pdf'}]);assert.equal(response.status,400);assert.deepEqual(await fs.readdir(path.join(f.dataDir,'incoming')),[]);assert.deepEqual(await fs.readdir(path.join(f.dataDir,'uploads')),[]);assert.equal((await(await fetch(f.origin+'/api/bootstrap')).json()).media.length,0);
});
