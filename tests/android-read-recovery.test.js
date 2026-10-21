// Copyright (c) 2026 Mrinal. Offline Appium fixtures; never opens Android or publishes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AndroidSession,ANDROID_URL,nativeId,connectAndroidDriver} from '../server/automation/android-native.js';
import {InterventionError} from '../server/automation/utils.js';

const rootTimeout='Timed out after 10514ms waiting for the root AccessibilityNodeInfo in the active window. Make sure the active window is not blocking accessibility.';
const element={'element-6066-11e4-a52e-4f735466cecf':'control-1'};
const ready='<hierarchy><node class="android.widget.TextView" package="com.instagram.android" resource-id="com.instagram.android:id/music_browser_container" displayed="true" text="Music"/></hierarchy>';
const reply=(value,ok=true)=>({ok,status:ok?200:500,json:async()=>({value})});
const failed=(message=rootTimeout)=>reply({error:'unknown error',message},false);
function fixture(t,respond){
  const s=Object.create(AndroidSession.prototype),calls=[],progress=[];s.id='offline-fixture';
  s.onUnresponsive=async message=>progress.push(message);
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert(url.startsWith(ANDROID_URL+'/session/offline-fixture'));
    const endpoint=url.slice((ANDROID_URL+'/session/offline-fixture').length);
    const call={endpoint,method:options.method,body:options.body?JSON.parse(options.body):undefined,signal:options.signal};calls.push(call);
    return respond(call,calls.length);
  });
  return {s,calls,progress};
}

test('a transient root timeout rechecks source only and returns its recovered screen',async t=>{
  const {s,calls,progress}=fixture(t,(_,count)=>count===1?failed():reply(ready));
  const nodes=await s.screen();assert.equal(nodes[0]['resource-id'],nativeId('music_browser_container'));
  assert.deepEqual(calls.map(({endpoint,method})=>[endpoint,method]),[['/source','GET'],['/source','GET']]);
  assert.equal(progress.length,1);assert.match(progress[0],/Rechecking the screen only/);assert.match(progress[0],/draft is preserved/);
});

test('element matching and attribute reads recover without replaying a click',async t=>{
  const attempts=new Map(),{s,calls,progress}=fixture(t,({endpoint})=>{
    const count=(attempts.get(endpoint)||0)+1;attempts.set(endpoint,count);
    if(count===1&&endpoint!=='/element/control-1/click')return failed();
    if(endpoint==='/elements')return reply([element]);
    if(endpoint.endsWith('/click'))return reply(null);
    return reply('Music');
  });
  await s.click('id',nativeId('music_entry_point'));
  assert.equal(calls.filter(c=>c.endpoint==='/elements').length,2);
  for(const attr of ['text','content-desc'])assert.equal(calls.filter(c=>c.endpoint.endsWith('/attribute/'+attr)).length,2);
  assert.equal(calls.filter(c=>c.endpoint.endsWith('/click')).length,1);assert.equal(progress.length,3);
  assert(calls.every(c=>c.endpoint==='/elements'||c.endpoint.startsWith('/element/control-1/')));
});

test('persistent inaccessible roots stop after three reads with a safe intervention',async t=>{
  const secret='Private caption and password 123456', {s,calls,progress}=fixture(t,()=>failed(rootTimeout+' '+secret));
  await assert.rejects(s.request('/source'),error=>error instanceof InterventionError&&/unsent draft was preserved/.test(error.message)&&!error.message.includes(secret));
  assert.equal(calls.length,3);assert(calls.every(c=>c.endpoint==='/source'&&c.method==='GET'));assert.equal(progress.length,1);
});

test('an operation deadline bounds recovery and polling instead of resetting on each retry',async t=>{
  const {s,calls}=fixture(t,()=>failed());const started=Date.now();
  await assert.rejects(s.until(()=>assert.fail('An unreadable screen cannot satisfy a predicate'),'Music is still opening.',40),InterventionError);
  assert.equal(calls.length,1);assert(Date.now()-started<500);
  calls.length=0;
  await assert.rejects(s.request('/source','GET',undefined,{deadline:Date.now()-1}),/time limit/);assert.equal(calls.length,0);
});

// Keep the fixture alive until the request's own timeout aborts its fetch signal.
function pendingRequest({signal}){
  return new Promise((resolve,reject)=>{
    const fallback=setTimeout(()=>reject(new Error('The offline request was not aborted by its deadline.')),1000);
    signal.addEventListener('abort',()=>{clearTimeout(fallback);reject(signal.reason);},{once:true});
  });
}

test('transport deadlines become sanitized interventions only on whitelisted reads and never retry',async t=>{
  for(const [endpoint,method,body] of [['/source','GET'],['/elements','POST',{using:'id',value:nativeId('music_entry_point')}],['/element/control-1/attribute/text','GET']]){
    const {s,calls,progress}=fixture(t,pendingRequest);
    await assert.rejects(s.request(endpoint,method,body,{deadline:Date.now()+20}),error=>error instanceof InterventionError&&/time limit/.test(error.message)&&/unsent draft was preserved/.test(error.message)&&!/DOMException|TimeoutError/.test(error.message));
    assert.equal(calls.length,1);assert.equal(progress.length,0);t.mock.restoreAll();
  }
  const mutation=fixture(t,pendingRequest);
  await assert.rejects(mutation.s.request('/element/control-1/click','POST',{},{deadline:Date.now()+20}),{name:'TimeoutError'});
  assert.equal(mutation.calls.length,1);assert.equal(mutation.progress.length,0);
});

test('until uses its stage message when a source transport reaches its own deadline',async t=>{
  const {s,calls,progress}=fixture(t,pendingRequest),message='Instagram did not enable the reviewed carousel. Its unsent draft was preserved.';
  await assert.rejects(s.until(()=>assert.fail('An aborted read cannot satisfy the stage'),message,25),error=>error instanceof InterventionError&&error.message===message);
  assert.equal(calls.length,1);assert.equal(calls[0].endpoint,'/source');assert.equal(progress.length,0);
});

test('until preserves external abort reasons instead of replacing them with a stage timeout',async t=>{
  const controller=new AbortController(),reason=new Error('The caller stopped this run.'),{s,calls}=fixture(t,call=>{
    const pending=pendingRequest(call);setTimeout(()=>controller.abort(reason),10);return pending;
  });s.signal=controller.signal;
  await assert.rejects(s.until(()=>false,'Carousel stage timeout.',200),error=>error===reason);
  assert.equal(calls.length,1);assert(calls[0].signal.aborted);
});

test('until preserves ANR, unrelated transport errors and deadline-independent failures',async t=>{
  const anr=new InterventionError('Instagram is not responding. Its draft was preserved.'),s=Object.create(AndroidSession.prototype);
  for(const original of [anr,new TypeError('Connection closed'),new DOMException('Upstream timeout','TimeoutError')]){
    s.screen=async()=>{await new Promise(resolve=>setTimeout(resolve,15));throw original;};
    await assert.rejects(s.until(()=>false,'Carousel stage timeout.',5),error=>error===original);
  }
  const upstream=new DOMException('Upstream timed out before the request deadline.','TimeoutError'),next=fixture(t,()=>{throw upstream;});
  await assert.rejects(next.s.request('/source'),error=>error===upstream);assert.equal(next.calls.length,1);
});

test('aborting recovery cancels the backoff and prevents a second read or mutation',async t=>{
  const controller=new AbortController(),{s,calls}=fixture(t,()=>failed());s.signal=controller.signal;
  s.onReadRecovery=async()=>setTimeout(()=>controller.abort(),15);
  await assert.rejects(s.request('/elements','POST',{using:'id',value:nativeId('music_entry_point')}),{name:'AbortError'});
  assert.equal(calls.length,1);assert(calls[0].signal.aborted);
});

test('aborting an in-flight recovered read stops immediately with no further commands',async t=>{
  const controller=new AbortController(),{s,calls}=fixture(t,({signal},count)=>{
    if(count===1)return failed();
    return new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});controller.abort();
    });
  });s.signal=controller.signal;
  await assert.rejects(s.request('/source'),{name:'AbortError'});assert.equal(calls.length,2);
});

test('root-like errors never replay mutations, execute, back, gestures, sharing, settings or session deletion',async t=>{
  const {s,calls,progress}=fixture(t,()=>failed());
  const commands=[['/element/control-1/click','POST',{}],['/element/share_footer_button/click','POST',{}],['/element/control-1/clear','POST',{}],['/element/control-1/value','POST',{text:'Private caption'}],['/execute/sync','POST',{script:'mobile: replaceElementValue',args:[{text:'Private caption'}]}],['/back','POST',{}],['/actions','POST',{actions:[]}],['/appium/device/activate_app','POST',{appId:'com.instagram.android'}],['/appium/settings','POST',{settings:{}}],['','DELETE'],['/screenshot','GET'],['/source','POST',{}],['/elements','GET'],['/element/control-1/attribute/text','POST',{}]];
  for(const command of commands){const before=calls.length;await assert.rejects(s.request(...command),/Android: Timed out/);assert.equal(calls.length,before+1);}
  assert.equal(progress.length,0);
});

test('network failures and unrelated server errors are never treated as accessibility recovery',async t=>{
  const failure=new TypeError(rootTimeout),{s,calls,progress}=fixture(t,()=>{throw failure;});
  await assert.rejects(s.request('/source'),error=>error===failure);assert.equal(calls.length,1);assert.equal(progress.length,0);
  t.mock.restoreAll();
  const messages=['socket hang up','Instagram is not responding','Timed out after 10514ms waiting for another Android object'];
  for(const message of messages){
    const next=fixture(t,()=>failed(message));await assert.rejects(next.s.request('/source'),error=>error.message==='Android: '+message);
    assert.equal(next.calls.length,1);assert.equal(next.progress.length,0);t.mock.restoreAll();
  }
});

test('an ambiguous session-creation timeout does not create or reset another session',async()=>{
  let creates=0,resets=0;
  await assert.rejects(connectAndroidDriver(async()=>{creates++;return {ok:false,result:{value:{error:'unknown error',message:rootTimeout}}};},async()=>{resets++;}),InterventionError);
  assert.equal(creates,1);assert.equal(resets,0);
});

test('recovered reads keep final publication and password controls blocked',async t=>{
  let rootFailed=false;
  const {s,calls}=fixture(t,({endpoint})=>{
    if(endpoint==='/elements')return reply([element]);
    if(endpoint.endsWith('/attribute/text')){if(!rootFailed){rootFailed=true;return failed();}return reply('Share');}
    if(endpoint.endsWith('/attribute/content-desc'))return reply('');
    assert.fail('No publication command may be issued');
  });
  await assert.rejects(s.click('id',nativeId('music_entry_point')),/Final Android publication control is blocked/);
  assert(!calls.some(c=>c.endpoint.endsWith('/click')));t.mock.restoreAll();
  let passwordFailed=false;
  const password=fixture(t,({endpoint})=>{
    if(endpoint==='/elements')return reply([element]);
    if(endpoint.endsWith('/attribute/password')){if(!passwordFailed){passwordFailed=true;return failed();}return reply('true');}
    assert.fail('No password mutation may be issued');
  });
  await assert.rejects(password.s.text('id',nativeId('caption_input_text_view'),'Private password'),/Password fields are never filled/);
  assert(password.calls.every(c=>c.endpoint==='/elements'||c.endpoint.endsWith('/attribute/password')));t.mock.restoreAll();
  const signIn=fixture(t,(_,count)=>count===1?failed():reply('<hierarchy><node class="android.widget.EditText" password="true" displayed="true" text="Private password"/></hierarchy>'));
  await assert.rejects(signIn.s.screen(),/Passwords and codes are never read or filled/);assert.equal(signIn.calls.length,2);
});

test('recognized and unknown ANR dialogs keep their existing safe stopping rules',async t=>{
  const anr=title=>'<hierarchy><node class="android.widget.TextView" package="android" resource-id="android:id/alertTitle" displayed="true" text="'+title+'"/><node class="android.widget.Button" package="android" resource-id="android:id/aerr_wait" displayed="true" text="Wait"/><node class="android.widget.Button" package="android" resource-id="android:id/aerr_close" displayed="true" text="Close app"/></hierarchy>';
  const {s,calls,progress}=fixture(t,()=>reply(anr('Instagram is not responding')));s.anrWaited=true;
  await assert.rejects(s.screen(),/Instagram is not responding/);assert.equal(calls.length,1);assert.equal(progress.length,0);t.mock.restoreAll();
  const unknown=fixture(t,()=>reply(anr('Other app is not responding')));
  await assert.rejects(unknown.s.screen(),/unrecognized app-not-responding dialog/);assert.equal(unknown.calls.length,1);assert.equal(unknown.progress.length,0);
});

test('selector failures distinguish zero and multiple matches while omitting captions, passwords and labels',async t=>{
  const sensitive='Private caption password 123456', {s}=fixture(t,()=>reply([]));
  await assert.rejects(s.find('xpath','//*[@text="'+sensitive+'"]',{deadline:Date.now()+15}),error=>error instanceof InterventionError&&/found no controls/.test(error.message)&&/XPath selector/.test(error.message)&&!error.message.includes(sensitive));
  t.mock.restoreAll();
  const multiple=fixture(t,()=>reply([element,{...element,'element-6066-11e4-a52e-4f735466cecf':'control-2'}]));
  await assert.rejects(multiple.s.find('xpath','//*[@resource-id="'+nativeId('music_entry_point')+'" and @content-desc="'+sensitive+'"]'),error=>/matched 2 controls/.test(error.message)&&error.message.includes(nativeId('music_entry_point'))&&/ambiguous/.test(error.message)&&!error.message.includes(sensitive));
  assert.equal(multiple.calls.length,1);
});
