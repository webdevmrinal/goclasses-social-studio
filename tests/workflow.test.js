// Copyright (c) 2026 Mrinal. Offline draft lifecycle and metadata consent tests.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {once} from 'node:events';import sharp from 'sharp';
import {freshDraft,workspaceFingerprint,reconcilePublishedDraft} from '../shared/draft.js';
import {parseCaptions} from '../shared/platforms.js';import {mediaFor,updateDraftMedia,setTextOnly,metadataNeedsReview,metadataConsentValid} from '../shared/media.js';import {createApp} from '../server/index.js';import {defaults} from '../server/config.js';import {pngChunk} from '../server/image-metadata.js';
const media=[{id:'old'},{id:'new'}];
test('imports accept one caption and explicit empty sections without enabling missing platforms',()=>{
 const result=parseCaptions('=====INSTAGRAM=====\nOnly Instagram\n\n=====TELEGRAM=====\n');assert.deepEqual(result.errors,[]);assert.equal(result.captions.instagram,'Only Instagram');assert.equal(result.captions.telegram,'');assert.equal(result.captions.linkedin,'');assert(parseCaptions('=====X=====\n').errors.length);
});
test('empty selections created by removing old files inherit the next upload; intentional text-only persists',()=>{
 const d=freshDraft();d.mediaIds=['old'];d.mediaByPlatform={whatsapp:['old'],telegram:['old']};updateDraftMedia(d,[]);assert(!Object.hasOwn(d.mediaByPlatform,'whatsapp'));assert(!Object.hasOwn(d.mediaByPlatform,'telegram'));
 updateDraftMedia(d,['new']);assert.deepEqual(mediaFor(d,[media[1]],'whatsapp'),[media[1]]);assert.deepEqual(mediaFor(d,[media[1]],'telegram'),[media[1]]);
 d.mediaByPlatform.telegram=[];setTextOnly(d,'telegram',true);updateDraftMedia(d,['old','new']);assert.deepEqual(mediaFor(d,media,'telegram'),[]);assert.deepEqual(mediaFor(d,media,'whatsapp'),[media[0]]);
 d.mediaByPlatform.whatsapp=['new'];updateDraftMedia(d,['old','clean'],{new:'clean'});assert.deepEqual(d.mediaByPlatform.whatsapp,['clean']);
});
function submitted(){const d=freshDraft('android');d.selected=['instagram','x'];d.captions.instagram='Published';d.captions.x='Another';d.mediaIds=['old'];d.instagram.music={enabled:true,selection:{id:'chosen'}};d.submission={runId:'run',fingerprint:workspaceFingerprint(d)};return d;}
test('successful live completion clears the workspace and song; TEST and newer edits stay intact',()=>{
 let d=submitted(),run={id:'run',mode:'LIVE',status:'completed',items:[{id:'instagram',status:'posted'},{id:'x',status:'posted'}]};const original=structuredClone(d),result=reconcilePublishedDraft(d,run);assert(result.cleared);assert.deepEqual(result.draft.mediaIds,[]);assert.equal(result.draft.instagram.music.selection,undefined);assert.deepEqual(d,original);
 assert.equal(reconcilePublishedDraft(d,{...run,mode:'TEST'}),null);d.captions.x='New work';const retained=reconcilePublishedDraft(d,run);assert.equal(retained.draft.captions.x,'New work');assert(retained.draft.instagram.music.selection);assert(!retained.cleared);
});
test('partial live completion clears only confirmed destinations and preserves failed captions/media',()=>{
 const d=submitted(),run={id:'run',mode:'LIVE',status:'completed_with_errors',items:[{id:'instagram',status:'posted',publication:{postUrl:'https://www.instagram.com/p/EXACT/'}},{id:'x',status:'uncertain'}]};const result=reconcilePublishedDraft(d,run).draft;assert.equal(result.captions.instagram,'');assert.equal(result.captions.x,'Another');assert.deepEqual(result.mediaIds,['old']);assert.deepEqual(result.selected,['x']);assert.equal(result.instagram.music.selection,undefined);
});
test('metadata review includes only images actually uploaded and consent is tied to exact file identity',()=>{
 const a={id:'a',fileHash:'sha-a',metadata:{aiMarkers:['generator']}},b={id:'b',fileHash:'sha-b',metadata:{credentials:true}},d={selected:['whatsapp'],mediaIds:['a','b'],mediaByPlatform:{whatsapp:['b']}};assert.deepEqual(metadataNeedsReview(d,[a,b]),[b]);assert(!metadataConsentValid([b],{b:'sha-a'}));assert(metadataConsentValid([b],{b:'sha-b'}));assert(!metadataConsentValid([b],null));assert.deepEqual(metadataNeedsReview({...d,selected:['manychat']},[a,b]),[]);
});
test('LIVE metadata review is enforced at the API while TEST preparation remains available',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-metadata-consent-'));const config=structuredClone(defaults);config.platforms.x.handle='ours';await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));
 const {app,queue}=await createApp({dataDir:dir,browser:{page:async()=>({isClosed:()=>true})},queueOptions:{runner:async ctx=>ctx.mode==='TEST'?'dry_run':'posted'}});const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port,json=body=>({method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
 const png=await sharp({create:{width:100,height:100,channels:3,background:'red'}}).png().toBuffer(),buffer=Buffer.concat([png.subarray(0,33),pngChunk('caBX',Buffer.from('jumb c2pa ChatGPT gpt-image')),png.subarray(33)]),form=new FormData();form.append('images',new Blob([buffer],{type:'image/png'}),'AI origin.png');const asset=(await (await fetch(origin+'/api/upload',{method:'POST',headers:{Origin:origin},body:form})).json()).media[0];
 const draft={selected:['x'],captions:{x:'A post'},mediaIds:[asset.id]};const body={draft,mode:'LIVE',confirmation:'POST'};
 assert.equal((await fetch(origin+'/api/runs',json(body))).status,409);assert.equal(queue.runs.length,0);
 assert.equal((await fetch(origin+'/api/runs',json({...body,metadataConsent:{[asset.id]:'wrong-sha'}}))).status,409);
 assert.equal((await fetch(origin+'/api/runs',json({draft,mode:'TEST'}))).status,201);for(let i=0;i<100&&queue.processing;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal((await fetch(origin+'/api/runs',json({...body,metadataConsent:{[asset.id]:asset.fileHash}}))).status,201);for(let i=0;i<100&&queue.processing;i++)await new Promise(r=>setTimeout(r,10));assert.equal(queue.runs[0].items[0].status,'posted');
 }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
