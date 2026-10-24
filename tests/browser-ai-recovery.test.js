// Copyright (c) 2026 Mrinal. Offline browser fixtures; no social requests or posts.
import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {NavigationAI} from '../server/navigation-ai.js';
import {browserNavigationControls,collectBrowserNavigationSnapshot,recoverBrowserNavigation} from '../server/automation/browser-ai-recovery.js';

let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
const origin='https://www.linkedin.com/company/123/admin/';
async function fixture(t,content,{url=origin,script=''}={}){
  const context=await browser.newContext({viewport:{width:900,height:650}});t.after(()=>context.close());
  await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:20px}button,[role=button],a{display:inline-block;padding:14px} [role=textbox]{min-height:40px} [hidden]{display:none!important}</style><main>${content}</main><script>window.clicked=[];document.addEventListener('click',event=>window.clicked.push(event.target.textContent.trim()),true);${script}</script>`}));
  const page=await context.newPage();await page.goto(url,{waitUntil:'domcontentloaded'});return page;
}
const ready=page=>async()=>await page.locator('[role="textbox"]').isVisible().catch(()=>false);
const choose=(type='click')=>async({controls})=>({action:{type,controlId:controls.find(control=>type==='scroll'?control.scrollable:!control.scrollable)?.id,...(type==='scroll'?{direction:'down'}:{})},model:'gemini-fixture'});
const recover=(page,ai,options={})=>recoverBrowserNavigation({page,ai,platform:'linkedin',goal:'open_composer',isComplete:ready(page),wait:async()=>{},...options});

 test('a changed button role is resolved from observed controls, then expected editor is proved',async t=>{
  const page=await fixture(t,'<div role="button" tabindex="0">Start a post</div>',{script:`document.querySelector('[role="button"]').addEventListener('click',()=>document.querySelector('main').innerHTML='<div role="textbox" contenteditable="true">Caption stays local</div>');`});
  let calls=0;const events=[];
  const result=await recover(page,{plan:async input=>{calls++;assert.deepEqual(input.controls,[{id:'c1',label:'Start a post',role:'button',enabled:true,scrollable:false}]);assert.equal(input.platform,'linkedin');assert.equal(input.stage,'open_composer');return choose()(input);}},{step:async message=>events.push(message)});
  assert.equal(result.completed,true);assert.equal(result.actions,1);assert.equal(calls,1);assert.equal(await page.locator('[role="textbox"]').textContent(),'Caption stays local');assert(events.some(event=>event.includes('expected screen')));
 });
 test('existing expected state returns immediately without model requests or clicks',async t=>{
  const page=await fixture(t,'<div role="textbox" contenteditable="true">Private reviewed caption</div><button>Post</button>');
  const result=await recover(page,{plan:async()=>assert.fail('No planning is needed')});assert.equal(result.completed,true);assert.equal(result.actions,0);assert.deepEqual(await page.evaluate(()=>window.clicked),[]);
 });
 test('cloud projection omits caption, user content, DOM identifiers and final controls',async t=>{
  const page=await fixture(t,'<div role="textbox" contenteditable="true" data-private="secret">Personal caption 987654</div><button id="internal-id" data-private="another-secret">Next</button><button>Post</button><button>Share</button><button>Save</button><button>Delete</button><a href="https://external.example">Next</a>');
  const snapshot=await collectBrowserNavigationSnapshot(page,'linkedin','advance_editor');const controls=browserNavigationControls(snapshot);
  assert.deepEqual(controls,[{id:'c1',label:'Next',role:'button',enabled:true,scrollable:false}]);assert(!JSON.stringify(controls).includes('secret'));assert(!JSON.stringify(controls).includes('caption'));
 });
 test('scope changes never offer unrelated Edit when opening the composer',async t=>{
  const page=await fixture(t,'<button>Edit</button><button>Start a post</button>');
  assert.deepEqual(browserNavigationControls(await collectBrowserNavigationSnapshot(page,'linkedin','open_composer')),[{id:'c1',label:'Start a post',role:'button',enabled:true,scrollable:false}]);
 });
 test('duplicate identical controls cannot be ranked by the model',async t=>{
  const page=await fixture(t,'<button>Start a post</button><button>Start a post</button>');
  const result=await recover(page,{plan:async()=>assert.fail('Ambiguous controls must stay local')});assert.equal(result.reason,'no_safe_controls');assert.deepEqual(await page.evaluate(()=>window.clicked),[]);
 });
 test('protected password screen does not reach the model',async t=>{
  const page=await fixture(t,'<input type="password"><button>Start a post</button>');
  const result=await recover(page,{plan:async()=>assert.fail('No protected controls are shared')});assert.equal(result.reason,'protected_screen');
 });
 test('recipient and security dialogs stay manual',async t=>{
  for(const heading of ['Choose recipients','Discard changes','Confirm payment']){
    const page=await fixture(t,`<div role="dialog"><h2>${heading}</h2><button>Next</button></div>`);
    const result=await recover(page,{plan:async()=>assert.fail('No protected dialog is shared')},{goal:'advance_editor'});assert.equal(result.reason,'protected_screen');
  }
 });
 test('only exact platform origins are trusted',async t=>{
  for(const url of ['https://www.linkedin.com.evil.example/admin','https://evil.example/linkedin.com','http://www.linkedin.com/admin','https://www.linkedin.com:444/admin','https://www.linkedin.com/messaging/']){
    const page=await fixture(t,'<button>Start a post</button>',{url});const result=await recover(page,{plan:async()=>assert.fail('No model call on an untrusted surface')});assert.equal(result.reason,'untrusted_page');
  }
 });
 test('only the active dialog supplies candidate bindings',async t=>{
  const page=await fixture(t,'<button>Start a post</button><div role="dialog" style="position:fixed;inset:0;background:white"><button>Create a post</button></div>');
  assert.deepEqual(browserNavigationControls(await collectBrowserNavigationSnapshot(page,'linkedin','open_composer')),[{id:'c1',label:'Create a post',role:'button',enabled:true,scrollable:false}]);
 });
 test('multiple active dialogs pause without guessing',async t=>{
  const page=await fixture(t,'<div role="dialog"><button>Create a post</button></div><div role="dialog"><button>Start a post</button></div>');const result=await recover(page,{plan:async()=>assert.fail('No model call for ambiguous overlays')});assert.equal(result.reason,'ambiguous_overlay');
 });
 test('unchanged screens are clicked once and never recursively replayed',async t=>{
  const page=await fixture(t,'<button>Start a post</button>');let calls=0;const result=await recover(page,{plan:async input=>{calls++;return choose()(input);}});assert.equal(result.reason,'unchanged_screen');assert.equal(result.actions,1);assert.equal(calls,1);assert.deepEqual(await page.evaluate(()=>window.clicked),['Start a post']);
 });
 test('a bounded three-step plan can navigate a changing interface',async t=>{
  const page=await fixture(t,'<button>Create</button>',{script:`let count=0;document.querySelector('main').addEventListener('click',()=>{count++;document.querySelector('main').innerHTML=count===1?'<button>Start a post</button>':count===2?'<button>Create a post</button>':'<div role="textbox" contenteditable="true"></div>';});`});
  const result=await recover(page,{plan:choose()});assert.equal(result.completed,true);assert.equal(result.actions,3);assert.equal(result.trace.filter(event=>event.type==='action').length,3);
 });
 test('the step limit clamps even when caller asks for unbounded recursion',async t=>{
  const page=await fixture(t,'<button>Create</button>',{script:`let count=0;document.querySelector('main').addEventListener('click',()=>{count++;document.querySelector('main').innerHTML='<button aria-expanded="'+count+'">'+(count%2?'Start a post':'Create')+'</button>';});`});
  const result=await recover(page,{plan:choose()},{maxSteps:999});assert.equal(result.completed,false);assert.equal(result.reason,'step_limit');assert.equal(result.actions,3);
 });
 test('busy or quota-limited provider falls back without retries or raw errors',async t=>{
  const page=await fixture(t,'<button>Start a post</button>');let calls=0;const result=await recover(page,{plan:async()=>{calls++;return null;}});assert.equal(result.reason,'model_unavailable');assert.equal(calls,1);assert.equal(result.actions,0);
 });
 test('provider exceptions return manual recovery and never expose provider payload',async t=>{
  const page=await fixture(t,'<button>Start a post</button>');const result=await recover(page,{plan:async()=>{throw Error('Quota 429 with secret payload');}});assert.equal(result.reason,'model_unavailable');assert(!JSON.stringify(result).includes('secret'));
 });
 test('model stop remains manual with no clicks',async t=>{
  const page=await fixture(t,'<button>Start a post</button>');const result=await recover(page,{plan:async()=>({action:{type:'stop'}})});assert.equal(result.reason,'model_uncertain');assert.equal(result.actions,0);
 });
 test('unknown control IDs and arbitrary action types never execute',async t=>{
  for(const action of [{type:'click',controlId:'button:has-text("Post")'},{type:'publish',controlId:'c1'},{type:'scroll',controlId:'c1',direction:'down'}]){
    const page=await fixture(t,'<button>Start a post</button><button>Post</button>');const result=await recover(page,{plan:async()=>({action})});assert.equal(result.completed,false);assert.equal(result.actions,0);assert.deepEqual(await page.evaluate(()=>window.clicked),[]);
  }
 });
 test('a screen change while model is thinking invalidates its binding',async t=>{
  const page=await fixture(t,'<button>Start a post</button>');const result=await recover(page,{plan:async()=>{await page.evaluate(()=>document.querySelector('main').innerHTML='<button>Create a post</button>');return {action:{type:'click',controlId:'c1'}};}});assert.equal(result.reason,'screen_changed');assert.equal(result.actions,0);
 });
 test('late overlays appearing during progress reporting stop before click',async t=>{
  const page=await fixture(t,'<button>Start a post</button>');const result=await recover(page,{plan:choose()},{step:async message=>{if(message==='Gemini navigation: Start a post.')await page.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<div role="dialog" style="position:fixed;inset:0;background:white"><button>Start a post</button></div>'));}});assert.equal(result.reason,'screen_changed');assert.equal(result.actions,0);assert.deepEqual(await page.evaluate(()=>window.clicked),[]);
 });
 test('a user stop before or during a model request propagates cancellation',async t=>{
  const page=await fixture(t,'<button>Start a post</button>');let controller=new AbortController();controller.abort();await assert.rejects(recover(page,{plan:choose()},{signal:controller.signal}),error=>error.name==='AbortError');
  controller=new AbortController();await assert.rejects(recover(page,{plan:async()=>{controller.abort();return {action:{type:'click',controlId:'c1'}};}},{signal:controller.signal}),error=>error.name==='AbortError');assert.deepEqual(await page.evaluate(()=>window.clicked),[]);
 });
 test('safe scroll exposes a navigation control without AI coordinates',async t=>{
  const page=await fixture(t,'<div style="height:750px">Unrelated private feed content</div><button>Start a post</button><div style="height:500px"></div>',{script:`document.querySelector('button').addEventListener('click',()=>document.querySelector('main').innerHTML='<div role="textbox"></div>');`});let calls=0;
  const result=await recover(page,{plan:async input=>{calls++;assert(!JSON.stringify(input).includes('private'));return choose(calls===1?'scroll':'click')(input);}});assert.equal(result.completed,true);assert.equal(result.actions,2);assert.equal(calls,2);
 });
 test('wait is bounded and a no-progress wait returns manual',async t=>{
  const page=await fixture(t,'<button>Start a post</button>');let waited=0;const result=await recover(page,{plan:async()=>({action:{type:'wait'}})},{wait:async ms=>{waited+=ms;}});assert.equal(result.reason,'unchanged_screen');assert.equal(result.actions,1);assert.equal(waited,1000);
 });
 test('implicit form submission and inaccessible controls are excluded',async t=>{
  const page=await fixture(t,'<form><button>Next</button></form><button disabled>Next</button><button hidden>Next</button><div contenteditable="true"><button>Next</button></div><button aria-label="Publish"><span>Next</span></button>');
  assert.deepEqual(browserNavigationControls(await collectBrowserNavigationSnapshot(page,'linkedin','advance_editor')),[]);
 });
 test('Close never discards a populated draft and cross-origin links stay manual',async t=>{
  const page=await fixture(t,'<div role="dialog"><textarea>Keep this reviewed draft</textarea><button>Close</button><a href="https://external.example">Back</a></div>');
  assert.deepEqual(browserNavigationControls(await collectBrowserNavigationSnapshot(page,'linkedin','close_navigation')),[]);
 });

 test('recovery keeps goal filtering stable even when an unrelated Edit is present',async t=>{
  const page=await fixture(t,'<button>Edit</button><button>Start a post</button>',{script:`document.querySelectorAll('button')[1].addEventListener('click',()=>document.querySelector('main').innerHTML='<div role="textbox"></div>');`});
  const result=await recover(page,{plan:async input=>{assert.deepEqual(input.controls,[{id:'c1',label:'Start a post',role:'button',enabled:true,scrollable:false}]);return choose()(input);}});assert.equal(result.completed,true);assert.equal(result.actions,1);assert.deepEqual(await page.evaluate(()=>window.clicked),['Start a post']);
 });

 test('conflicting accessible labels cannot disguise a final publication button',async t=>{
  const page=await fixture(t,'<button aria-label="Next">Post</button><button title="Publish">Next</button><button data-testid="publish-button">Next</button><button id="submit-final">Next</button>');
  const result=await recover(page,{plan:async()=>assert.fail('No final controls may reach the model')},{goal:'advance_editor'});assert.equal(result.reason,'no_safe_controls');assert.deepEqual(await page.evaluate(()=>window.clicked),[]);
 });

 test('canonical Instagram web and YouTube platform names retain exact-origin checks',async t=>{
  for(const [platform,url] of [['instagram_web','https://www.instagram.com/'],['youtube','https://www.youtube.com/channel/test/posts']]){
    const page=await fixture(t,'<button>Create a post</button>',{url});assert.deepEqual(browserNavigationControls(await collectBrowserNavigationSnapshot(page,platform,'open_composer')),[{id:'c1',label:'Create a post',role:'button',enabled:true,scrollable:false}]);
    assert.equal((await collectBrowserNavigationSnapshot(page,platform==='youtube'?'instagram_web':'youtube','open_composer')).safe,false);
  }
 });
 test('explicit post-creation navigation IDs do not look like final publication controls',async t=>{
  for(const id of ['start-a-post-button','toolbar_start_a_post','admin-create-post-trigger','create-a-post']){
    const page=await fixture(t,'<button data-testid="'+id+'">Start a post</button>',{script:`document.querySelector('button').addEventListener('click',()=>document.querySelector('main').innerHTML='<div role="textbox"></div>');`});
    const result=await recover(page,{plan:choose()});assert.equal(result.completed,true,id);assert.equal(result.actions,1);
  }
 });
 test('navigation-ID exceptions cannot hide final semantics or additional submit markers',async t=>{
  for(const html of ['<button data-testid="publish-start-a-post-button">Start a post</button>','<button data-testid="start-a-post-submit">Start a post</button>','<button data-testid="post">Start a post</button>','<button data-testid="start-a-post" title="Publish">Start a post</button>','<button data-testid="start-a-post" aria-label="Start a post">Post</button>','<form><button data-testid="start-a-post">Start a post</button></form>']){
    const page=await fixture(t,html);const result=await recover(page,{plan:async()=>assert.fail('A navigation-like ID cannot bypass final-control safeguards')});assert.equal(result.reason,'no_safe_controls');assert.equal(result.actions,0);
  }
 });

 test('real NavigationAI planner accepts the browser control contract and its guarded action completes',async t=>{
  const tempRoot=await fs.realpath(os.tmpdir());const dataDir=await fs.mkdtemp(path.join(tempRoot,'studio-browser-ai-contract-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(dataDir)),tempRoot);assert(path.basename(dataDir).startsWith('studio-browser-ai-contract-'));await fs.rm(dataDir,{recursive:true,force:true});});
  let calls=0;const ai=new NavigationAI({dataDir,env:{},fetchImpl:async(_url,request)=>{
    calls++;const payload=JSON.parse(request.body),input=JSON.parse(payload.contents[0].parts[0].text);
    assert.equal(input.platform,'linkedin');assert.equal(input.stage,'open_composer');assert.deepEqual(input.controls,[{id:'c1',label:'Start a post',role:'button',enabled:true,scrollable:false}]);
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({action:{type:'click',controlId:'c1'}})}]}}]}),{status:200});
  }});
  await ai.init();await ai.configure({enabled:true,automatic:true,apiKey:'offline-browser-contract-key'});
  const page=await fixture(t,'<button>Start a post</button>',{script:`document.querySelector('button').addEventListener('click',()=>document.querySelector('main').innerHTML='<div role="textbox"></div>');`});
  const result=await recover(page,ai);assert.equal(result.completed,true);assert.equal(result.actions,1);assert.equal(calls,1);assert.equal(ai.state().today.used,1);assert.deepEqual(await page.evaluate(()=>window.clicked),['Start a post']);
 });
