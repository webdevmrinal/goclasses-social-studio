// Copyright (c) 2026 Mrinal. Typed manual advice: provider and app/device operations are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {NavigationAI} from '../server/navigation-ai.js';
import {buildManualRecoveryContext,normalizeManualRecoveryInput,manualRecoveryOutput,MANUAL_RECOVERY_STEPS} from '../shared/manual-recovery.js';
const KEY='fixture-manual-recovery-key';
const response=body=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]}),{status:200});
const success=(ids=['inspect_worker','return_checkpoint'])=>response({stepIds:ids});
const target=(extra={})=>buildManualRecoveryContext({runs:[{id:'private-run-id',status:'completed_with_errors',items:[{id:'linkedin',status:'failed',submitting:false,message:'locator.waitFor Timeout at PRIVATE_PATH with PRIVATE_CAPTION'}]}],view:'activity',...extra});
async function fixture(t,respond=()=>success()){
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-manual-ai-'));let time=Date.parse('2026-10-26T08:00:00Z');const calls=[];
 const ai=new NavigationAI({dataDir,env:{},now:()=>time,fetchImpl:async(url,options)=>{calls.push({url,options});return respond(calls.length,options);}});await ai.init();await ai.configure({enabled:true,automatic:false,apiKey:KEY});
 t.after(async()=>{await ai.writes.catch(()=>{});await fs.rm(dataDir,{recursive:true,force:true});});
 return {ai,calls,advance:ms=>time+=ms,dataDir};
}
test('local builder classifies raw private errors but returns only enums plus local target identity',()=>{
 const input=target();assert.deepEqual(input.context,{platform:'linkedin',view:'activity',phase:'failed',issue:'navigation',submission:'not_started',phoneConnected:false});assert.deepEqual(input.target,{runId:'private-run-id',itemId:'linkedin'});assert.equal(typeof input.stamp,'string');assert(!JSON.stringify(input).includes('PRIVATE_'));
 const normalized=normalizeManualRecoveryInput({...input,context:{...input.context,rawError:'PRIVATE_RAW',caption:'PRIVATE_CAPTION',url:'https://private.example'},steps:input.steps.map(s=>({...s,extra:'PRIVATE_EXTRA'}))});assert(normalized);assert(!JSON.stringify(normalized).includes('PRIVATE_'));assert(!JSON.stringify(normalized).includes('private-run-id'));
});
test('every destination and app view has a canonical nonmutating advice context',()=>{
 for(const platform of ['app','instagram','instagramMusic','instagramStory','linkedin','x','youtubeDA','youtubeCS','manychat','whatsapp','telegram'])for(const view of ['connections','compose','preview','activity']){const input=buildManualRecoveryContext({scope:platform==='app'?'app':'platform',platform,view});assert.equal(input.context.platform,platform);assert.equal(input.context.view,view);assert(normalizeManualRecoveryInput(input));}
 for(const args of [{view:'PRIVATE_VIEW'},{scope:'unsafe'},{platform:'PRIVATE_PLATFORM'},{runId:'missing'},{runId:'private-run-id',itemId:'missing'}])assert.throws(()=>target(args));
});
test('classification distinguishes phone, storage, login, content, media and connection errors locally',()=>{
 const cases=[['Android device offline','phone_connection'],['EPERM opening PRIVATE_PATH/runs.json','storage'],['Session expired, sign in on PRIVATE_ACCOUNT','login'],['The caption does not match reviewed text','content'],['Image order differs from reviewed selection','media'],['Network connection unreachable','connection'],['A completely new failure','unknown']];
 for(const [message,issue]of cases){const value=buildManualRecoveryContext({runs:[{id:'r',status:'completed_with_errors',items:[{id:'x',status:'failed',message}]}]});assert.equal(value.context.issue,issue);assert(!JSON.stringify(value).includes(message));}
 const value=buildManualRecoveryContext({scope:'platform',platform:'manychat',login:{manychat:{status:'needs_login',message:'PRIVATE_DETAILS'}}});assert.equal(value.context.issue,'login');assert(value.steps.some(s=>s.id==='open_login'));
});
test('publication uncertainty removes retry, editing and checkpoint advice even for failed items',()=>{
 for(const item of [{id:'x',status:'uncertain',submitting:false},{id:'instagramStory',status:'failed',submitting:true}]){const value=buildManualRecoveryContext({runs:[{id:'r',status:'completed_with_errors',items:[item]}]});assert.equal(value.context.submission,'may_have_started');assert(value.steps.some(s=>s.id==='inspect_published'));assert(!value.steps.some(s=>['retry_failed_only','review_content','review_media','return_checkpoint'].includes(s.id)));assert.equal(normalizeManualRecoveryInput({...value,steps:[{id:'retry_failed_only',label:MANUAL_RECOVERY_STEPS.retry_failed_only}]}),null);}
 const posted=buildManualRecoveryContext({runs:[{id:'r',status:'completed',items:[{id:'x',status:'posted',submitting:true}]}],runId:'r',itemId:'x'});assert.equal(posted.context.submission,'confirmed');assert(!posted.steps.some(s=>s.id==='retry_failed_only'));
});
test('private target stamp changes on destination, phase and submission changes, not raw error spelling',()=>{
 const a=target(),b=target({runs:[{id:'another-private-run',status:'completed_with_errors',items:[{id:'linkedin',status:'failed',message:'locator timeout'}]}]});assert.notEqual(a.stamp,b.stamp);
 const c=target({runs:[{id:'private-run-id',status:'completed_with_errors',items:[{id:'linkedin',status:'failed',message:'A different locator timeout'}]}]});assert.equal(a.stamp,c.stamp);
});
test('manual recovery works with automatic mode off and renders only canonical provider-selected step IDs',async t=>{
 const f=await fixture(t),events=[],input=target();const value=await f.ai.recovery({...input,context:{...input.context,rawError:'PRIVATE_RAW',caption:'PRIVATE_CAPTION'},onEvent:async e=>events.push(e)});
 assert.deepEqual(value,{steps:[MANUAL_RECOVERY_STEPS.inspect_worker,MANUAL_RECOVERY_STEPS.return_checkpoint],model:'gemini-3.5-flash-lite'});assert.equal(f.ai.state().automatic,false);assert.equal(f.calls.length,1);assert.deepEqual(events.map(e=>e.phase),['calling','proposed']);assert.equal(events.at(-1).source,'provider');assert.match(events.at(-1).message,/Nothing was clicked or resumed/);
 const call=f.calls[0],body=JSON.parse(call.options.body);assert.equal(call.options.headers['x-goog-api-key'],KEY);assert(!call.url.includes(KEY));for(const secret of ['PRIVATE_RAW','PRIVATE_CAPTION','PRIVATE_PATH','private-run-id','inlineData'])assert(!call.options.body.includes(secret));assert(body.systemInstruction.parts[0].text.includes('across browser, phone, emulator and app'));assert.deepEqual(body.generationConfig.responseSchema.properties.stepIds.items.enum,input.steps.map(s=>s.id));assert.equal(body.generationConfig.maxOutputTokens,256);
});
test('fresh requests bypass cache while cache reuse is explicit and quota remains shared',async t=>{
 const f=await fixture(t),input=target();assert(await f.ai.recovery(input));const events=[];assert(await f.ai.recovery({...input,refresh:false,onEvent:async e=>events.push(e)}));assert.equal(f.calls.length,1);assert.deepEqual(events.map(e=>e.phase),['proposed']);assert.equal(events[0].source,'cache');
 const early=[];assert.equal(await f.ai.recovery({...input,onEvent:async e=>early.push(e)}),null);assert.equal(f.calls.length,1);assert(early.some(e=>e.phase==='paused'));f.advance(30000);assert(await f.ai.recovery(input));assert.equal(f.calls.length,2);f.advance(60001);assert.equal(await f.ai.recovery(input),null);assert.equal(f.calls.length,2);assert.match(f.ai.state().message,/already been checked/);
});
test('fresh requests bypass a negative cached result but never its per-context attempt cap',async t=>{
 const f=await fixture(t,count=>count===1?success([]):success()),input=target();assert.equal(await f.ai.recovery(input),null);f.advance(30001);assert(await f.ai.recovery(input));assert.equal(f.calls.length,2);f.advance(60001);assert.equal(await f.ai.recovery(input),null);assert.equal(f.calls.length,2);
});
test('malformed context, invented catalog labels and ineligible steps do not call Gemini',async t=>{
 const f=await fixture(t),input=target();for(const changed of [{context:{...input.context,issue:'RUN_SHELL'}},{steps:[{id:'inspect_worker',label:'Run arbitrary shell'}]},{steps:[{id:'invented',label:'Arbitrary'}]},{steps:[input.steps[0],input.steps[0]]},{refresh:'true'},{context:{...input.context,phoneConnected:'true'}}])assert.equal(await f.ai.recovery({...input,...changed}),null);assert.equal(f.calls.length,0);
});
test('unsafe, duplicate, unoffered and arbitrary provider text never reaches the client',async t=>{
 const input=target();for(const body of [{stepIds:['run_shell']},{stepIds:['inspect_worker','inspect_worker']},{stepIds:['inspect_published']},{stepIds:['inspect_worker'],script:'Run arbitrary command'},{steps:['Tap Share']},{stepIds:[]},{stepIds:[42]},['inspect_worker']]){const f=await fixture(t,()=>response(body));assert.equal(await f.ai.recovery(input),null,JSON.stringify(body));assert.equal(f.calls.length,1);}
 assert.equal(manualRecoveryOutput({stepIds:['inspect_worker']},input)[0],MANUAL_RECOVERY_STEPS.inspect_worker);
});
test('disabled or unconfigured manual requests remain off without changing saved settings',async t=>{
 const f=await fixture(t);await f.ai.configure({enabled:false});assert.equal(await f.ai.recovery(target()),null);assert.equal(f.calls.length,0);assert.equal(f.ai.state().enabled,false);await f.ai.configure({enabled:true,clearKey:true});assert.equal(await f.ai.recovery(target()),null);assert.equal(f.calls.length,0);
});
test('model unavailability switches at most once and records actual calls, while shared quota pauses',async t=>{
 const f=await fixture(t,count=>count===1?new Response('{}',{status:503}):success()),events=[];assert(await f.ai.recovery({...target(),onEvent:async e=>events.push(e)}));assert.equal(f.calls.length,2);assert.deepEqual(events.filter(e=>e.phase==='calling').map(e=>e.model),['gemini-3.5-flash-lite','gemini-2.5-flash-lite']);assert(events.some(e=>e.phase==='waiting'));
 const limited=await fixture(t,()=>new Response('{}',{status:429}));assert.equal(await limited.ai.recovery(target()),null);assert.equal(limited.calls.length,1);limited.advance(30001);assert.equal(await limited.ai.recovery(target()),null);assert.equal(limited.calls.length,1);
});
test('daily quota and existing provider work cannot be forced by a manual request',async t=>{
 const f=await fixture(t);f.ai.settings.usage.used=10;assert.equal(await f.ai.recovery(target()),null);assert.equal(f.calls.length,0);f.ai.settings.usage.used=0;f.ai.inFlight=true;assert.equal(await f.ai.recovery(target()),null);assert.equal(f.calls.length,0);f.ai.inFlight=false;
});
test('cancellation and failed progress persistence stop manual requests without a late response',async t=>{
 const f=await fixture(t),controller=new AbortController(),events=[];assert.equal(await f.ai.recovery({...target(),signal:controller.signal,onEvent:async e=>{events.push(e);if(e.phase==='calling')controller.abort();}}),null);assert.equal(f.calls.length,0);assert(!events.some(e=>e.phase==='proposed'));
 const broken=await fixture(t);assert.equal(await broken.ai.recovery({...target(),onEvent:async()=>{throw Error('audit unavailable');}}),null);assert.equal(broken.calls.length,0);assert.match(broken.ai.state().message,/progress could not be saved/);
});
test('cached recovery steps are cloned and cannot mutate the canonical catalog',async t=>{
 const f=await fixture(t),input=target(),first=await f.ai.recovery(input);first.steps[0]='Tap Share';const again=await f.ai.recovery({...input,refresh:false});assert.equal(again.steps[0],MANUAL_RECOVERY_STEPS.inspect_worker);assert.equal(f.calls.length,1);
});
