// Copyright (c) 2026 Mrinal. Offline isolated browser practice, with no social or provider requests.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runRecoveryPractice} from '../server/automation/recovery-practice.js';
import {NavigationAI} from '../server/navigation-ai.js';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
const fix='Discard this verified unsent draft to unblock the composer.';
const action={type:'click',controlId:'c1'};
const choice={fix,action,model:'gemini-fixture'};
async function fixture(t){const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage(),requests=[];await context.route('**/*',route=>{requests.push(route.request().url());return route.abort();});return {page,requests};}
const stats=page=>page.evaluate(()=>{const s=window.__studioRecoveryPractice;return s?{phase:s.phase,discarded:s.discarded,text:s.editor.value,revision:s.revision}:null;});
async function choose(input){await input.onEvent?.({phase:'calling',model:choice.model,message:'Asking Gemini for a possible fix.'});await input.onEvent?.({phase:'proposed',model:choice.model,fix,action,source:'provider',message:fix});return structuredClone(choice);}

test('practice reproduces the nested strict selector failure then applies one Gemini-bound draft fix',async t=>{
 const {page,requests}=await fixture(t),events=[],steps=[];let calls=0;
 const result=await runRecoveryPractice({page,ai:{plan:async input=>{calls++;assert.equal(input.platform,'whatsapp');assert.equal(input.stage,'discard_owned_draft');assert.deepEqual(input.capabilities,{discardOwnedDraft:true});assert.deepEqual(input.controls,[{id:'c1',label:'Discard',role:'button',enabled:true,scrollable:false}]);assert(!JSON.stringify(input).includes('disposable unsent draft'));assert.equal(await page.getByRole('dialog').filter({hasText:'Discard selection?'}).count(),2);return choose(input);}},reportRecovery:event=>events.push(event),step:message=>steps.push(message)});
 assert(result.completed);assert.equal(result.actions,1);assert(result.strictModeObserved);assert.equal(calls,1);
 assert.deepEqual(await stats(page),{phase:'complete',discarded:1,text:'',revision:1});
 assert.deepEqual(events.map(event=>event.phase),['detected','calling','proposed','executing','verifying','succeeded']);
 assert.equal(events.find(event=>event.phase==='proposed').fix,fix);assert(steps.some(message=>message.includes('Trying Gemini')));
 assert.equal(page.url(),'about:blank');assert.equal(await page.getByRole('button',{name:/^(send|publish|share|save|post)$/i}).count(),0);assert.deepEqual(requests,[]);
 await page.getByRole('button',{name:'Introduce blocker',exact:true}).click();
 assert.equal((await stats(page)).phase,'blocked','The visible page allows another harmless manual blocker after completion');
});

test('practice uses the real provider broker with a mocked transport and displays its actual explanation',async t=>{
 const {page,requests}=await fixture(t),events=[];const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-practice-ai-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let calls=0;
 const ai=new NavigationAI({dataDir:dir,env:{},fetchImpl:async(_url,request)=>{calls++;assert.equal(events.at(-1).phase,'calling');const sent=JSON.parse(JSON.parse(request.body).contents[0].parts[0].text);assert.equal(sent.controls.length,1);assert.deepEqual(sent.capabilities,{discardOwnedDraft:true});return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({explanation:fix,action})}]}}]}),{status:200});}});
 await ai.init();await ai.configure({enabled:true,automatic:true,apiKey:'practice-fixture-key'});
 const result=await runRecoveryPractice({page,ai,reportRecovery:event=>events.push(event)});
 assert(result.completed);assert.equal(calls,1);assert.equal(ai.state().today.used,1);
 assert.equal(events.find(event=>event.phase==='proposed').source,'provider');assert.equal(events.find(event=>event.phase==='executing').fix,fix);assert.deepEqual(requests,[]);
});

test('unavailable, uncertain and invalid model actions never click or clear the disposable draft',async t=>{
 for(const value of [null,{action:{type:'stop'}},{action:{type:'click',controlId:'c2'}},{action:{type:'click',controlId:'c1',selector:'#unsafe'}},{action:{type:'scroll',controlId:'c1',direction:'down'}}]){
  const {page}=await fixture(t),events=[];const result=await runRecoveryPractice({page,ai:{plan:async()=>value},reportRecovery:event=>events.push(event)});
  assert(!result.completed);assert.equal(result.actions,0);assert.equal((await stats(page)).discarded,0);assert.match((await stats(page)).text,/STUDIO PRACTICE ONLY/);assert.equal(events.at(-1).phase,'paused');assert(!events.some(event=>event.phase==='calling'),'A mock with no provider call cannot invent an API call event');
 }
});

test('the fixture identity, human edits and exact leaf dialog are rechecked before acting',async t=>{
 for(const mutation of [
  page=>page.locator('#practice-draft').fill('Human input'),
  page=>page.evaluate(()=>{const s=window.__studioRecoveryPractice;s.editor.value='Other text';}),
  page=>page.evaluate(()=>{const b=document.querySelector('#practice-discard');b.replaceWith(b.cloneNode(true));}),
  page=>page.evaluate(()=>document.querySelector('#practice-leaf').append(document.createElement('button'))),
  page=>page.evaluate(()=>document.querySelector('#studio-recovery-practice').dataset.nonce='different')
 ]){
  const {page}=await fixture(t);const result=await runRecoveryPractice({page,ai:{plan:async()=>{await mutation(page);return structuredClone(choice);}}});
  assert(!result.completed);assert.equal(result.reason,'fixture_changed');assert.equal(result.actions,0);assert.equal((await stats(page)).discarded,0);
 }
});

test('a human edit restored to its original text still invalidates draft ownership',async t=>{
 const {page}=await fixture(t);const result=await runRecoveryPractice({page,ai:{plan:async()=>{const original=await page.locator('#practice-draft').inputValue();await page.locator('#practice-draft').fill('Human changed');await page.locator('#practice-draft').fill(original);return choice;}}});
 assert(!result.completed);assert.equal(result.actions,0);assert.equal((await stats(page)).discarded,0);
});

test('execution progress is written before a fresh guard, so stop or changed UI cannot race a click',async t=>{
 const {page}=await fixture(t);const result=await runRecoveryPractice({page,ai:{plan:choose},reportRecovery:async event=>{if(event.phase==='executing')await page.evaluate(()=>window.__studioRecoveryPractice.editor.value='Changed after trace write');}});
 assert(!result.completed);assert.equal(result.actions,0);assert.equal((await stats(page)).discarded,0);
 const second=await fixture(t),controller=new AbortController();
 await assert.rejects(runRecoveryPractice({page:second.page,signal:controller.signal,ai:{plan:choose},reportRecovery:event=>{if(event.phase==='executing')controller.abort(new Error('Stopped by user'));}}),/Stopped by user/);
 assert.equal((await stats(second.page)).discarded,0);
});

test('foreign pages are preserved and an aborted practice never creates its disposable draft',async t=>{
 const {page}=await fixture(t);await page.goto('data:text/html,<title>Existing page</title><p>Keep this content</p>');let calls=0;
 const result=await runRecoveryPractice({page,ai:{plan:async()=>{calls++;return choice;}}});
 assert(!result.completed);assert.equal(result.reason,'foreign_page');assert.equal(await page.title(),'Existing page');assert.equal(calls,0);
 const fresh=await fixture(t),controller=new AbortController();controller.abort(new Error('Cancelled before start'));
 await assert.rejects(runRecoveryPractice({page:fresh.page,ai:{plan:choose},signal:controller.signal}),/Cancelled before start/);assert.equal(await fresh.page.locator('#studio-recovery-practice').count(),0);
});

test('stop during a model response prevents clicks even if a late model action arrives',async t=>{
 const {page}=await fixture(t),controller=new AbortController();
 await assert.rejects(runRecoveryPractice({page,signal:controller.signal,ai:{plan:async()=>{controller.abort(new Error('Stopped while calling'));return choice;}}}),/Stopped while calling/);
 assert.equal((await stats(page)).discarded,0);assert.match((await stats(page)).text,/STUDIO PRACTICE ONLY/);
});

test('one short free-tier cooldown is shown, waited once, and followed by one fresh decision',async t=>{
 const {page}=await fixture(t),events=[];let calls=0;
 const result=await runRecoveryPractice({page,ai:{plan:async input=>++calls===1?null:choose(input),state:()=>({status:'cooldown',cooldownUntil:Date.now()+10,today:{remaining:5}})},reportRecovery:event=>events.push(event)});
 assert(result.completed);assert.equal(calls,2);assert.equal(events.filter(event=>event.phase==='waiting').length,1);assert.equal(events.filter(event=>event.phase==='calling').length,1);
});

test('progress persistence failures stop the practice before its guarded click',async t=>{
 const {page}=await fixture(t);
 await assert.rejects(runRecoveryPractice({page,ai:{plan:choose},reportRecovery:event=>{if(event.phase==='executing')throw new Error('EPERM practice trace');}}),/EPERM practice trace/);
 assert.equal((await stats(page)).discarded,0);
});
