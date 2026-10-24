// Copyright (c) 2026 Mrinal. Practice API fixtures use no browser, native device, Gemini, or social account.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter, once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/index.js';
import { defaults } from '../server/config.js';

const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const until=async predicate=>{for(let index=0;index<200;index++){if(await predicate())return;await delay(10);}assert.fail('The isolated recovery task did not reach the expected state.');};
async function fixture(t,runner=async()=>({completed:true})){
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-recovery-api-'));
 await fs.writeFile(path.join(dataDir,'config.json'),JSON.stringify(defaults));
 const phoneTools=new EventEmitter();phoneTools.screen={opening:false,close:async()=>{}};phoneTools.configure=async()=>{};phoneTools.state=()=>({devices:[],connected:false,scanning:false,mirror:{open:false}});phoneTools.close=async()=>{};
 const settings={enabled:true,automatic:true,configured:true,status:'ready',message:'Automatic recovery enabled.',today:{used:0,remaining:10}},calls=[],changes=[];
 const ai={init:async()=>{},state:()=>structuredClone(settings),configure:async()=>assert.fail('These tests must not configure or expose a key.'),plan:async()=>assert.fail('An API fixture must never call a model.')};
 const page={fixture:true};const browser={page:async id=>{calls.push(id);assert.equal(id,'geminiPractice');return page;},close:async()=>{}};
 const native={busy:false,close:async()=>{},selection:()=>assert.fail('No Android actions allowed in recovery practice API fixture')};
 const updateBridge=new EventEmitter();updateBridge.state={supported:false,phase:'idle'};
 const {app,queue}=await createApp({dataDir,browser,phoneTools,navigationAI:ai,updateBridge,securityOptions:{password:'',origin:'',secureCookie:false},queueOptions:{instagramWorker:native,runner:async()=>assert.fail('Practice cannot publish or create a social run.'),loginChecker:async()=>assert.fail('Practice cannot check social logins.')},recoveryPracticeRunner:runner});
 queue.on('change',value=>changes.push(value));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const request=(url,{method='GET',body,headers={}}={})=>fetch(origin+url,{method,headers:{...(method==='GET'?{}:{origin,'content-type':'application/json'}),...headers},...(method==='GET'?{}:{body:JSON.stringify(body??{})})});
 t.after(async()=>{queue.recoveryController?.abort(Error('Fixture cleanup'));try{await until(()=>!queue.recoveryTaskActive);}finally{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));await queue.recoverySave.catch(()=>{});await fs.rm(dataDir,{recursive:true,force:true});}});
 return {queue,origin,request,settings,ai,page,calls,changes,dataDir};
}

test('practice endpoint enforces same-origin JSON requests before starting any work',async t=>{
 const f=await fixture(t);for(const headers of [{origin:''},{origin:'https://attacker.example'},{origin:'null'}]){const response=await f.request('/api/navigation-ai/test',{method:'POST',headers});assert.equal(response.status,403);assert.match((await response.json()).error,/origin/i);}
 const wrongType=await f.request('/api/navigation-ai/test',{method:'POST',headers:{'content-type':'text/plain'}});assert.equal(wrongType.status,415);assert.deepEqual(f.calls,[]);assert.equal(f.queue.recoveryLog.state(),null);assert.equal(f.queue.runs.length,0);
});

test('practice requires saved configured enabled automatic recovery with friendly setup errors',async t=>{
 const f=await fixture(t);for(const disabled of ['enabled','automatic','configured']){f.settings[disabled]=false;const response=await f.request('/api/navigation-ai/test',{method:'POST'});assert.equal(response.status,400);assert.match((await response.json()).error,/Enable automatic Gemini recovery and configure a key first/);f.settings[disabled]=true;}
 assert.deepEqual(f.calls,[]);assert.equal(f.queue.recoveryTaskActive,false);assert.equal(f.queue.runs.length,0);
});

test('practice exposes actual live progress, locks concurrent writes, and leaves social history unchanged',async t=>{
 const gate=defer(),started=defer();let runnerCalls=0;
 const f=await fixture(t,async({page,ai,signal,reportRecovery})=>{runnerCalls++;assert.equal(page.fixture,true);assert(signal instanceof AbortSignal);assert(ai.state().automatic);await reportRecovery({phase:'calling',message:'Calling the fixture model.',model:'gemini-fixture'});started.resolve();await Promise.race([gate.promise,new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}))]);signal.throwIfAborted();await reportRecovery({phase:'proposed',message:'A bounded fix was suggested.',fix:'Discard the disposable practice selection.'});await reportRecovery({phase:'executing',message:'Trying the exact allowed control.',action:{type:'click',direction:'Discard'}});await reportRecovery({phase:'verifying',message:'Checking the clean practice editor.'});return {completed:true};});
 const before=await fs.readFile(path.join(f.dataDir,'runs.json'),'utf8');
 const response=await f.request('/api/navigation-ai/test',{method:'POST'});assert.equal(response.status,202);const body=await response.json();assert.match(body.id,/^[a-f0-9-]{36}$/);await started.promise;
 const status=await(await f.request('/api/status')).json();assert.equal(status.workerBusy,true);assert.equal(status.recovery.id,body.id);assert.equal(status.recovery.practice,true);assert.equal(status.recovery.phase,'calling');assert.equal(status.recovery.model,'gemini-fixture');assert.equal(status.runs.length,0);
 const eventController=new AbortController();const streamed=await fetch(f.origin+'/api/events',{signal:eventController.signal});const reader=streamed.body.getReader();const chunk=await reader.read();const eventText=new TextDecoder().decode(chunk.value);assert.match(streamed.headers.get('content-type'),/text\/event-stream/);const payload=JSON.parse(eventText.split('data: ')[1].split('\n\n')[0]);assert.equal(payload.recovery.id,body.id);assert.equal(payload.recovery.phase,'calling');assert.equal(payload.workerBusy,true);eventController.abort();
 for(const [url,method]of [['/api/navigation-ai/test','POST'],['/api/runs','POST'],['/api/logins','POST'],['/api/config','PUT'],['/api/navigation-ai','PUT'],['/api/android/screen','POST']]){const blocked=await f.request(url,{method});assert.equal(blocked.status,409,url);assert.match((await blocked.json()).error,/recovery test.*finish|stop recovery/i);}
 assert.equal(runnerCalls,1);assert.deepEqual(f.calls,['geminiPractice']);
 gate.resolve();await until(()=>!f.queue.recoveryTaskActive);
 const final=await(await f.request('/api/status')).json();assert.equal(final.workerBusy,false);assert.equal(final.recovery.status,'succeeded');assert.equal(final.recovery.phase,'succeeded');assert.equal(final.recovery.action,'click Discard');assert.match(final.recovery.message,/Nothing was published/);assert.equal(final.runs.length,0);
 assert.deepEqual(final.recovery.events.map(event=>event.phase),['detected','calling','proposed','executing','verifying','succeeded']);assert(f.changes.some(change=>change.recovery?.phase==='executing'));assert.equal(await fs.readFile(path.join(f.dataDir,'runs.json'),'utf8'),before);
 const bootstrap=await(await f.request('/api/bootstrap')).json();assert.equal(bootstrap.recovery.id,body.id);assert.equal(bootstrap.workerBusy,false);
});

test('practice stop aborts pending work, reports a clear pause, and permits no later action',async t=>{
 let context,actions=0;const waiting=defer();
 const f=await fixture(t,async value=>{context=value;await value.reportRecovery({phase:'calling',message:'Waiting for the mocked model.'});waiting.resolve();await new Promise(resolve=>value.signal.addEventListener('abort',resolve,{once:true}));value.signal.throwIfAborted();actions++;await value.reportRecovery({phase:'executing',message:'Must never execute'});return {completed:true};});
 assert.equal((await f.request('/api/navigation-ai/test/stop',{method:'POST'})).status,409);
 assert.equal((await f.request('/api/navigation-ai/test',{method:'POST'})).status,202);await waiting.promise;
 const stopped=await f.request('/api/navigation-ai/test/stop',{method:'POST'});assert.equal(stopped.status,200);await until(()=>!f.queue.recoveryTaskActive);
 assert.equal(context.signal.aborted,true);assert.equal(actions,0);assert.equal(f.queue.state().recovery.status,'paused');assert.match(f.queue.state().recovery.message,/stopped by you.*No further actions/i);assert.equal(f.queue.state().workerBusy,false);assert.equal(f.queue.runs.length,0);
 await assert.rejects(context.reportRecovery({phase:'executing',message:'Late action'}),/Stopped by operator/);assert.equal(f.queue.state().recovery.phase,'paused');assert.equal(f.queue.state().recovery.events.some(event=>event.phase==='executing'),false);
});

test('a busy or unavailable provider pauses visibly instead of claiming successful recovery',async t=>{
 const f=await fixture(t,async({reportRecovery})=>{await reportRecovery({phase:'waiting',message:'Waiting for the free-tier request window.'});await reportRecovery({phase:'paused',message:'Gemini is busy. The draft is preserved; continue manually or retry after cooldown.'});return {completed:false};});
 const response=await f.request('/api/navigation-ai/test',{method:'POST'});assert.equal(response.status,202);await until(()=>!f.queue.recoveryTaskActive);
 const state=(await(await f.request('/api/status')).json());assert.equal(state.recovery.status,'paused');assert.match(state.recovery.message,/busy.*preserved.*manually.*cooldown/);assert.equal(state.recovery.events.some(event=>event.phase==='succeeded'),false);assert.equal(state.workerBusy,false);assert.equal(state.runs.length,0);
});

test('practice errors are reported without API-key leaks and release the worker lock',async t=>{
 const secret='AIza'+'K'.repeat(31);
 const f=await fixture(t,async({reportRecovery})=>{await reportRecovery({phase:'calling',message:'Calling the fixture model.'});throw Error('Provider unavailable. api_key='+secret);});
 assert.equal((await f.request('/api/navigation-ai/test',{method:'POST'})).status,202);await until(()=>!f.queue.recoveryTaskActive);
 const state=await(await f.request('/api/status')).json();assert.equal(state.recovery.status,'failed');assert.match(state.recovery.message,/Provider unavailable/);assert(!JSON.stringify(state).includes(secret));assert.match(state.recovery.message,/private key/);assert.equal(state.workerBusy,false);assert.equal(state.runs.length,0);
});

test('existing social activity and manual login prevent practice before opening any browser page',async t=>{
 const f=await fixture(t);f.queue.runs.push({id:'active-fixture',status:'attention',items:[]});let response=await f.request('/api/navigation-ai/test',{method:'POST'});assert.equal(response.status,409);f.queue.runs.length=0;
 f.queue.login.running=true;response=await f.request('/api/navigation-ai/test',{method:'POST'});assert.equal(response.status,409);f.queue.login.running=false;
 f.queue.browser.manualProcess={fixture:true};response=await f.request('/api/navigation-ai/test',{method:'POST'});assert.equal(response.status,409);f.queue.browser.manualProcess=null;
 assert.deepEqual(f.calls,[]);assert.equal(f.queue.recoveryTaskActive,false);assert.equal(f.queue.recoveryLog.state(),null);
});


function failedWhatsAppTest(){
 return {id:'failed-whatsapp-test',mode:'TEST',status:'completed_with_errors',captions:{whatsapp:'Owned rehearsal caption'},media:[{id:'image-one',filename:'image-one.png'},{id:'image-two',filename:'image-two.png'}],mediaByPlatform:{whatsapp:['image-one']},items:[{id:'whatsapp',status:'failed',submitting:false,preparation:{...structuredClone(defaults.platforms.whatsapp),imageCount:1}}]};
}

test('WhatsApp repair rejects LIVE, submitted, successful, or mismatched channel drafts before browser or model access',async t=>{
 const f=await fixture(t);
 const mutations=[
  ['LIVE run',run=>{run.mode='LIVE';}],
  ['submitting item',run=>{run.items[0].submitting=true;}],
  ['posted item',run=>{run.items[0].status='posted';}],
  ['uncertain item',run=>{run.items[0].status='uncertain';}],
  ['different channel name',run=>{run.items[0].preparation.channelName='Other channel';}],
  ['different channel URL',run=>{run.items[0].preparation.channelUrl='https://whatsapp.com/channel/0029OtherChannel';}],
  ['missing channel proof',run=>{delete run.items[0].preparation;}],
  ['missing source image proof',run=>{run.items[0].preparation.imageCount=0;}],
  ['multiple source images',run=>{run.items[0].preparation.imageCount=2;}]
 ];
 for(const [label,mutate]of mutations){const run=failedWhatsAppTest();mutate(run);f.queue.runs=[run];const before=structuredClone(run);const response=await f.request('/api/navigation-ai/whatsapp/repair',{method:'POST',body:{runId:run.id}});assert.equal(response.status,400,label);assert.match((await response.json()).error,/failed, unsubmitted WhatsApp TEST with the same verified channel/,label);assert.deepEqual(f.queue.runs,[before],label);}
 f.queue.runs=[];const missing=await f.request('/api/navigation-ai/whatsapp/repair',{method:'POST',body:{runId:'missing'}});assert.equal(missing.status,400);assert.deepEqual(f.calls,[]);assert.equal(f.queue.recoveryTaskActive,false);assert.equal(f.queue.recoveryLog.state(),null);
});

test('WhatsApp repair requires exactly one available selected source image before browser or model access',async t=>{
 const f=await fixture(t);
 for(const selected of [[],['missing-image'],['image-one','image-two']]){const run=failedWhatsAppTest();run.mediaByPlatform.whatsapp=selected;f.queue.runs=[run];const before=structuredClone(run);const response=await f.request('/api/navigation-ai/whatsapp/repair',{method:'POST',body:{runId:run.id}});assert.equal(response.status,400,JSON.stringify(selected));assert.match((await response.json()).error,/original TEST image is not uniquely available/);assert.deepEqual(f.queue.runs,[before]);}
 assert.deepEqual(f.calls,[]);assert.equal(f.queue.recoveryTaskActive,false);assert.equal(f.queue.recoveryLog.state(),null);
});
