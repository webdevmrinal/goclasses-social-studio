// Copyright (c) 2026 Mrinal. Offline lifecycle and scaled-gesture fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {InstagramAndroidWorker} from '../server/automation/instagram-android.js';
import {Queue} from '../server/queue.js';
import {defaults} from '../server/config.js';
import {fitScrollArea} from '../shared/android-performance.js';
import {tapCanvas} from '../server/automation/native-repost.js';
import {nativeId} from '../server/automation/android-native.js';
const config={platforms:{instagram:{handle:'ours'}}};
const ctx={runId:'run-a',config,signal:new AbortController().signal,step:async()=>{}};
function fixture(){
 let connected=0,checked=0,closed=0,wrong=false;
 const session={open:async()=>{connected++;return session;},account:async handle=>{assert.equal(handle,'ours');checked++;if(wrong)throw Error('Wrong account or unsent draft');},close:async()=>{closed++;}};
 const worker=new InstagramAndroidWorker({dataDir:'unused-performance-fixture',sessionFactory:()=>session});
 return {worker,session,counts:()=>({connected,checked,closed}),changeAccount:()=>wrong=true};
}
test('native-first preflight reuses its driver but checks account and drafts again before preparing',async()=>{
 const f=fixture();await f.worker.checkAccount(config,{runId:ctx.runId});assert(f.worker.busy);assert.deepEqual(f.counts(),{connected:1,checked:1,closed:0});
 assert.equal(await f.worker.openForRun(ctx),f.session);assert.deepEqual(f.counts(),{connected:1,checked:2,closed:0});assert.equal(f.worker.preflight,null);assert.equal(f.session.signal,ctx.signal);
 await f.worker.close();assert.deepEqual(f.counts(),{connected:1,checked:2,closed:1});assert(!f.worker.busy);
});
test('native preflight cannot cross runs or conceal a changed account/unsent editor',async()=>{
 let f=fixture();await f.worker.checkAccount(config,{runId:'another-run'});await assert.rejects(f.worker.openForRun(ctx),/preflight changed/);assert.equal(f.counts().closed,1);assert(!f.worker.busy);
 f=fixture();await f.worker.checkAccount(config,{runId:ctx.runId});f.changeAccount();await assert.rejects(f.worker.openForRun(ctx),/Wrong account/);assert.equal(f.counts().connected,1);assert.equal(f.counts().closed,1);assert(!f.worker.busy);
});
test('an intervening failed channel preflight releases the retained Android connection without running a destination',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-performance-'));let closed=0,calls=0;
 const worker={busy:false,preflight:null,checkAccount:async(c,{runId})=>{assert(runId);worker.preflight={runId};worker.busy=true;},close:async()=>{closed++;worker.preflight=null;worker.busy=false;}};
 try{
  const queue=new Queue({page:async()=>({isClosed:()=>true})},{dataDir:dir,instagramWorker:worker,runner:async()=>{calls++;return 'dry_run';},loginChecker:async()=>({status:'needs_login',message:'Expired channel session'})});await queue.init();
  const run=await queue.start({draft:{selected:['instagram','whatsapp'],captions:{},instagram:{postingMethod:'android'}},config:defaults,media:[]});
  for(let i=0;i<100&&queue.processing;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(run.status,'attention');assert.equal(calls,0);assert.equal(closed,1);assert(!worker.busy);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('picker scrolling scales within the same safe region on full and lighter displays',()=>{
 assert.deepEqual(fitScrollArea({width:720,height:1560}),{left:4,top:500,width:712,height:750,direction:'down',percent:.65});
 for(const [width,height] of [[540,1170],[720,1560],[1080,2340]]){
  const area=fitScrollArea({width,height});assert(area.left>=0&&area.left+area.width<width);assert(area.top>height*.3);assert(area.top+area.height<height*.82);
 }
 assert.throws(()=>fitScrollArea({width:undefined,height:undefined}),/could not be verified/);
});
test('Story tap exclusions scale with the display and still reject the final sharing strip',async()=>{
 for(const [width,height] of [[540,1170],[720,1560]]){
  const calls=[],s={screen:async()=>[{'resource-id':nativeId('story_share_controls_action_bar'),displayed:'true'},{'resource-id':nativeId('camera_photo_texture_view'),displayed:'true',bounds:'[0,0]['+width+','+height+']'}],gesture:async actions=>calls.push(actions)};
  await tapCanvas(s,width*.5,height*.45);assert.equal(calls.length,1);
  await assert.rejects(tapCanvas(s,width*.5,height*.96),/outside the editable safe area/);assert.equal(calls.length,1);
 }
});
