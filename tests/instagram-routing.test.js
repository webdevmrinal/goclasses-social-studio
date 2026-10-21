// Copyright (c) 2026 Mrinal. Offline fixtures only; never publishes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {instagramOptions,instagramMethod,usesInstagramAndroid,instagramMusicEnabled} from '../shared/instagram.js';
import {destinationReadiness} from '../shared/readiness.js';
import {Queue} from '../server/queue.js';
import {defaults} from '../server/config.js';
import {createApp} from '../server/index.js';
import {AndroidSession,instagramAnr,androidAnrOwner,nativeNodes} from '../server/automation/android-native.js';
const browser={page:async()=>({isClosed:()=>true,close:async()=>{}})};
const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Queue did not settle');};
const selection={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',key:'123',title:'Reviewed song',artist:'Artist'};

test('explicit feed route overrides legacy music dispatch; Stories remain native',()=>{
  assert.equal(instagramMethod({}),'web');assert.equal(instagramMethod({music:{enabled:true}}),'android');
  const web=instagramOptions({postingMethod:'web',music:{enabled:true,selection}});
  assert.equal(web.music.enabled,true);assert(!usesInstagramAndroid(web));assert(instagramMusicEnabled(web));assert(usesInstagramAndroid(web,'instagramMusic'));
  const mixed=instagramOptions({postingMethod:'web',music:{enabled:true,selection},story:{enabled:true}});
  assert(!usesInstagramAndroid(mixed));assert(instagramMusicEnabled(mixed));assert(usesInstagramAndroid(mixed,'instagramStory'));assert(instagramMusicEnabled(mixed,'instagramStory'));
  const native=instagramOptions({postingMethod:'android',music:{enabled:false}});assert(usesInstagramAndroid(native));assert(!instagramMusicEnabled(native));
  assert.throws(()=>instagramOptions({postingMethod:'unknown'}),/choose Web or Android/);
});

test('Web feed runs without touching even an unavailable Android worker; Android without music preflights',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-routing-'));let checks=0;const calls=[];
  try{
    const worker={checkAccount:async()=>{checks++;throw Error('Emulator unavailable');}};
    const queue=new Queue(browser,{dataDir:dir,instagramWorker:worker,runner:async ctx=>{calls.push(ctx.id);assert.equal(ctx.instagram.postingMethod,'web');return 'dry_run';}});await queue.init();
    const draft={selected:['instagram'],captions:{instagram:'Reviewed'},instagram:{postingMethod:'web',music:{enabled:false}}};
    const run=await queue.start({draft,config:defaults,media:[]});await wait(()=>run.status==='completed'&&!queue.processing);
    assert.equal(checks,0);assert.deepEqual(calls,['instagram']);
    draft.instagram={postingMethod:'android',music:{enabled:false}};
    const blocked=await queue.start({draft,config:defaults,media:[]});await wait(()=>blocked.status==='attention'&&!queue.processing);
    assert.equal(checks,1);assert.deepEqual(calls,['instagram']);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('switching transport permits review after failed preparation, never after ambiguous submission',()=>{
  const captions={instagram:'Reviewed caption'},media=[{id:'image'}],config={platforms:{instagram:{handle:'ours'}}};
  const draft={selected:['instagram'],captions,mediaIds:['image'],instagram:{postingMethod:'web',music:{enabled:false}}};
  const run={captions,media,instagram:{postingMethod:'android',music:{enabled:true,selection}},items:[{id:'instagram',status:'failed',message:'Preparation timed out'}]};
  assert(destinationReadiness(draft,media,config,{},undefined,[run]).instagram.ready);
  run.items[0].status='uncertain';assert(!destinationReadiness(draft,media,config,{},undefined,[run]).instagram.ready);
  const newer={...run,items:[{id:'instagram',status:'failed'}],instagram:draft.instagram};
  assert(destinationReadiness(draft,media,config,{},undefined,[newer,run]).instagram.errors.some(e=>e.includes('submission')));
});

test('native timeout waits for disconnect, prevents late preparation and Share, and never falls back to Web',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-native-timeout-'));let stopped=false;const calls=[];
  try{
    const queue=new Queue({page:async()=>assert.fail('No native browser page')},{dataDir:dir,deadline:25,instagramWorker:{checkAccount:async()=>{}},runner:async ctx=>{
      calls.push(ctx.id);
      try{
        await new Promise(resolve=>ctx.signal.addEventListener('abort',resolve,{once:true}));
        await new Promise(resolve=>setTimeout(resolve,45));
        assert.equal(queue.processing,true);assert.equal(calls.length,1);
        await assert.rejects(ctx.recordPreparation({bad:'late'}));
        assert.throws(()=>ctx.step('late progress'));
        await assert.rejects(ctx.markSubmitting());
        throw ctx.signal.reason;
      }finally{stopped=true;}
    }});await queue.init();
    const run=await queue.start({draft:{selected:['instagram','x'],captions:{},instagram:{postingMethod:'android'}},config:defaults,media:[]});
    await wait(()=>run.status==='attention'&&!queue.processing);
    assert(stopped);assert.deepEqual(calls,['instagram']);assert.equal(run.items[0].submitting,false);assert.equal(run.items[0].preparation,undefined);assert.equal(run.items[1].status,'queued');
    assert.match(run.items[0].message,/choose Web/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

const n=(id,text,extra={})=>({'resource-id':'android:id/'+id,text,package:'android',displayed:'true',class:'android.widget.TextView',...extra});
const dialog=()=>[n('alertTitle',"Instagram isn't responding"),n('aerr_wait','Wait'),n('aerr_close','Close app')];
const xml=nodes=>'<hierarchy>'+nodes.map(n=>'<node '+Object.entries(n).map(([k,v])=>k+'="'+String(v).replaceAll('&','&amp;').replaceAll('"','&quot;')+'"').join(' ')+'/>').join('')+'</hierarchy>';
test('ANR detection requires the exact visible Instagram system dialog',()=>{
  assert(instagramAnr(dialog()));assert(!instagramAnr(dialog().map(n=>({...n,package:'com.instagram.android'}))));
  assert(!instagramAnr(dialog().map(n=>({...n,displayed:'false'}))));assert(!instagramAnr(dialog().map(n=>({...n,text:n.text.replace('Instagram','Other app')}))));
});
test('Instagram ANR gets one Wait only, never Close app or a repeated send',async()=>{
  const s=Object.create(AndroidSession.prototype),calls=[];let frame=dialog();
  const caption=[{'resource-id':'com.instagram.android:id/caption_input_text_view',text:'Unsent caption',package:'com.instagram.android',displayed:'true',class:'android.widget.EditText'}];
  s.request=async endpoint=>{assert.equal(endpoint,'/source');return xml(frame);};
  s.click=async(using,id)=>{calls.push(id);assert.equal(using,'id');assert.equal(id,'android:id/aerr_wait');frame=caption;};
  s.onUnresponsive=async message=>{assert.match(message,/draft is preserved/);};
  assert.deepEqual(await s.screen(),nativeNodes(xml(caption)));assert.deepEqual(calls,['android:id/aerr_wait']);
  frame=dialog();await assert.rejects(s.screen(),/not responding/);assert.equal(calls.length,1);
  const other=Object.create(AndroidSession.prototype);other.request=async()=>xml(dialog().map(n=>({...n,text:n.text.replace('Instagram','Other app')})));other.click=async()=>assert.fail('Do not act on another app');
  await assert.rejects(other.screen(),/unrecognized/);
});
test('closing a cancelled Android session keeps its abort guard active',async()=>{
  const s=Object.create(AndroidSession.prototype),controller=new AbortController();s.id='fixture';s.signal=controller.signal;controller.abort();
  s.request=async(endpoint,method)=>{assert.equal(method,'DELETE');assert(s.signal.aborted);};await s.close();assert.equal(s.id,null);assert(s.signal.aborted);
  await assert.rejects(s.adb(['shell','input','tap','1','1']),{name:'AbortError'});
});

test('HTTP Web-only validation ignores an unused stored song and freezes the reviewed route',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-route-http-'));const config=structuredClone(defaults);config.platforms.instagram.handle='ours';await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));
  const {app}=await createApp({dataDir:dir,browser});const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  try{
    const draft={selected:['instagram'],mediaIds:[],captions:{instagram:'Caption'},instagram:{postingMethod:'web',music:{enabled:false,selection:{id:'obsolete'}}}};
    const response=await fetch(origin+'/api/readiness',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(draft)});
    assert.equal(response.status,200);const data=await response.json();assert(!data.destinations.instagram.errors.some(e=>/song|Android/.test(e)));
    draft.instagram.postingMethod='invalid';const invalid=await fetch(origin+'/api/validate',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(draft)});assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/choose Web or Android/);
  }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});


test('verified System UI ANR uses one non-destructive Wait and never dismisses another app',async()=>{
 const frame=dialog().map(n=>({...n,text:n.text.replace('Instagram','System UI')}));assert.equal(androidAnrOwner(frame),'systemUi');assert(!instagramAnr(frame));
 const s=Object.create(AndroidSession.prototype);let current=frame,waits=0;
 s.request=async()=>xml(current);s.click=async(using,id)=>{assert.equal(id,'android:id/aerr_wait');waits++;current=[];};
 assert.deepEqual(await s.screen(),[]);current=frame;await assert.rejects(s.screen(),/System UI is not responding/);assert.equal(waits,1);
 assert.equal(androidAnrOwner(dialog().map(n=>({...n,text:n.text.replace('Instagram','Messages')}))),null);
});
