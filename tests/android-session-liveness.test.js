// Copyright (c) 2026 Mrinal. Inspection-session liveness fixtures; no phone or publishing actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AndroidSession,ANDROID_URL} from '../server/automation/android-native.js';
import {recoverPhoneSession} from '../server/automation/phone-session-recovery.js';
const wifi={type:'phone',transport:'wifi',serial:'192.168.1.6:43095',hardwareSerial:'OFFICE123'};
const xml='<hierarchy><node class="android.widget.TextView" package="com.instagram.android" resource-id="com.instagram.android:id/music_browser_container" displayed="true" text="Music" /></hierarchy>';
const response=(value,ok=true)=>({ok,status:ok?200:404,json:async()=>({value})});
function timerFixture(t){
 const timers=[],cleared=[];t.mock.method(globalThis,'setInterval',(fn,ms)=>{const timer={fn,ms,unrefs:0,unref(){this.unrefs++;return this;}};timers.push(timer);return timer;});t.mock.method(globalThis,'clearInterval',timer=>cleared.push(timer));
 const controller=new AbortController(),s=Object.create(AndroidSession.prototype);s.id='inspection-old';s.serial=wifi.serial;s.device={...wifi};s.signal=controller.signal;
 s.request=async(endpoint,method='GET')=>{if(endpoint==='/source'&&method==='GET')return xml;if(endpoint===''&&method==='DELETE')return null;assert.fail('Unexpected screen action '+method+' '+endpoint);};
 t.after(()=>s.stopInspectionKeepAlive?.());
 return {s,timers,cleared,controller};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('screen inspection arms one unref heartbeat, and ticks only read GET timeouts',async t=>{
 const f=timerFixture(t),calls=[],timeouts=[],originalTimeout=AbortSignal.timeout;t.mock.method(AbortSignal,'timeout',ms=>{timeouts.push(ms);return originalTimeout(ms);});t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return response({implicit:0});});
 await f.s.screen();await f.s.screen();assert.equal(f.timers.length,1);assert.equal(f.timers[0].ms,60000);assert.equal(f.timers[0].unrefs,1);
 await f.timers[0].fn();await flush();assert.equal(calls.length,1);assert.equal(calls[0].url,ANDROID_URL+'/session/inspection-old/timeouts');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);assert(calls[0].options.signal instanceof AbortSignal);assert(timeouts.includes(5000));
});

test('heartbeat follows the current inspection ID after a read-only rebuild',async t=>{
 const f=timerFixture(t),calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push([url,options.method]);return response({implicit:0});});
 await f.s.screen();f.s.id='inspection-new';await f.timers[0].fn();await flush();assert.deepEqual(calls,[[ANDROID_URL+'/session/inspection-new/timeouts','GET']]);assert.equal(f.timers.length,1);
});

test('closing inspection clears its heartbeat and no queued tick can touch a closed session',async t=>{
 const f=timerFixture(t);t.mock.method(globalThis,'fetch',async()=>assert.fail('No heartbeat may read after closing'));
 await f.s.screen();await f.s.close();assert.equal(f.s.id,null);assert.equal(f.cleared.length,1);await f.timers[0].fn();await flush();assert.equal(f.cleared.length,1);
});

test('aborted or absent inspection sessions stop their next heartbeat without any UI or reconnect',async t=>{
 for(const stop of ['abort','missing'])await t.test(stop,async t=>{const f=timerFixture(t);f.s.onConnectionRecovery=async()=>assert.fail('Heartbeat cannot recover a device');t.mock.method(globalThis,'fetch',async()=>assert.fail('Stopped heartbeat cannot make requests'));await f.s.screen();if(stop==='abort')f.controller.abort(Error('Stopped by operator'));else f.s.id=null;await f.timers[0].fn();await flush();assert.equal(f.cleared.length,1);});
});

test('heartbeat failures are silent read-only diagnostics and never trigger navigation or reconnect',async t=>{
 const f=timerFixture(t);let calls=0;f.s.onConnectionRecovery=async()=>assert.fail('Heartbeat must not reconnect');f.s.onUnresponsive=async()=>assert.fail('Heartbeat must not manipulate a paused handoff');t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;assert.equal(options.method,'GET');assert(url.endsWith('/timeouts'));throw Error('Inspection server unavailable');});
 await f.s.screen();await f.timers[0].fn();await flush();assert.equal(calls,1);assert.equal(f.s.id,'inspection-old');assert.equal(f.timers.length,1);
});

test('an absent session never arms a new heartbeat',t=>{const f=timerFixture(t);f.s.id=null;f.s.armInspectionKeepAlive();assert.equal(f.timers.length,0);});

function expiryFixture(t,{endpoint='/source',method='GET',gate=true,alwaysExpired=false}={}){
 const s=Object.create(AndroidSession.prototype),calls=[],recoveries=[];s.id='inspection-old';s.serial=wifi.serial;s.device={...wifi};s.signal=new AbortController().signal;
 s.rebuildPhoneSession=async()=>{recoveries.push('rebuild');s.id='inspection-new';return true;};
 s.onConnectionRecovery=async details=>{recoveries.push(details);if(!gate)return recoverPhoneSession({ctx:{canRecoverConnection:()=>false,navigationAI:{state:()=>({enabled:true,configured:true,automatic:true}),plan:async()=>assert.fail('Submission must not call Gemini')}},signal:s.signal,...details});return details.reconnect();};
 t.mock.method(globalThis,'fetch',async(url,options={})=>{calls.push({url,method:options.method||'GET',body:options.body});if(url===ANDROID_URL+'/session/inspection-old'+endpoint||alwaysExpired)return response({error:'invalid session id',message:'The inspection session does not exist or is not active'},false);if(url===ANDROID_URL+'/session/inspection-new'+endpoint)return response(xml);assert.fail('Unexpected session operation '+url);});
 return {s,calls,recoveries};
}

test('a structured expired source session rebuilds once and retries only its pending read',async t=>{
 const f=expiryFixture(t);assert.equal(await f.s.request('/source'),xml);assert.equal(f.s.id,'inspection-new');assert.deepEqual(f.calls.map(c=>[c.url,c.method]),[[ANDROID_URL+'/session/inspection-old/source','GET'],[ANDROID_URL+'/session/inspection-new/source','GET']]);assert.equal(f.recoveries.filter(r=>r==='rebuild').length,1);const recovery=f.recoveries.find(r=>r!=='rebuild');assert.equal(recovery.kind,'read');assert.match(recovery.problem||'',/inspection|session/i);assert(!/Wi-Fi.*offline|phone.*disconnect/i.test(recovery.problem||''));
});

test('invalid-session mutations never ask for recovery or replay a potentially completed action',async t=>{
 for(const [endpoint,method,body]of [['/element/share-control/click','POST',{}],['/actions','POST',{actions:[]}],['/back','POST',{}]])await t.test(endpoint,async t=>{const f=expiryFixture(t,{endpoint,method});f.s.onConnectionRecovery=async()=>assert.fail('An unknown action cannot recover and replay');await assert.rejects(f.s.request(endpoint,method,body),/inspection session does not exist/);assert.equal(f.calls.length,1);assert.equal(f.s.id,'inspection-old');assert.equal(f.recoveries.length,0);});
});

test('the submission gate blocks even expired read-session recovery before any rebuild or model call',async t=>{
 const f=expiryFixture(t,{gate:false});await assert.rejects(f.s.request('/source'),/submission may have begun/);assert.equal(f.calls.length,1);assert.equal(f.s.id,'inspection-old');assert(!f.recoveries.includes('rebuild'));
});

test('expired DELETE cleanup never reconnects and still releases the local inspection ID',async t=>{
 const f=expiryFixture(t,{endpoint:'',method:'DELETE'});f.s.onConnectionRecovery=async()=>assert.fail('Cleanup must not recover');await assert.rejects(f.s.close(),/inspection session does not exist/);assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'DELETE');assert.equal(f.s.id,null);assert.equal(f.recoveries.length,0);
});


test('a persistently expired read session is rebuilt only once before stopping for manual recovery',async t=>{
 const f=expiryFixture(t,{alwaysExpired:true});await assert.rejects(f.s.request('/source'),/inspection session ended again/);assert.equal(f.calls.length,2);assert.equal(f.recoveries.filter(r=>r==='rebuild').length,1);assert.deepEqual(f.calls.map(c=>c.method),['GET','GET']);
});
// A timer may fire while an explicit read is rebuilding the same inspection
// object. The returned screen must restore liveness for the new session ID.
test('a recovered source read rearms keepalive after the old timer stops during a temporary null ID',async t=>{
 const f=timerFixture(t),calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push([url,options.method]);return response({implicit:0});});
 f.s.request=async(endpoint,method='GET')=>{
  assert.equal(endpoint,'/source');assert.equal(method,'GET');assert.equal(f.timers.length,1);
  f.s.id=null;await f.timers[0].fn();assert.deepEqual(calls,[]);assert.equal(f.cleared.length,1);
  f.s.id='inspection-rebuilt';return xml;
 };
 const nodes=await f.s.screen();assert.equal(nodes.length,1);assert.equal(f.timers.length,2);assert.equal(f.s.keepAliveTimer,f.timers[1]);assert.equal(f.timers[1].unrefs,1);
 await f.timers[1].fn();await flush();assert.deepEqual(calls,[[ANDROID_URL+'/session/inspection-rebuilt/timeouts','GET']]);assert.equal(f.cleared.length,1);
});
