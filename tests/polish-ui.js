// Copyright (c) 2026 Mrinal. Isolated UI fixture; no social actions or native sessions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {createApp} from '../server/index.js';
import {pngChunk} from '../server/image-metadata.js';
const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-polish-ui-'));
const {app,queue}=await createApp({dataDir,browser:{page:async()=>{throw Error('No social browser');}},queueOptions:{instagramWorker:{busy:false},runner:async()=>{throw Error('No publication');}}});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin);await page.getByRole('button',{name:'Compose',exact:true}).click();
 const png=await sharp({create:{width:700,height:700,channels:3,background:'#e5b37c'}}).png().toBuffer(),buffer=Buffer.concat([png.subarray(0,33),pngChunk('caBX',Buffer.from('jumb c2pa ChatGPT gpt-image')),png.subarray(33)]);
 await page.locator('#file-input').setInputFiles({name:'Fixture.png',mimeType:'image/png',buffer});await page.getByText('Image ready.',{exact:true}).waitFor();
 assert.equal(await page.locator('.dropzone>.metadata-chip').innerText(),'AI metadata');assert.equal(await page.locator('#editor-instagram .destination-image>.metadata-chip').innerText(),'AI metadata');
 await page.locator('.asset-tools>.clean-action').click();await page.locator('.dropzone>.metadata-chip').filter({hasText:'Clean'}).waitFor();assert.equal(await page.locator('.dropzone>.metadata-chip').innerText(),'Clean');
 const run=(i)=>({id:'fixture-'+i,createdAt:new Date().toISOString(),mode:'TEST',status:'completed_with_errors',captions:{x:'Run '+i},media:[],items:[{id:'x',status:'failed',message:'Fixture failure',screenshots:[]}]});queue.runs=Array.from({length:16},(_,i)=>run(i));queue.emit('change',queue.state());
 await page.getByRole('button',{name:'Activity',exact:true}).click();assert.equal(await page.evaluate(()=>scrollY),0);
 await page.evaluate(()=>scrollTo(0,1000));const before=await page.evaluate(()=>scrollY);queue.runs[0].items[0].message='A changed diagnostic';queue.emit('change',queue.state());await page.waitForTimeout(250);assert(Math.abs(await page.evaluate(()=>scrollY)-before)<3,'Activity keeps its viewport');
 const native={...run('native'),status:'running',instagram:{music:{enabled:true}},items:[{id:'instagram',status:'running',startedAt:new Date().toISOString(),message:'Transferring reviewed images...',screenshots:[]}]};queue.runs.unshift(native);queue.emit('change',queue.state());await page.locator('#android-progress').waitFor();assert.match(await page.locator('#android-step').innerText(),/Transferring/);
 await page.locator('#android-progress-hide').click();native.items[0].message='Loading the music editor...';queue.emit('change',queue.state());await page.waitForTimeout(200);assert.equal(await page.locator('#android-progress').isVisible(),false);await page.locator('#android-progress-pill').click();assert.match(await page.locator('#android-step').innerText(),/music editor/);
 await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/android-progress-light.png'});await page.locator('#android-progress-hide').click();
 native.status='completed';native.items[0].status='dry_run';queue.emit('change',queue.state());await page.locator('#android-progress-pill').waitFor({state:'detached'});
 await page.getByRole('button',{name:'Compose',exact:true}).click();await page.locator('[data-action="theme"]').click();await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/metadata-chip-dark-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Polish UI passed: prominent metadata chips and direct cleaning, stable Activity viewport, live Android progress with dismiss/reopen, responsive dark mode. No social actions.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));if(path.dirname(dataDir)===path.resolve(os.tmpdir())&&path.basename(dataDir).startsWith('mrinal-polish-ui-'))await fs.rm(dataDir,{recursive:true,force:true});}
