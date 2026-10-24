// Copyright (c) 2026 Mrinal. Isolated recovery progress fixture: no model, native device or social site.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { defaults } from '../server/config.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const settings={enabled:true,automatic:true,configured:true,keySource:'local',message:'Automatic navigation is enabled.',apiKey:'FIXTURE_SECRET_NOT_FOR_DISPLAY'};
const snapshot={config:structuredClone(defaults),media:[],runs:[],login:{running:false,items:{}},workerBusy:false,phone:{devices:[],connected:false,scanning:false,mirror:{open:false}},capabilities:{instagramAndroid:true},navigationAI:settings,recovery:null};
const app=express();app.use(express.json());
let practiceCalls=0;const unexpected=[];
app.get('/api/session',(req,res)=>res.json({authenticated:true,protected:false}));
app.get(['/api/bootstrap','/api/status'],(req,res)=>res.json(snapshot));
app.get('/api/navigation-ai',(req,res)=>res.json(settings));
app.post('/api/navigation-ai/test',(req,res)=>{practiceCalls++;snapshot.workerBusy=true;snapshot.recovery={id:'fixture-practice',practice:true,status:'running',phase:'detected',problem:'A discard-selection dialog blocks the editor.',events:[{phase:'detected',message:'A dialog is blocking navigation.',at:new Date().toISOString()}]};res.status(202).json({id:snapshot.recovery.id});});
app.use('/api',(req,res)=>{unexpected.push(req.method+' '+req.path);res.status(404).json({error:'No fixture endpoint.'});});
app.use('/shared',express.static(path.join(root,'shared')));app.use('/vendor/webawesome',express.static(path.join(root,'node_modules/@awesome.me/webawesome/dist-cdn')));app.use(express.static(path.join(root,'client')));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:980},reducedMotion:'reduce'});
const pageErrors=[],external=[];page.on('pageerror',error=>pageErrors.push(error.message));
await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
await page.addInitScript(()=>{class FixtureEvents extends EventTarget{static OPEN=1;readyState=1;constructor(){super();window.__fixtureEvents=this;}close(){this.readyState=2;}}window.EventSource=FixtureEvents;window.__emitStatus=value=>window.__fixtureEvents.onmessage({data:JSON.stringify(value)});});
const emit=async()=>{await page.evaluate(value=>window.__emitStatus(value),snapshot);};
const panel=page.locator('[data-recovery-id="fixture-practice"]');
const update=async(phase,message,extra={})=>{Object.assign(snapshot.recovery,{phase,...extra});snapshot.recovery.events.push({phase,message,at:new Date().toISOString(),...(extra.fix?{fix:extra.fix}:{}),...(extra.action?{action:extra.action}:{}),...(extra.model?{model:extra.model}:{})});await emit();await page.waitForFunction(phase=>document.querySelector('[data-recovery-phase]')?.dataset.recoveryPhase===phase,phase);};
try{
 await page.goto(origin);await page.getByRole('heading',{name:'Connections',exact:true}).waitFor();
 await page.getByRole('button',{name:'Navigation help',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Try Gemini recovery',exact:true}).isEnabled(),true);
 assert.match(await page.locator('.navigation-practice').innerText(),/No social post.*API limits/);
 await page.getByRole('button',{name:'Try Gemini recovery',exact:true}).click();
 await page.getByRole('heading',{name:'Activity',exact:true}).waitFor();await panel.waitFor();
 assert.equal(practiceCalls,1);assert.equal(await page.locator('#modal').evaluate(el=>el.open),false);
 assert.equal(await panel.locator('[data-recovery-problem]').innerText(),'A discard-selection dialog blocks the editor.');
 assert.equal(await panel.locator('[data-recovery-api]').innerText(),'Waiting for a navigation check');
 assert.equal(await panel.locator('[data-action="recovery-test"]').count(),0,'Running practice cannot be restarted');
 await update('calling','Calling the selected model.',{model:'gemini-fixture'});
 assert.equal(await panel.locator('[data-recovery-api]').innerText(),'Calling Gemini · gemini-fixture');
 const malicious='<img src=x onerror="window.__xss=true">';
 await update('proposed','A safe recovery was suggested.',{fix:'Dismiss the stale dialog '+malicious,action:'Click the Discard button'});
 assert.equal(await panel.locator('[data-recovery-fix]').innerText(),'Dismiss the stale dialog '+malicious);assert.equal(await panel.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.__xss),undefined);
 assert.equal(await panel.locator('[data-recovery-api]').innerText(),'Gemini responded · gemini-fixture','Completed model work shows a completed request and its model');
 await update('executing','Clicking the exact discard control.',{action:'Click the Discard button'});
 assert.equal(await panel.locator('[data-recovery-action]').innerText(),'Click the Discard button');
 assert.equal(await panel.locator('[aria-current="step"]').innerText(),'Try');
 await update('verifying','Checking that the clean channel editor is visible.');
 assert.match(await panel.locator('[data-recovery-action]').innerText(),/Checking.*clean channel editor/);
 snapshot.workerBusy=false;await update('succeeded','Clean editor confirmed. No message was sent.',{status:'succeeded'});
 assert.equal(await panel.locator('[data-recovery-state]').innerText(),'Recovered');assert.equal(await panel.getByRole('button',{name:'Retry practice test',exact:true}).isEnabled(),true);
 assert.match(await panel.locator('.recovery-practice-footer').innerText(),/Practice only.*No social post/);
 assert.equal(await panel.locator('.recovery-log').getAttribute('open'),null,'Detailed history stays collapsed');
 await panel.locator('.recovery-log summary').click();assert.match(await panel.locator('.recovery-events').innerText(),/Calling Gemini/);assert.match(await panel.locator('.recovery-events').innerText(),/Click the Discard button/);
 assert.doesNotMatch(await page.locator('body').innerText(),/FIXTURE_SECRET/);
 // Completed recovery remains accessible when away from Activity.
 await page.getByRole('button',{name:'Connections',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Open recovery progress',exact:true}).count(),1);
 await page.getByRole('button',{name:'Open recovery progress',exact:true}).click();await panel.waitFor();
 // Unavailable models pause honestly, with the actual cooldown and no fake progress.
 await update('paused','Gemini is busy. Continue manually, or try again after the cooldown.',{status:'paused',fix:'',action:''});
 assert.match(await panel.locator('[data-recovery-action]').innerText(),/busy.*manually.*cooldown/);
 assert.equal(await panel.locator('[data-recovery-state]').innerText(),'Manual help needed');
 // Cached advice must never claim a new API call.
 snapshot.recovery.events=[{phase:'proposed',source:'cache',model:'gemini-fixture',message:'Using cached guidance. No API call was made.',fix:'Close the permitted stale dialog.'}];snapshot.recovery.phase='proposed';snapshot.recovery.fix='Close the permitted stale dialog.';await emit();
 assert.equal(await panel.locator('[data-recovery-api]').innerText(),'Cached Gemini fix · gemini-fixture (no new API call)');
 // A state update preserves the user's scroll position instead of pulling to the last run.
 snapshot.runs=Array.from({length:18},(_,index)=>({id:'old-'+index,createdAt:new Date().toISOString(),mode:'TEST',status:'completed',captions:{x:'Older fixture run '+index},items:[{id:'x',status:'dry_run',screenshots:[]}]}));await emit();await page.evaluate(()=>scrollTo(0,650));const y=await page.evaluate(()=>scrollY);assert(y>0);
 snapshot.recovery.action='Inspect the allowed control';await emit();assert(Math.abs(await page.evaluate(()=>scrollY)-y)<=1,'Recovery updates preserve scroll position');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Recovery fits a phone viewport');
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});assert(await panel.isVisible());
 await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/recovery-progress-ui.png'),fullPage:false});
 assert.deepEqual(pageErrors,[]);assert.deepEqual(external,[]);assert.deepEqual(unexpected,[]);assert.equal(practiceCalls,1);
 console.log('Recovery progress UI passed: actual phases, safe practice entry, offline/cache messages, escaping, key privacy, scroll and responsive layout.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
