// Offline connection-controller and native-session fixtures. No ADB, real phone,
// Gemini network request, final Save or publication action is permitted here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverPhoneSession} from '../server/automation/phone-session-recovery.js';
import {AndroidSession,ANDROID_URL} from '../server/automation/android-native.js';
const wifi={type:'phone',transport:'wifi',serial:'192.168.1.6:43095',hardwareSerial:'OFFICE123'};
function provider({action={type:'click',controlId:'c1'},result,throwError,state={},onPlan}={}){
 const calls=[];
 return {calls,state:()=>({enabled:true,configured:true,automatic:true,...state}),async plan(input){calls.push(input);await input.onEvent?.({phase:'calling',model:'gemini-offline-fixture',message:'Calling the fixture provider.',source:'provider'});if(onPlan)await onPlan(input);if(throwError)throw throwError;if(result===null)return null;const plan={fix:'Reconnect only the selected phone and verify its identity.',action,model:'gemini-offline-fixture'};await input.onEvent?.({phase:'proposed',...plan,source:'provider'});return plan;}};
}
function context(options={}){
 const events=[],steps=[];
 return {events,steps,ctx:{canRecoverConnection:()=>true,canRecoverNavigation:()=>true,reportRecovery:async event=>events.push(event),step:async message=>steps.push(message),...options}};
}

test('phone recovery shows actual provider phases, its fix, guarded action and result',async()=>{
 const ai=provider(),f=context({navigationAI:ai});let actions=0;
 assert.equal(await recoverPhoneSession({ctx:f.ctx,reconnect:async()=>{actions++;return true;},kind:'read'}),true);
 assert.equal(actions,1);assert.equal(ai.calls.length,1);
 assert.deepEqual(ai.calls[0].controls,[{id:'c1',label:'Reconnect selected phone',role:'button',enabled:true,scrollable:false}]);assert.deepEqual(ai.calls[0].capabilities,{reconnectSelectedPhone:true});assert.equal(ai.calls[0].platform,'instagram_android');assert.equal(ai.calls[0].stage,'reconnect_selected_phone');
 assert.deepEqual(f.events.map(event=>event.phase),['detected','calling','proposed','executing','verifying','succeeded']);assert.equal(f.events.find(event=>event.phase==='executing').model,'gemini-offline-fixture');assert(f.events.at(-1).fix.includes('selected phone'));
 const sent=JSON.stringify({...ai.calls[0],signal:undefined});for(const value of [wifi.serial,wifi.hardwareSerial,'caption','password','screenshot','adb.exe'])assert(!sent.includes(value));
});

for(const state of [{enabled:false},{automatic:false},{configured:false}])test('disabled or unconfigured Gemini uses a visible local same-phone fallback: '+JSON.stringify(state),async()=>{
 const ai=provider({state}),f=context({navigationAI:ai});let actions=0;
 assert.equal(await recoverPhoneSession({ctx:f.ctx,reconnect:async()=>{actions++;return true;}}),true);assert.equal(ai.calls.length,0);assert.equal(actions,1);assert(!f.events.some(event=>event.phase==='calling'));assert(f.events.some(event=>event.phase==='proposed'&&event.message.includes('built-in')));
});

for(const failure of ['quota','busy','exception'])test('unavailable Gemini '+failure+' falls back once without exposing a provider failure',async()=>{
 const ai=provider(failure==='exception'?{throwError:Error('PRIVATE KEY model busy')}:{result:null,state:{status:failure==='quota'?'daily_limit':'busy',today:{remaining:failure==='quota'?0:8}}}),f=context({navigationAI:ai});let actions=0;
 assert.equal(await recoverPhoneSession({ctx:f.ctx,reconnect:async()=>{actions++;return true;}}),true);assert.equal(ai.calls.length,1);assert.equal(actions,1);assert(f.events.some(event=>event.phase==='proposed'&&event.message.includes('unavailable')));assert(!JSON.stringify(f.events).includes('PRIVATE KEY'));
});

test('a model stop plan asks for manual connection help before the user retries the same selected phone',async()=>{
 const ai=provider({action:{type:'stop'}});let actions=0,help=0;const f=context({navigationAI:ai,intervene:async(details,inspect)=>{help++;assert.equal(details.kind,'connection');assert.equal(actions,0);return inspect();}});
 assert.equal(await recoverPhoneSession({ctx:f.ctx,reconnect:async()=>{actions++;return true;}}),true);assert.equal(help,1);assert.equal(actions,1);assert(f.events.some(event=>event.phase==='paused'));
});

test('a disconnected manual connection check stays retryable while navigation is paused waiting for input',async()=>{
 let runStatus='running',actions=0,help=0;const f=context({canRecoverConnection:()=>['running','waiting_for_input'].includes(runStatus),canRecoverNavigation:()=>runStatus==='running',intervene:async(details,inspect)=>{help++;assert.equal(details.kind,'connection');runStatus='waiting_for_input';assert.equal(f.ctx.canRecoverNavigation(),false);assert.equal(await inspect(),null);const result=await inspect();runStatus='running';return result;}});
 assert.equal(await recoverPhoneSession({ctx:f.ctx,reconnect:async()=>{if(++actions<3)throw Error('The phone is still offline');return true;}}),true);assert.equal(help,1);assert.equal(actions,3);assert.equal(f.events.at(-1).phase,'succeeded');assert(f.events.some(event=>event.message?.includes('still unavailable')));
});

test('a failed provider trace write stops before connection changes or a manual fallback',async()=>{
 const original=Error('Recovery trace could not persist'),ai=provider();let actions=0;const f=context({navigationAI:ai,reportRecovery:async event=>{if(event.phase==='calling')throw original;},intervene:async()=>assert.fail('Trace failures must not become user device failures')});
 await assert.rejects(recoverPhoneSession({ctx:f.ctx,reconnect:async()=>{actions++;return true;}}),error=>error===original);assert.equal(actions,0);
});

test('a failed executing trace write stops before connection changes or a manual fallback',async()=>{
 const original=Error('Recovery trace could not persist');let actions=0;const f=context({reportRecovery:async event=>{if(event.phase==='executing')throw original;},intervene:async()=>assert.fail('Trace failures must not become user device failures')});
 await assert.rejects(recoverPhoneSession({ctx:f.ctx,reconnect:async()=>{actions++;return true;}}),error=>error===original);assert.equal(actions,0);
});

test('cancellation during planning prevents the reconnect and manual handoff',async()=>{
 const controller=new AbortController(),ai=provider({onPlan:async()=>controller.abort(Error('Stop requested'))}),f=context({navigationAI:ai,intervene:async()=>assert.fail()});let actions=0;
 await assert.rejects(recoverPhoneSession({ctx:f.ctx,signal:controller.signal,reconnect:async()=>{actions++;return true;}}),/Stop requested/);assert.equal(actions,0);
});

test('a submission gate forbids provider requests, reconnection and screen actions',async()=>{
 const ai=provider(),f=context({navigationAI:ai,canRecoverConnection:()=>false,intervene:async()=>assert.fail()});
 await assert.rejects(recoverPhoneSession({ctx:f.ctx,reconnect:async()=>assert.fail()}),/submission may have begun/);assert.equal(ai.calls.length,0);assert.equal(f.events.length,0);
});

function response(value,ok=true){return {ok,json:async()=>({value})};}
function sessionFixture(t,{failedEndpoint='/source',method='GET',connected=true,onRecovery,gate=true}={}){
 const s=Object.create(AndroidSession.prototype),calls=[],commands=[];s.device={...wifi};s.serial=wifi.serial;s.id='old-session';s.signal=new AbortController().signal;s.uploadAlbum={folder:'retained-owned-album'};
 let recovered=0;
 s.hostAdb=async(args,options)=>{commands.push(args);assert(options?.signal||args.at(-1)==='get-state'||args.at(-1)==='ro.serialno');if(args.at(-1)==='get-state')return connected?'device':'offline';if(args.at(-1)==='ro.serialno')return wifi.hardwareSerial;if(args[0]==='connect'||args[0]==='disconnect')return 'connected';if(args[0]==='mdns')return '';assert.fail('Unexpected host ADB operation '+args);};
 s.openOnce=async options=>{assert.deepEqual(options,{start:false});s.id='new-session';return s;};
 s.onConnectionRecovery=async details=>{recovered++;if(onRecovery)return onRecovery(details,s);if(!gate)return false;return details.reconnect();};
 t.mock.method(globalThis,'fetch',async(url,options={})=>{calls.push({url,method:options.method||'GET',body:options.body});if(url===ANDROID_URL+'/session/old-session'&&options.method==='DELETE')return response(null);if(url===ANDROID_URL+'/session/old-session'+failedEndpoint&&options.method===method)return response({error:'unknown error',message:'adb.exe: device offline'},false);if(url===ANDROID_URL+'/session/new-session'+failedEndpoint&&options.method===method)return response(failedEndpoint==='/source'?'<android.widget.TextView class="android.widget.TextView" resource-id="com.instagram.android:id/story_share_controls_action_bar" displayed="true" />':'fixture value');assert.fail('Unexpected driver request '+url);});
 return {s,calls,commands,recovered:()=>recovered};
}

test('an explicit offline source read rebuilds the same inspection object and retries only the read once',async t=>{
 const f=sessionFixture(t);const nodes=await f.s.screen();assert.equal(nodes[0]['resource-id'],'com.instagram.android:id/story_share_controls_action_bar');assert.equal(f.s.id,'new-session');assert.equal(f.s.connectionGeneration,1);assert.equal(f.s.uploadAlbum.folder,'retained-owned-album');assert.equal(f.recovered(),1);
 assert.deepEqual(f.calls.map(call=>[call.url,call.method]),[[ANDROID_URL+'/session/old-session/source','GET'],[ANDROID_URL+'/session/old-session','DELETE'],[ANDROID_URL+'/session/new-session/source','GET']]);assert.deepEqual(f.commands,[['-s',wifi.serial,'get-state'],['-s',wifi.serial,'shell','getprop','ro.serialno']]);
});

test('an offline mutating click is never replayed after reconnect and remains explicitly uncertain',async t=>{
 const f=sessionFixture(t,{failedEndpoint:'/element/reviewed-control/click',method:'POST'});
 await assert.rejects(f.s.request('/element/reviewed-control/click','POST',{}),error=>error.code==='ANDROID_ACTION_UNCERTAIN');assert.equal(f.recovered(),1);assert.equal(f.s.id,'new-session');assert.equal(f.calls.filter(call=>call.url.endsWith('/click')).length,1);assert(!f.calls.some(call=>call.url.includes('new-session/element')));
});

test('an offline final action with a closed submission gate never calls AI or reconnects',async t=>{
 const ai=provider(),f=context({navigationAI:ai,canRecoverConnection:()=>false});const fixture=sessionFixture(t,{failedEndpoint:'/element/story-share/click',method:'POST',onRecovery:details=>recoverPhoneSession({ctx:f.ctx,...details})});
 await assert.rejects(fixture.s.request('/element/story-share/click','POST',{}),/submission may have begun/);assert.equal(ai.calls.length,0);assert.equal(fixture.commands.length,0);assert.equal(fixture.calls.length,1);assert.equal(fixture.s.id,'old-session');
});

test('DELETE-session offline cleanup never calls recovery and still clears its local session id',async t=>{
 const s=Object.create(AndroidSession.prototype);s.id='old-session';s.device=wifi;s.signal=new AbortController().signal;s.onConnectionRecovery=async()=>assert.fail('Driver teardown must never ask AI to recover');s.hostAdb=async()=>assert.fail('Driver teardown must never reconnect');
 t.mock.method(globalThis,'fetch',async(_url,options)=>{assert.equal(options.method,'DELETE');return response({error:'unknown error',message:'adb.exe: device offline'},false);});
 await assert.rejects(s.close(),/device offline/);assert.equal(s.id,null);
});

test('a reused endpoint with a changed hardware identity is rejected before AI or any screen action',async()=>{
 const s=Object.create(AndroidSession.prototype);s.device=wifi;s.serial=wifi.serial;s.signal=new AbortController().signal;s.onConnectionRecovery=async()=>assert.fail('Identity mismatch is not a reconnect plan');s.hostAdb=async args=>args.at(-1)==='get-state'?'device':'SOMEONE_ELSE';
 await assert.rejects(s.ensurePhoneConnection(),/identity changed/);
});

test('a lost generic driver response is preserved without treating an unknown action result as offline',async t=>{
 const s=Object.create(AndroidSession.prototype);s.id='old-session';s.device=wifi;s.signal=new AbortController().signal;s.onConnectionRecovery=async()=>assert.fail('An unknown transport outcome must not infer device offline');t.mock.method(globalThis,'fetch',async()=>{throw Error('fetch failed');});
 await assert.rejects(s.request('/element/control/click','POST',{}),/fetch failed/);
});

test('the real NavigationAI provider class emits calling only for its mocked fetch and labels a repeated cached fix honestly',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),{NavigationAI}=await import('../server/navigation-ai.js');
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-phone-recovery-ai-'));
 t.after(async()=>{const target=path.resolve(dataDir),temp=path.resolve(os.tmpdir());assert.equal(path.dirname(target),temp);assert(path.basename(target).startsWith('studio-phone-recovery-ai-'));await fs.rm(target,{recursive:true,force:true});});
 const requests=[],ai=new NavigationAI({dataDir,env:{},fetchImpl:async(url,options)=>{requests.push({url,body:options.body});return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({explanation:'Reconnect the same paired phone and verify its identity.',action:{type:'click',controlId:'c1'}})}]}}]}),{status:200});}});
 await ai.init();await ai.configure({enabled:true,automatic:true,apiKey:'fixture-phone-api-key'});
 const f=context({navigationAI:ai});let actions=0;const recover=()=>recoverPhoneSession({ctx:f.ctx,reconnect:async()=>{actions++;return true;}});
 assert.equal(await recover(),true);assert.deepEqual(f.events.map(event=>event.phase),['detected','calling','proposed','executing','verifying','succeeded']);assert.equal(f.events.find(event=>event.phase==='proposed').source,'provider');assert.equal(requests.length,1);assert(!requests[0].body.includes('fixture-phone-api-key'));assert(!requests[0].body.includes(wifi.serial));assert(!requests[0].body.includes(wifi.hardwareSerial));
 f.events.length=0;assert.equal(await recover(),true);assert.equal(requests.length,1);assert.equal(actions,2);assert(!f.events.some(event=>event.phase==='calling'));assert.equal(f.events.find(event=>event.phase==='proposed').source,'cache');
});

test('a known startup offline error rebuilds the same session once before continuing account inspection',async t=>{
 const s=Object.create(AndroidSession.prototype);s.device={...wifi};s.serial=wifi.serial;s.signal=new AbortController().signal;let opens=0,recoveries=0;
 s.hostAdb=async args=>{if(args.at(-1)==='get-state')return 'device';if(args.at(-1)==='ro.serialno')return wifi.hardwareSerial;assert.fail('Unexpected ADB operation');};
 s.openOnce=async()=>{if(++opens===1)throw Error('Android: adb.exe: device offline');s.id='rebuilt-startup';return s;};s.onConnectionRecovery=async details=>{assert.equal(details.kind,'open');recoveries++;return details.reconnect();};t.mock.method(globalThis,'fetch',async()=>assert.fail('No old driver session exists to delete'));
 assert.equal(await s.open({start:true}),s);assert.equal(s.id,'rebuilt-startup');assert.equal(opens,2);assert.equal(recoveries,1);assert.equal(s.connectionGeneration,1);
});

test('a known offline ADB read is retried once after rebuilding the same selected phone session',async t=>{
 const s=Object.create(AndroidSession.prototype);s.device={...wifi};s.serial=wifi.serial;s.id='old-session';s.signal=new AbortController().signal;let reads=0,recoveries=0;
 s.hostAdb=async args=>{if(args.at(-1)==='ro.kernel.qemu'){if(++reads===1)throw Error('adb.exe: device offline');return '0';}if(args.at(-1)==='get-state')return 'device';if(args.at(-1)==='ro.serialno')return wifi.hardwareSerial;assert.fail('Unexpected ADB operation');};
 s.openOnce=async()=>{s.id='new-session';return s;};s.onConnectionRecovery=async details=>{assert.equal(details.kind,'read');recoveries++;return details.reconnect();};t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,ANDROID_URL+'/session/old-session');assert.equal(options.method,'DELETE');return response(null);});
 assert.equal(await s.adb(['shell','getprop','ro.kernel.qemu']),'0');assert.equal(reads,2);assert.equal(recoveries,1);
});

test('an offline ADB gesture never repeats after a same-phone reconnection',async t=>{
 const s=Object.create(AndroidSession.prototype);s.device={...wifi};s.serial=wifi.serial;s.id='old-session';s.signal=new AbortController().signal;let gestures=0,recoveries=0;
 s.hostAdb=async args=>{if(args.includes('input')){gestures++;throw Error('adb.exe: device offline');}if(args.at(-1)==='get-state')return 'device';if(args.at(-1)==='ro.serialno')return wifi.hardwareSerial;assert.fail('Unexpected ADB operation');};
 s.openOnce=async()=>{s.id='new-session';return s;};s.onConnectionRecovery=async details=>{assert.equal(details.kind,'action');recoveries++;return details.reconnect();};t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,ANDROID_URL+'/session/old-session');assert.equal(options.method,'DELETE');return response(null);});
 await assert.rejects(s.adb(['shell','input','swipe','100','400','100','200','400']),error=>error.code==='ANDROID_ACTION_UNCERTAIN');assert.equal(gestures,1);assert.equal(recoveries,1);
});

test('an until screen check excludes connection-pause time before accepting its recovered ready state',async t=>{
 const s=Object.create(AndroidSession.prototype),controller=new AbortController();
 let clock=1_000_000,reads=0,inspections=0;
 t.mock.method(Date,'now',()=>clock);
 s.signal=controller.signal;s.connectionPauseMs=0;
 s.adb=async()=>assert.fail('A resumed wait must not issue a device action');
 s.request=async()=>assert.fail('This fixture resumes only the already-pending screen inspection');
 s.screen=async()=>{
  reads++;assert.equal(reads,1,'A recovered ready screen should complete the pending wait');
  // Gemini, connection repair and/or manual reconnect consumed a full minute,
  // exceeding the old 45-second UI budget without consuming UI loading time.
  clock+=60_000;s.connectionPauseMs+=60_000;
  return [{displayed:'true','resource-id':'fixture-ready',ready:true}];
 };
 const value=await s.until(nodes=>{inspections++;return nodes[0]?.ready?'recovered-proof':false;},'A ready recovered screen must not time out',45_000);
 assert.equal(value,'recovered-proof');assert.equal(reads,1);assert.equal(inspections,1);
 assert.equal(clock,1_060_000);assert.equal(s.connectionPauseMs,60_000);
});
