// Copyright (c) 2026 Mrinal. Offline Gemini settings and explicit manual recovery UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createApp} from '../server/index.js';
import {defaults} from '../server/config.js';

const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-navigation-ai-ui-'));
const secret='offline-gemini-secret-MUST-NEVER-LEAVE-SETTINGS';
const malicious='Open Edit. <img src=x onerror="window.__navigationAiXss=true">';
const errors=[],external=[],configured=[],resumed=[];
let key='',enabled=false,current=null,suggestCalls=0;
const navigationAI={
 async init(){},
 state(){return {enabled,configured:!!key,status:enabled&&key?'ready':'disabled',message:enabled&&key?'Ready for limited navigation suggestions.':'Manual recovery remains available.',models:['gemini-offline-fixture']};},
 async configure(value){
  configured.push({...value});
  if(value.clearKey)key='';else if(typeof value.apiKey==='string'&&value.apiKey.trim())key=value.apiKey.trim();
  if(typeof value.enabled==='boolean')enabled=value.enabled;
  return this.state();
 },
 async suggest(){suggestCalls++;return {status:'unavailable',message:'Suggestions are unavailable. Continue manually.'};}
};
const {app,queue}=await createApp({dataDir,navigationAI,browser:{page:async()=>({isClosed:()=>true})},queueOptions:{instagramWorker:{busy:false},runner:async ctx=>{
 const first=await ctx.intervene({kind:'navigation',title:'Open Edit info in Instagram',instructions:'Open Edit info, then continue. Do not Save or Share.',ai:{status:'ready',steps:['Open the post menu and choose Edit.',malicious],model:'gemini-offline-fixture'}},async()=>current);
 resumed.push(first);current=null;
 const second=await ctx.intervene({kind:'navigation',title:'Open the Instagram music library',instructions:'Open the music library, then continue. Leave Save and Share untouched.',ai:{status:'unavailable',message:'Gemini is busy. Continue manually; your run is safely paused.'}},async()=>current);
 resumed.push(second);return 'dry_run';
}}});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
const api=async(route,body)=>{
 const response=await fetch(origin+route,{...(body===undefined?{}:{method:'PUT',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)})});
 const text=await response.text();assert(!text.includes(secret),'API response leaked the saved Gemini key');return {status:response.status,body:JSON.parse(text)};
};
const assertPublic=async()=>{for(const route of ['/api/navigation-ai','/api/bootstrap','/api/status'])assert.equal((await api(route)).status,200);};
async function firstEvent(){
 const controller=new AbortController();
 try{const response=await fetch(origin+'/api/events',{signal:controller.signal});const reader=response.body.getReader();const value=await reader.read();const text=new TextDecoder().decode(value.value);assert.match(text,/data:/);assert(!text.includes(secret),'Event stream leaked the saved Gemini key');await reader.cancel();}
 finally{controller.abort();}
}
try{
 assert.deepEqual((await api('/api/navigation-ai')).body,navigationAI.state());
 await page.goto(origin);await page.getByRole('heading',{name:'Connections',exact:true}).waitFor();
 await page.getByRole('button',{name:'Navigation help',exact:true}).click();
 const modal=page.locator('#modal'),form=modal.locator('#navigation-ai-form');
 await modal.getByRole('heading',{name:'Navigation help',exact:true}).waitFor();
 assert.equal(await form.getByLabel('Use Gemini suggestions',{exact:true}).isChecked(),false);
 assert.equal(await form.getByLabel('Gemini API key',{exact:true}).getAttribute('type'),'password');
 const explanation=await modal.innerText();assert.match(explanation,/control|navigation/i);assert.match(explanation,/caption|message/i);assert.match(explanation,/image|screenshot/i);assert.match(explanation,/quota|limit|busy/i);assert.match(explanation,/Google|data|improve/i);
 await form.getByLabel('Use Gemini suggestions',{exact:true}).check();await form.getByLabel('Gemini API key',{exact:true}).fill(secret);
 await modal.getByRole('button',{name:'Save settings',exact:true}).click();await modal.waitFor({state:'hidden'});
 assert.equal(configured.at(-1).apiKey,secret);assert.equal(configured.at(-1).enabled,true);assert.equal((await api('/api/navigation-ai')).body.configured,true);
 await assertPublic();await firstEvent();
 await page.getByRole('button',{name:'Navigation help',exact:true}).click();await modal.getByRole('heading',{name:'Navigation help',exact:true}).waitFor();
 assert.equal(await modal.getByLabel('Gemini API key',{exact:true}).inputValue(),'','Saved key must never be placed back into the DOM');assert(!await modal.innerText().then(text=>text.includes(secret)));
 await page.keyboard.press('Escape');
 const run=await queue.start({draft:{selected:['instagramMusic'],captions:{instagram:'Reviewed'},instagram:{postingMethod:'web',music:{enabled:true,source:'details',reference:{title:'Hype',artist:'VastPenguin'}}}},sourceInstagramPublication:{postUrl:'https://www.instagram.com/p/EXACT_OFFLINE_SOURCE/'},config:defaults,media:[],mode:'TEST'});
 await page.getByRole('heading',{name:'Open Edit info in Instagram',exact:true}).waitFor();
 const manual=page.locator('#android-manual');await manual.getByText('Gemini suggestion',{exact:true}).waitFor();
 assert.match(await manual.innerText(),/Open the post menu and choose Edit\./);assert((await manual.innerText()).includes(malicious),'Suggestion must render as literal text');assert.equal(await manual.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.__navigationAiXss),undefined);
 assert.equal(resumed.length,0,'Suggestions never automatically continue the run');assert.equal(run.status,'waiting_for_input');
 const blocked=await api('/api/navigation-ai',{enabled:false,clearKey:true});assert.equal(blocked.status,409);assert.equal(key,secret,'Busy settings request must not clear credentials');assert.equal(enabled,true);
 await assertPublic();await firstEvent();
 await page.getByRole('button',{name:'I’m on that screen · continue',exact:true}).click();await page.getByText('The expected screen is not ready. Follow the instructions on the selected Android device, then check again.',{exact:true}).waitFor();assert.equal(resumed.length,0);
 current={screen:'edit-info'};await page.getByRole('button',{name:'I’m on that screen · continue',exact:true}).click();
 await page.getByRole('heading',{name:'Open the Instagram music library',exact:true}).waitFor();assert.equal(resumed.length,1);assert.match(await manual.innerText(),/busy|unavailable|manually/i);assert.equal(run.status,'waiting_for_input');
 await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:390,height:844});await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/navigation-ai-dark-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),JSON.stringify(await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,class:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>innerWidth+1).slice(0,12)}))));
 current={screen:'music-library'};await page.getByRole('button',{name:'I’m on that screen · continue',exact:true}).click();await page.locator('#android-progress').waitFor({state:'hidden'});assert.equal(run.status,'completed');assert.equal(resumed.length,2);
 assert.equal((await api('/api/navigation-ai',{enabled:false,clearKey:true})).status,200);assert.equal((await api('/api/navigation-ai')).body.configured,false);assert.equal(key,'');assert.equal(suggestCalls,0,'UI fixtures must never contact an AI provider');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Navigation AI UI passed: opt-in settings, hidden credentials across API/events/DOM, idle-only configuration, escaped suggestions, explicit validated manual resume, friendly busy fallback, responsive dialog. No provider, Android or social connection.');
}finally{
 if(queue.active)await queue.control('kill',queue.active.id);await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await queue.persistChain;
 assert.equal(path.dirname(dataDir),path.resolve(os.tmpdir()));assert(path.basename(dataDir).startsWith('mrinal-navigation-ai-ui-'));await fs.rm(dataDir,{recursive:true,force:true});
}
