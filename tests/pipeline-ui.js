// Real queue + local UI, fake resource workers. No social sites or phone calls.
import assert from 'node:assert/strict';import {once} from 'node:events';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {chromium} from 'playwright';import {createApp} from '../server/index.js';import {defaults} from '../server/config.js';import {InterventionError} from '../server/automation/utils.js';
const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-pipeline-ui-')),calls=[],errors=[],song={key:'1234567890',title:'LOADED',artist:'Beast Inside Beats'};let linkedIn=0;
const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Fixture did not settle');};
const {app,queue,phoneTools,manualRecoveryHelp}=await createApp({dataDir,browser:{page:async()=>({isClosed:()=>true})},queueOptions:{instagramWorker:{busy:false,checkAccount:async()=>{},close:async()=>{}},runner:async ctx=>{
 assert.equal(ctx.mode,'TEST');calls.push(ctx.id);
 if(ctx.id==='linkedin'&&linkedIn++===0)throw new InterventionError('Fixture browser recovery needed');
 if(ctx.id==='instagramMusic')await ctx.intervene({kind:'music',title:'Choose the song in Instagram',instructions:'Preview your song only.'},async()=>song);
 return {status:'dry_run',publication:{postUrl:'https://www.instagram.com/p/PIPELINE_UI/',music:song}};
}}});queue.on('workerError',e=>errors.push(e.message));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
const run=await queue.start({draft:{selected:['instagram','instagramStory','linkedin','x'],captions:{instagram:'Pipeline fixture',linkedin:'LinkedIn fixture',x:'X fixture'},instagram:{postingMethod:'web',music:{enabled:true,source:'manual'},story:{enabled:true,linkEnabled:false}}},config:structuredClone(defaults),media:[],mode:'TEST'});
await until(()=>queue.interventions.pending&&run.items.find(i=>i.id==='x').status==='dry_run');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1360,height:1000},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin);await page.locator('#android-progress[open]').waitFor();assert.match(await page.locator('.android-progress-note').innerText(),/browser posts can continue/i);
 await page.locator('#android-progress-hide').click();await page.locator('.run-pipeline').waitFor();assert.match(await page.locator('.run-pipeline').innerText(),/Browser[\s\S]*Needs attention[\s\S]*Phone[\s\S]*Your turn/);
 assert(await page.getByRole('button',{name:'Pause',exact:true}).isVisible());
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Resume',exact:true}).waitFor();assert(queue.interventions.pending);await page.getByRole('button',{name:'Resume',exact:true}).click();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
 await page.locator('[data-control-item="linkedin"]').click();await until(()=>run.items.find(i=>i.id==='linkedin').status==='dry_run');
 assert.equal(calls.filter(i=>i==='linkedin').length,2);assert.equal(calls.filter(i=>i==='x').length,1);assert(queue.interventions.pending);assert(!run.finishedAt);
 await fs.mkdir('test-results/pipeline',{recursive:true});await page.screenshot({path:'test-results/pipeline/desktop.png'});
 await page.setViewportSize({width:390,height:844});assert(await page.locator('.run-pipeline').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/pipeline/mobile.png'});
 await page.locator('[data-native-open]').click();await page.locator('#android-progress[open]').waitFor();await page.locator('[data-native-action="check"]').click();await page.locator('[data-native-action="continue"]').click();await until(()=>!queue.processing);
 assert.equal(run.status,'completed');assert(run.items.every(i=>i.status==='dry_run'&&!i.submitting));assert.equal(calls.filter(i=>i==='instagram').length,1);assert.equal(calls.filter(i=>i==='instagramStory').length,1);assert(run.finishedAt);assert.deepEqual(errors,[]);
 console.log('Pipeline UI passed: concurrent lane status, scoped browser continuation during manual song selection, mobile layout, one-song handoff and completion timing. No publishing or phone commands.');
}finally{
 if(queue.active)await queue.control('kill',queue.active.id);await until(()=>!queue.processing);await browser.close();await queue.persistChain;await phoneTools.close();await manualRecoveryHelp.close();server.closeAllConnections();await new Promise(r=>server.close(r));
 assert.equal(path.dirname(dataDir),path.resolve(os.tmpdir()));assert(path.basename(dataDir).startsWith('studio-pipeline-ui-'));await fs.rm(dataDir,{recursive:true,force:true});
}
