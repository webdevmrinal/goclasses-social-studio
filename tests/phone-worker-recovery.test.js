// Copyright (c) 2026 Mrinal. Mocked phone lifecycle only; no Android or publish calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {InstagramAndroidWorker} from '../server/automation/instagram-android.js';
const postUrl='https://www.instagram.com/p/CONFIRMED456/';
const config={androidDevice:{type:'phone',serial:'192.168.1.5:40000',transport:'wifi',hardwareSerial:'OFFICE123'},platforms:{instagram:{handle:'ours'}}};
const context=(extra={})=>({runId:'reviewed-run',config,signal:new AbortController().signal,step:async()=>{},canRecoverNavigation:()=>true,canRecoverConnection:()=>true,...extra});
function fixture(){
 const calls=[],s={connectionGeneration:1,open:async()=>{calls.push('open');assert.equal(typeof s.onConnectionRecovery,'function');},account:async handle=>{calls.push('account:'+handle);},close:async()=>{calls.push('close');},ensurePhoneConnection:async()=>{calls.push('ensure');}};
 const worker=new InstagramAndroidWorker({dataDir:'unused-phone-worker-fixture',sessionFactory:()=>s});return {worker,s,calls};
}
test('phone recovery is attached before driver open and receives the current task events',async()=>{
 const f=fixture(),events=[],ctx=context({reportRecovery:async event=>events.push(event.phase)});let reconnected=0;
 f.s.open=async()=>{assert.equal(typeof f.s.onConnectionRecovery,'function');await f.s.onConnectionRecovery({kind:'open',reconnect:async()=>{reconnected++;return true;}});};
 await f.worker.open(config,ctx.signal,ctx.step,ctx);assert.equal(reconnected,1);assert.deepEqual(events,['detected','proposed','executing','verifying','succeeded']);assert.equal(f.s.signal,ctx.signal);await f.worker.close();
});
test('preflight refreshes the connection gate before checking the held phone and account',async()=>{
 const f=fixture(),oldEvents=[],newEvents=[],old=context({canRecoverConnection:()=>false,reportRecovery:async event=>oldEvents.push(event)}),current=context({canRecoverNavigation:()=>false,reportRecovery:async event=>newEvents.push(event.phase)});
 await f.worker.checkAccount(config,{runId:old.runId,signal:old.signal,connectionContext:old});
 f.s.ensurePhoneConnection=async()=>{f.calls.push('ensure');await f.s.onConnectionRecovery({kind:'read',reconnect:async()=>true});};
 assert.equal(await f.worker.openForRun(current),f.s);assert.equal(f.s.signal,current.signal);assert.equal(oldEvents.length,0);assert.equal(newEvents.at(-1),'succeeded');assert.deepEqual(f.calls,['open','account:ours','ensure','account:ours']);await f.worker.close();
});
test('a music-to-Story handoff refreshes context and checks the phone without navigating account',async()=>{
 const f=fixture(),oldEvents=[],newEvents=[],music=context({canRecoverConnection:()=>false,reportRecovery:async event=>oldEvents.push(event)}),story=context({canRecoverNavigation:()=>false,reportRecovery:async event=>newEvents.push(event.phase)});
 await f.worker.open(config,music.signal,music.step,music);assert(f.worker.retainForStory({...music,continueInstagramStory:true},'posted',{postUrl},true));
 f.s.ensurePhoneConnection=async()=>{f.calls.push('ensure');await f.s.onConnectionRecovery({kind:'read',reconnect:async()=>true});};
 assert.equal(await f.worker.openStory(story,postUrl),f.s);assert.equal(f.s.signal,story.signal);assert.equal(oldEvents.length,0);assert.equal(newEvents.at(-1),'succeeded');assert.deepEqual(f.calls,['open','account:ours','ensure']);await f.worker.close();
});
for(const rebuildWhen of ['ensure','between-items'])test('Story revalidates only its exact confirmed post after a phone rebuild '+rebuildWhen,async()=>{
 const f=fixture(),verified=[],prepared=[],ctx=context({id:'instagramStory',mode:'LIVE',instagram:{music:{enabled:false},story:{sourcePostUrl:postUrl,linkEnabled:false}},recordPreparation:async value=>prepared.push(value),step:async message=>{if(message==='Opening the exact feed post as a Story...')throw Error('Fixture stopped before any Story mutation');}});
 await f.worker.open(config,ctx.signal,async()=>{},ctx);f.worker.retainForStory({...ctx,continueInstagramStory:true},'posted',{postUrl},true);
 if(rebuildWhen==='between-items')f.s.connectionGeneration++;
 f.s.ensurePhoneConnection=async()=>{f.calls.push('ensure');if(rebuildWhen==='ensure')f.s.connectionGeneration++;};
 f.worker.verifyPost=async(s,url,handle)=>{assert.equal(s,f.s);verified.push({url,handle});};
 await assert.rejects(f.worker.run(ctx),/Fixture stopped/);assert.deepEqual(verified,[{url:postUrl,handle:'ours'}]);assert.equal(prepared[0].postUrl,postUrl);assert.deepEqual(f.calls,['open','account:ours','ensure','close']);
});
test('a failed handoff reconnect releases its session without beginning Story or reopening feed/music',async()=>{
 const f=fixture(),ctx=context();await f.worker.open(config,ctx.signal,ctx.step,ctx);f.worker.retainForStory({...ctx,continueInstagramStory:true},'posted',{postUrl},true);
 f.s.ensurePhoneConnection=async()=>{throw Error('Selected phone remains offline');};await assert.rejects(f.worker.openStory(ctx,postUrl),/remains offline/);assert.equal(f.worker.s,null);assert.equal(f.worker.busy,false);assert.deepEqual(f.calls,['open','account:ours','close']);
});
test('an ineligible submission context blocks reconnection before opening or account navigation',async()=>{
 const f=fixture(),ctx=context({canRecoverConnection:()=>false});let reconnects=0;
 f.s.open=async()=>f.s.onConnectionRecovery({kind:'open',reconnect:async()=>{reconnects++;return true;}});
 await assert.rejects(f.worker.open(config,ctx.signal,ctx.step,ctx),/submission may have begun/);assert.equal(reconnects,0);assert.deepEqual(f.calls,['close']);assert.equal(f.worker.busy,false);
});
