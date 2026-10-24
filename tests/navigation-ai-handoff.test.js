// Copyright (c) 2026 Mrinal. In-memory advisory lifecycle; no model/device APIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeInterventions} from '../server/native-interventions.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const until=async predicate=>{for(let i=0;i<50;i++){if(predicate())return;await Promise.resolve();}assert.fail('The in-memory advisory fixture did not settle.');};
const context={stage:'open_story_music',controls:[{label:'PRIVATE_CONTEXT_SENTINEL',className:'android.widget.Button',clickable:true}]};
const request=(task,action)=>({runId:task.run.id,itemId:task.item.id,id:task.intervention.id,action});
function fixture(t,{state={enabled:true,configured:true,status:'ready',message:''},suggest,provider=true}={}){
 const tasks=[],calls=[],responses=[],snapshots=[];let ordinal=0;
 const queue={change:async()=>{snapshots.push(structuredClone(tasks.map(task=>task.run)));}};
 const ai={state:()=>({...state}),suggest:async input=>{calls.push(input);if(suggest)return suggest(input);const response=deferred();responses.push(response);return response.promise;}};
 if(provider)queue.navigationAI=ai;
 const manager=new NativeInterventions(queue);
 const start=({kind='navigation',aiContext=context,inspect=async()=>({ready:true}),aborted}={})=>{
  const controller=new AbortController();if(aborted)controller.abort(aborted);
  const item={id:'instagramStory',status:'running',submitting:false},run={id:'fixture-'+(++ordinal),status:'running',items:[item]};
  const task={item,run,controller,pauses:0,resumes:0,inspections:0,settled:false};tasks.push(task);
  const details={kind,title:'Open Story music',instructions:'Open Music, then continue manually.',aiContext};
  const waiting=manager.wait(run,item,controller.signal,details,async()=>{task.inspections++;return inspect();},{pause:()=>task.pauses++,resume:()=>task.resumes++});
  task.intervention=item.intervention;
  // Handle rejection immediately; cleanup never leaves an unobserved wait.
  task.outcome=waiting.then(value=>{task.settled=true;return {value};},error=>{task.settled=true;return {error};});
  return task;
 };
 t.after(async()=>{
  for(const task of tasks)if(!task.controller.signal.aborted)task.controller.abort(Error('Fixture cleanup'));
  for(const response of responses)response.resolve(null);
  await Promise.all(tasks.map(task=>task.outcome));await tick();assert.equal(manager.pending,null);
 });
 return {queue,ai,state,manager,start,calls,responses,snapshots,tasks};
}

test('private AI context is stripped before the handoff is exposed or persisted',async t=>{
 const f=fixture(t),task=f.start();
 assert.equal(task.run.status,'waiting_for_input');assert.equal(task.item.status,'waiting_for_input');
 assert(!Object.hasOwn(task.intervention,'aiContext'));assert(!Object.hasOwn(task.item,'aiContext'));assert.equal(task.pauses,1);
 await until(()=>f.calls.length===1);
 for(const snapshot of f.snapshots){const json=JSON.stringify(snapshot);assert(!json.includes('aiContext'));assert(!json.includes('PRIVATE_CONTEXT_SENTINEL'));}
 assert(!JSON.stringify(task.run).includes('PRIVATE_CONTEXT_SENTINEL'));
 assert.deepEqual({...f.calls[0],signal:undefined},{...context,signal:undefined});assert.equal(f.calls[0].signal.aborted,false);
});
test('enabled advice starts once in the background and never inspects or continues the task',async t=>{
 const f=fixture(t),task=f.start(),pending=f.manager.pending;
 assert.equal(task.intervention.ai.status,'loading');assert.equal(task.inspections,0);assert.equal(task.resumes,0);assert(!task.settled);
 await until(()=>f.calls.length===1);await tick();assert.equal(f.calls.length,1);
 f.responses[0].resolve({steps:['Open Music.'],model:'mock-gemini'});await until(()=>task.intervention.ai.status==='ready');
 assert.deepEqual(task.intervention.ai,{status:'ready',steps:['Open Music.'],model:'mock-gemini'});
 assert.equal(f.manager.pending,pending);assert.equal(task.run.status,'waiting_for_input');assert.equal(task.item.status,'waiting_for_input');
 assert.equal(task.inspections,0);assert.equal(task.resumes,0);assert(!task.settled);assert.equal(task.item.manualInputs,undefined);assert.equal(task.item.submitting,false);
 await tick();assert.equal(f.calls.length,1);
});
test('AI guidance cannot satisfy the expected screen or replace explicit continuation',async t=>{
 let ready=false;const proof={caption:'Reviewed'},f=fixture(t),task=f.start({inspect:async()=>ready?proof:null});
 await until(()=>f.calls.length===1);f.responses[0].resolve({steps:['Look for Music.'],model:'mock'});await until(()=>task.intervention.ai.status==='ready');
 await assert.rejects(f.manager.act(request(task,'continue')),/expected screen/);assert(!task.settled);assert.equal(task.run.status,'waiting_for_input');
 ready=true;assert.deepEqual(await f.manager.act(request(task,'continue')),{ok:true});assert.deepEqual(await task.outcome,{value:proof});
 assert.equal(task.inspections,2);assert.equal(task.resumes,1);assert.equal(f.calls.length,1);assert.equal(f.manager.pending,null);
});
for(const [name,options,startOptions] of [
 ['disabled suggestions',{state:{enabled:false,configured:true}},{}],
 ['missing key',{state:{enabled:true,configured:false}},{}],
 ['no provider',{provider:false},{}],
 ['missing context',{}, {aiContext:null}],
 ['music selection',{}, {kind:'music'}]
])test(name+' never starts a suggestion',async t=>{
 const f=fixture(t,options),task=f.start(startOptions);await tick();
 assert.equal(f.calls.length,0);assert.equal(task.intervention.ai,undefined);assert.equal(task.inspections,0);assert(!task.settled);assert.equal(task.run.status,'waiting_for_input');
});
test('run cancellation reaches the provider and prevents late guidance',async t=>{
 const f=fixture(t),task=f.start();await until(()=>f.calls.length===1);
 let providerAborted=false;f.calls[0].signal.addEventListener('abort',()=>{providerAborted=true;},{once:true});
 assert.equal(f.calls[0].signal.aborted,false);const reason=Error('Operator stopped this run'),intervention=task.intervention;
 task.controller.abort(reason);assert.deepEqual(await task.outcome,{error:reason});assert(providerAborted);assert.equal(f.manager.pending,null);assert.equal(task.resumes,0);
 const changes=f.snapshots.length;f.responses[0].resolve({steps:['Open Music.'],model:'late-model'});await tick();
 assert.equal(intervention.ai.status,'loading');assert.equal(task.item.intervention,undefined);assert.equal(f.snapshots.length,changes);assert.equal(task.inspections,0);
});
test('a completed handoff cannot attach its late guidance to a newer paused handoff',async t=>{
 const f=fixture(t),old=f.start();await until(()=>f.calls.length===1);
 await f.manager.act(request(old,'continue'));await old.outcome;assert.equal(old.resumes,1);
 const current=f.start();await until(()=>f.calls.length===2);assert.equal(current.intervention.ai.status,'loading');
 f.responses[0].resolve({steps:['Open stale Music.'],model:'stale-model'});await tick();
 assert.equal(old.intervention.ai.status,'loading');assert.equal(current.intervention.ai.status,'loading');assert.equal(f.manager.pending.item,current.item);
 f.responses[1].resolve({steps:['Open current Music.'],model:'current-model'});await until(()=>current.intervention.ai.status==='ready');
 assert.equal(current.intervention.ai.model,'current-model');assert.equal(current.inspections,0);assert(!current.settled);
 assert(!JSON.stringify(f.snapshots).includes('stale-model'));assert.equal(current.run.status,'waiting_for_input');
});
test('a run that leaves its paused state cannot receive late provider output',async t=>{
 const f=fixture(t),task=f.start();await until(()=>f.calls.length===1);task.run.status='stopped';
 const changes=f.snapshots.length;f.responses[0].resolve({steps:['Open Music.'],model:'late-model'});await tick();
 assert.equal(task.intervention.ai.status,'loading');assert.equal(f.snapshots.length,changes);assert.equal(task.inspections,0);
});
test('provider exceptions become friendly manual guidance without rejecting the wait',async t=>{
 const privateError='secret-api-key-and-provider-diagnostic';
 const f=fixture(t,{state:{enabled:true,configured:true,status:'offline',message:'Gemini is unavailable. Continue manually.'},suggest:async()=>{throw Error(privateError);}}),task=f.start();
 await until(()=>task.intervention.ai.status==='offline');
 assert.deepEqual(task.intervention.ai,{status:'offline',message:'Gemini is unavailable. Continue manually.'});
 assert.equal(f.calls.length,1);assert(!task.settled);assert.equal(task.run.status,'waiting_for_input');assert.equal(task.inspections,0);assert.equal(task.resumes,0);
 assert(!JSON.stringify(f.snapshots).includes(privateError));assert.equal(f.manager.pending.item,task.item);
});
test('empty provider output preserves a manual fallback even without a service message',async t=>{
 const f=fixture(t),task=f.start();await until(()=>f.calls.length===1);f.responses[0].resolve(null);
 await until(()=>task.intervention.ai.status!=='loading');
 assert.match(task.intervention.ai.message,/continue manually/i);assert.equal(task.inspections,0);assert(!task.settled);assert.equal(task.resumes,0);
});
test('an already aborted run never exposes a handoff or starts advice',async t=>{
 const f=fixture(t),reason=Error('Stopped before handoff'),task=f.start({aborted:reason});assert.deepEqual(await task.outcome,{error:reason});await tick();
 assert.equal(task.item.intervention,undefined);assert.equal(task.pauses,0);assert.equal(task.resumes,0);assert.equal(task.inspections,0);assert.equal(f.calls.length,0);assert.equal(f.snapshots.length,0);
});

test('manual continuation aborts unnecessary background guidance before a model fallback',async t=>{
 const f=fixture(t),task=f.start();await until(()=>f.calls.length===1);const signal=f.calls[0].signal;assert.equal(signal.aborted,false);
 await f.manager.act(request(task,'continue'));await task.outcome;assert.equal(signal.aborted,true);assert.equal(f.manager.pending,null);
 f.responses[0].resolve(null);await tick();assert.equal(f.calls.length,1);
});
