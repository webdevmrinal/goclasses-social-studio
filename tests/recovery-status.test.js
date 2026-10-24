// Copyright (c) 2026 Mrinal. Recovery telemetry is bounded, cloned, and secret-free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryStatus } from '../server/recovery-status.js';

test('recovery status starts empty and reports an honest detected problem',()=>{
 const changes=[],log=new RecoveryStatus(value=>changes.push(value));assert.equal(log.state(),null);
 const state=log.begin({problem:'The owned preview has a blocking Discard dialog.',runId:'run-fixture',itemId:'whatsapp'});
 assert.match(state.id,/^[a-f0-9-]{36}$/);assert.equal(state.status,'running');assert.equal(state.phase,'detected');assert.equal(state.runId,'run-fixture');assert.equal(state.itemId,'whatsapp');assert.equal(state.practice,false);assert.equal(state.problem,'The owned preview has a blocking Discard dialog.');assert.equal(state.events.length,1);assert.equal(state.events[0].message,state.problem);assert(!Number.isNaN(Date.parse(state.startedAt)));assert.equal(changes.length,1);
});

test('recovery status only advances when a real, allowlisted event is reported',()=>{
 const log=new RecoveryStatus();log.begin({practice:true});
 for(const phase of ['calling','waiting','proposed','executing','verifying']){const value=log.report({phase,message:'Actual '+phase,fix:phase==='proposed'?'Dismiss the owned dialog':undefined,action:phase==='executing'?'Click Discard':undefined,model:phase==='calling'?'gemini-fixture':undefined});assert.equal(value.phase,phase);assert.equal(value.status,'running');assert.equal(value.events.at(-1).message,'Actual '+phase);}
 assert.equal(log.state().practice,true);assert.equal(log.state().fix,'Dismiss the owned dialog');assert.equal(log.state().action,'Click Discard');assert.equal(log.state().model,'gemini-fixture');
 for(const phase of ['succeeded','paused','failed']){const value=log.report({phase});assert.equal(value.phase,phase);assert.equal(value.status,phase);assert(value.message);}
 const before=log.state();assert.deepEqual(log.report({phase:'publish',message:'Never surface an invented phase'}),before);assert.deepEqual(log.report({}),before);
});

test('recovery telemetry snapshots and callbacks cannot mutate internal event history',()=>{
 let callback;const log=new RecoveryStatus(value=>{callback=value;});const first=log.begin({problem:'Original'});
 first.problem='Changed';first.events[0].message='Changed';callback.events.push({phase:'executing',message:'Tampered'});
 const second=log.state();assert.equal(second.problem,'Original');assert.equal(second.events.length,1);assert.equal(second.events[0].message,'Original');second.events.length=0;assert.equal(log.state().events.length,1);
});

test('recovery logs retain only the latest 24 events and bound every display field',()=>{
 const log=new RecoveryStatus();log.begin({problem:'p'.repeat(600)});for(let index=0;index<30;index++)log.report({phase:'executing',message:'event-'+index,fix:'f'.repeat(600),action:'a'.repeat(600),model:'m'.repeat(120),source:'provider',apiKey:'private-fixture',rawResponse:'PRIVATE_RAW'});
 const state=log.state();assert.equal(state.events.length,24);assert.equal(state.events[0].message,'event-6');assert.equal(state.events.at(-1).message,'event-29');assert.equal(state.problem.length,400);assert.equal(state.fix.length,400);assert.equal(state.action.length,400);assert.equal(state.model.length,80);assert.equal(state.events.at(-1).source,'provider');assert(!JSON.stringify(state).includes('private-fixture'));assert(!JSON.stringify(state).includes('PRIVATE_RAW'));
 log.report({phase:'proposed',source:'cache',message:'Reusing guidance; no API call.'});assert.equal(log.state().events.at(-1).source,'cache');log.report({phase:'waiting',source:'unknown'});assert.equal(log.state().events.at(-1).source,undefined);
});

test('recovery status redacts API-key and authorization formats from all message fields',()=>{
 const key='AIza'+'S'.repeat(31),token='fixture-bearer-secret-token';const problem='api_key=fixture-inline-secret '+key;
 const log=new RecoveryStatus();log.begin({problem});log.report({phase:'failed',message:'Authorization: Bearer '+token,fix:'api-key: fixture-fix-secret',action:'authorization='+key,model:key});
 const wire=JSON.stringify(log.state());for(const secret of [key,token,'fixture-inline-secret','fixture-fix-secret'])assert(!wire.includes(secret),'Secret must be redacted: '+secret);assert.match(wire,/private key/);
});

test('starting a new recovery removes prior fix, action, model, and terminal status',()=>{
 const log=new RecoveryStatus();log.begin({problem:'Old',runId:'old',itemId:'x'});log.report({phase:'succeeded',fix:'Old fix',action:'Old action',model:'old-model'});const oldId=log.state().id;
 const next=log.begin({practice:true});assert.notEqual(next.id,oldId);assert.equal(next.status,'running');assert.equal(next.problem,'Automation needs recovery.');assert.equal(next.events.length,1);for(const key of ['fix','action','model','runId','itemId'])assert.equal(next[key],undefined);
});


test('restore keeps terminal recovery history while disabling stale Stop controls',()=>{
 const original=new RecoveryStatus();original.begin({problem:'A verified draft was blocked.',runId:'run-restored',itemId:'whatsapp',practice:true,canStop:true});
 original.report({phase:'calling',model:'gemini-fixture',message:'Calling the fixture model.'});
 original.report({phase:'proposed',fix:'Discard the owned TEST selection.',action:'Click Discard',source:'provider'});
 const saved=original.report({phase:'succeeded',message:'The verified draft was cleared. Nothing was sent.'});
 let callbacks=0;const restored=new RecoveryStatus(()=>callbacks++);const state=restored.restore(saved);
 assert.equal(state.id,saved.id);assert.equal(state.problem,saved.problem);assert.equal(state.runId,'run-restored');assert.equal(state.itemId,'whatsapp');assert.equal(state.practice,true);assert.equal(state.canStop,false);assert.equal(state.status,'succeeded');assert.equal(state.phase,'succeeded');assert.equal(state.message,saved.message);assert.equal(state.fix,'Discard the owned TEST selection.');assert.equal(state.action,'Click Discard');assert.equal(state.model,'gemini-fixture');assert.deepEqual(state.events,saved.events);assert.equal(callbacks,0);
 state.events[0].message='Changed snapshot';saved.problem='Changed source';assert.equal(restored.state().problem,'A verified draft was blocked.');assert.notEqual(restored.state().events[0].message,'Changed snapshot');
 for(const phase of ['paused','failed']){saved.status=phase;saved.phase=phase;assert.equal(restored.restore(saved).status,phase);assert.equal(restored.state().phase,phase);}
});

test('restore turns interrupted running recovery into an honest paused result',()=>{
 const original=new RecoveryStatus();original.begin({problem:'A navigation screen is blocked.',canStop:true});const saved=original.report({phase:'executing',action:'Scroll down'});
 const restored=new RecoveryStatus();const state=restored.restore(saved);assert.equal(state.status,'paused');assert.equal(state.phase,'paused');assert.equal(state.canStop,false);assert.match(state.message,/worker restarted.*Review the saved result/i);assert.equal(state.action,'Scroll down');assert.equal(state.events.at(-1).phase,'executing');assert.equal(state.events.some(event=>event.phase==='succeeded'),false);
});

test('restore rejects malformed records and sanitizes bounded local history',()=>{
 const log=new RecoveryStatus();for(const value of [null,undefined,'invalid',{},[],{events:'invalid'}]){assert.equal(log.restore(value),null);assert.equal(log.state(),null);}
 const secret='AIza'+'R'.repeat(31),events=Array.from({length:30},(_,index)=>({phase:index===29?'invented':'executing',message:'event-'+index+' api_key='+secret,fix:'f'.repeat(600),action:'a'.repeat(600),model:secret,at:'t'.repeat(80),source:index===28?'cache':'unknown',rawResponse:'PRIVATE_RAW'}));
 const state=log.restore({id:'untrusted-id',problem:'authorization: Bearer fixture-private-token',runId:'r'.repeat(120),itemId:'i'.repeat(80),practice:'true',canStop:true,status:'running',events,apiKey:secret});
 assert.match(state.id,/^[a-f0-9-]{36}$/);assert.equal(state.practice,false);assert.equal(state.canStop,false);assert.equal(state.status,'paused');assert.equal(state.events.length,23);assert.match(state.events[0].message,/event-6/);assert.equal(state.events.at(-1).source,'cache');assert.equal(state.events[0].source,undefined);assert.equal(state.events[0].at.length,40);assert.equal(state.fix.length,400);assert.equal(state.action.length,400);assert.equal(state.runId.length,80);assert.equal(state.itemId.length,40);
 const wire=JSON.stringify(state);for(const value of [secret,'fixture-private-token','PRIVATE_RAW','untrusted-id'])assert(!wire.includes(value),'Restored state must exclude '+value);assert.match(wire,/private key/);assert.equal(state.events.some(event=>event.phase==='invented'),false);
});
