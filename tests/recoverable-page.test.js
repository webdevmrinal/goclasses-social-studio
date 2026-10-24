// Copyright (c) 2026 Mrinal. Recovery wrapper tests use fakes and a routed local fixture only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright';
import {browserNavigationGoal,recoverablePage} from '../server/automation/recoverable-page.js';

const timeout=()=>Object.assign(new Error('locator.click: element did not resolve before timeout'),{name:'TimeoutError'});
const ai={state:()=>({enabled:true,automatic:true,configured:true})};
function fixture({error=timeout(),state={enabled:true,automatic:true,configured:true}}={}){
 const calls=[],page={editor:false,visible:false};
 const locator=(role,name)=>({
  _frame:page,_selector:`${role}:${name}`,
  async click(...args){calls.push({method:'click',role,name,args});throw typeof error==='function'?error():error;},
  async waitFor(...args){calls.push({method:'waitFor',role,name,args});throw typeof error==='function'?error():error;},
  async isVisible(){return page.visible;},
  async evaluateAll(){return page.editor;},
  first(){return this;},last(){return this;},nth(){return this;},filter(){return this;},locator(){return this;},and(){return this;},or(){return this;},
  getByRole(nextRole,{name:nextName}={}){return locator(nextRole,nextName);},
  async textContent(){return 'untouched text';}
 });
 page.getByRole=(role,{name}={})=>locator(role,name);
 page.locator=()=>locator('region','root');
 return {page,calls,ai:{state:()=>state},state};
}
const failed=(wrapped,name='Start a post',method='click',options)=>wrapped.getByRole('button',{name}).first()[method](options);

test('browser recovery goals recognize exact composer and edit navigation only',()=>{
 for(const name of ['Start a post','Create a post','Create',/^Create$/,/^Start a post$/i])assert.equal(browserNavigationGoal('button',name),'open_composer');
 assert.equal(browserNavigationGoal('dialog','Create post modal'),'open_composer');
 assert.equal(browserNavigationGoal('menuitem','Edit'),'open_edit');
 assert.equal(browserNavigationGoal('button','Edit info'),'open_edit');
 assert.equal(browserNavigationGoal('button','Add music'),'open_music');
 for(const name of ['Post','Save','Share','Publish','Send','Delete','Go Live','Your stories','Close Friends','Start a post and publish',/^Create|Delete$/])assert.equal(browserNavigationGoal('button',name),null,String(name));
 assert.equal(browserNavigationGoal('textbox','Create'),null);
});

test('an unchanged LinkedIn selector call resumes when recovery proves its composer ready',async()=>{
 const f=fixture();let recoveries=0;
 const wrapped=recoverablePage(f.page,{ai:f.ai,platform:'linkedin',recover:async args=>{
  recoveries++;assert.equal(args.goal,'open_composer');assert.equal(args.page,f.page);assert.equal(args.maxSteps,3);
  assert.equal(await args.isComplete(),false);f.page.editor=true;
  assert.equal(await args.isComplete(),true);return {completed:true,actions:1};
 }});
 await wrapped.getByRole('button',{name:'Start a post'}).first().click({timeout:30000});
 assert.equal(recoveries,1);assert.equal(f.calls.length,1,'Original click is never replayed after recovery');
 assert.equal(f.calls[0].args[0].timeout,7000);
 assert.equal(await wrapped.getByRole('button',{name:'Start a post'}).textContent(),'untouched text');
});

test('composer state already reached during the failed selector is available to the recovery proof',async()=>{
 const f=fixture();f.page.editor=true;let checks=0;
 await failed(recoverablePage(f.page,{ai,platform:'linkedin',recover:async({isComplete})=>{
  checks++;assert.equal(await isComplete(),true);return {completed:true,actions:0};
 }}));
 assert.equal(checks,1);assert.equal(f.calls.length,1);
});

test('automatic recovery is inactive unless enabled, configured and separately opted in',async()=>{
 for(const state of [{enabled:false,automatic:true,configured:true},{enabled:true,automatic:false,configured:true},{enabled:true,automatic:true,configured:false}]){
  const f=fixture({state});let recovery=0;
  const wrapped=recoverablePage(f.page,{ai:f.ai,recover:async()=>{recovery++;return {completed:true,actions:1};}});
  await assert.rejects(failed(wrapped),error=>error.name==='TimeoutError');
  assert.equal(recovery,0);assert.equal(f.calls.length,1);assert.equal(f.calls[0].args[0],undefined,'No timeout rewrite when automatic recovery is off');
 }
});

test('network, permissions and non-selector failures are propagated without Gemini calls',async()=>{
 for(const error of [Object.assign(new Error('spawn EPERM'),{code:'EPERM'}),Object.assign(new Error('net::ERR_CONNECTION_RESET'),{code:'ECONNRESET'}),new Error('Browser context was closed'),new Error('Invalid form input')]){
  const f=fixture({error});let recovery=0;
  await assert.rejects(failed(recoverablePage(f.page,{ai,recover:async()=>{recovery++;}})),caught=>caught===error);
  assert.equal(recovery,0,error.message);
 }
});

test('strict selector ambiguity is recoverable but final controls never enter recovery',async()=>{
 const f=fixture({error:new Error('strict mode violation: two controls')});let recovery=0;
 const wrapped=recoverablePage(f.page,{ai,recover:async()=>{recovery++;return {completed:true,actions:1};}});
 await failed(wrapped,/^Create$/);assert.equal(recovery,1);
 for(const name of ['Post','Save','Share','Delete','Publish','Your story'])await assert.rejects(failed(wrapped,name),/strict mode violation/);
 assert.equal(recovery,1);
});

test('submitted, cancelled or newly ineligible work cannot trigger recovery',async()=>{
 for(const status of ['submitted','stopped']){
  const f=fixture();let count=0;
  await assert.rejects(failed(recoverablePage(f.page,{ai,canRecover:()=>!['submitted','stopped'].includes(status),recover:async()=>{count++;}})),{name:'TimeoutError'});
  assert.equal(count,0);
 }
 const f=fixture();let allowed=true,count=0;
 const original=f.page.getByRole;
 f.page.getByRole=(...args)=>{const target=original(...args);target.click=async()=>{allowed=false;throw timeout();};return target;};
 await assert.rejects(failed(recoverablePage(f.page,{ai,canRecover:()=>allowed,recover:async()=>{count++;}})),{name:'TimeoutError'});
 assert.equal(count,0,'Eligibility must be checked again after the original selector fails');
 const controller=new AbortController();controller.abort();const aborted=fixture();
 await assert.rejects(failed(recoverablePage(aborted.page,{ai,signal:controller.signal,recover:async()=>{count++;}})),{name:'AbortError'});
 assert.equal(count,0);
 assert.equal(aborted.calls.length,0,'Cancellation must be checked before the original locator mutation');
});

test('one navigation goal receives at most one recovery attempt across chained locators',async()=>{
 const f=fixture();let calls=0;
 const wrapped=recoverablePage(f.page,{ai,recover:async()=>{calls++;return {completed:false,actions:1,reason:'unchanged_screen'};}});
 await assert.rejects(failed(wrapped),/Gemini could not complete this navigation safely/);
 await assert.rejects(failed(wrapped,'Create'),{name:'TimeoutError'});
 assert.equal(calls,1);
});

test('the recovery budget is shared across distinct goals and never exceeds three actions',async()=>{
 const f=fixture(),limits=[];
 const wrapped=recoverablePage(f.page,{ai,recover:async options=>{limits.push(options.maxSteps);return {completed:true,actions:limits.length===1?2:1};}});
 await failed(wrapped,'Start a post');await failed(wrapped,'Edit');
 await assert.rejects(failed(wrapped,'Music'),{name:'TimeoutError'});
 assert.deepEqual(limits,[3,1]);
});

test('waitFor only recovers visible targets and its completion check does not click them',async()=>{
 const f=fixture();let calls=0;
 const wrapped=recoverablePage(f.page,{ai,recover:async({isComplete})=>{calls++;assert.equal(await isComplete(),false);f.page.visible=true;assert.equal(await isComplete(),true);return {completed:true,actions:1};}});
 await failed(wrapped,'Edit','waitFor',{state:'visible',timeout:10000});
 assert.equal(calls,1);assert(f.calls.every(call=>call.method==='waitFor'));
 const hidden=fixture();await assert.rejects(failed(recoverablePage(hidden.page,{ai,recover:async()=>assert.fail('Hidden waits are not navigation')}),'Edit','waitFor',{state:'hidden'}),{name:'TimeoutError'});
});

test('Playwright locator composition accepts proxied has/and/or locators without losing frame identity',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext();t.after(()=>context.close());
 await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><article><button>Edit</button></article><article><button>Other</button></article>'}));
 const page=await context.newPage();await page.goto('https://offline.test/');
 const wrapped=recoverablePage(page,{ai:{state:()=>({enabled:false,automatic:false,configured:false})}});
 const edit=wrapped.getByRole('button',{name:'Edit'});
 assert.equal(await wrapped.locator('article').filter({has:edit}).count(),1);
 assert.equal(await edit.and(wrapped.locator('button')).count(),1);
 assert.equal(await edit.or(wrapped.getByRole('button',{name:'Other'})).count(),2);
});
