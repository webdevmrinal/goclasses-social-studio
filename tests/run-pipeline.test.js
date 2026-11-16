// Dependency and resource-lane fixtures. All publication actions are simulated.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {Queue} from '../server/queue.js';import {defaults} from '../server/config.js';
import {executionDependency} from '../shared/run-pipeline.js';import {InterventionError} from '../server/automation/utils.js';
const url='https://www.instagram.com/p/PIPELINE_EXACT/',song={key:'1234567890',title:'LOADED',artist:'Beast Inside Beats'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<500;i++){if(fn())return;await pause(5);}throw Error('Pipeline fixture did not settle');};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const params=(selected=['instagram','instagramStory','manychat','linkedin','x','youtubeDA','youtubeCS'])=>({draft:{selected,captions:{instagram:'Reviewed feed',linkedin:'Reviewed LinkedIn',x:'Reviewed X',manychat:'Apply here: https://example.org/apply'},instagram:{postingMethod:'web',music:{enabled:true,source:'manual'},story:{enabled:true,linkEnabled:false}},manychat:{postUrl:'',linksMode:'auto'}},config:structuredClone(defaults),media:[],mode:'LIVE',confirmation:'POST'});
async function fixture(t,runner){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-pipeline-'));
 const q=new Queue({page:async()=>({isClosed:()=>true})},{dataDir:dir,deadline:3000,runner,instagramWorker:{busy:false,checkAccount:async()=>{},close:async()=>{}}});
 q.on('workerError',e=>assert.fail(e));await q.init();
 t.after(async()=>{if(q.active)await q.control('kill',q.active.id);await until(()=>!q.processing);await q.persistChain;assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('studio-pipeline-'));await fs.rm(dir,{recursive:true,force:true});});
 return q;
}
test('browser destinations finish while the phone waits for a manual song; each resource has one job',async t=>{
 let web=0,native=0,maxWeb=0,maxNative=0,peak=0;const calls=[];
 const q=await fixture(t,async ctx=>{
  const phone=['instagramMusic','instagramStory'].includes(ctx.id);if(phone)maxNative=Math.max(maxNative,++native);else maxWeb=Math.max(maxWeb,++web);peak=Math.max(peak,native+web);calls.push(ctx.id);
  try{
   if(ctx.id==='instagram'){await ctx.markSubmitting();return {status:'posted',publication:{postUrl:url}};}
   if(ctx.id==='instagramMusic'){await ctx.intervene({kind:'music',instructions:'Preview only'},async()=>song);await ctx.markSubmitting();return {status:'posted',publication:{postUrl:url,music:song}};}
   if(ctx.id==='instagramStory'){assert.deepEqual(ctx.instagramMusicPublication.music,song);assert.equal(ctx.instagramPublication.postUrl,url);}
   if(ctx.id==='manychat')assert.equal(ctx.instagramPublication.postUrl,url);
   await ctx.markSubmitting();return 'posted';
  }finally{if(phone)native--;else web--;}
 });
 const run=await q.start(params());
 await until(()=>run.items.filter(i=>!['instagramMusic','instagramStory'].includes(i.id)).every(i=>i.status==='posted'));
 assert.equal(run.items.find(i=>i.id==='instagramMusic').status,'waiting_for_input');assert.equal(run.items.find(i=>i.id==='instagramStory').status,'queued');assert(q.processing);assert(!run.finishedAt);
 assert.equal(maxWeb,1);assert.equal(maxNative,1);assert.equal(peak,2);assert(calls.indexOf('manychat')>calls.indexOf('instagram'));
 const item=run.items.find(i=>i.id==='instagramMusic'),args={runId:run.id,itemId:item.id,id:item.intervention.id};
 const {review}=await q.interventions.act({...args,action:'check'});await q.interventions.act({...args,action:'continue',reviewId:review.id});
 await until(()=>!q.processing);assert.equal(run.status,'completed');assert(run.items.every(i=>i.status==='posted'));assert.equal(calls.filter(i=>i==='instagram').length,1);assert.equal(calls.filter(i=>i==='instagramStory').length,1);
 assert.equal(q.replyRotation.offset,3,'ManyChat reply rotation advances once despite concurrent status updates');
});
test('a browser error can be continued without losing the phone’s pending song review',async t=>{
 let linkedIn=0;const q=await fixture(t,async ctx=>{
  if(ctx.id==='instagram')return {status:'posted',publication:{postUrl:url}};
  if(ctx.id==='linkedin'&&linkedIn++===0)throw new InterventionError('Close the browser dialog');
  if(ctx.id==='instagramMusic')await ctx.intervene({kind:'music',instructions:'Preview only'},async()=>song);
  return {status:'posted',publication:{postUrl:url,music:song}};
 });
 const run=await q.start(params(['instagram','instagramStory','linkedin']));await until(()=>q.interventions.pending&&run.items.find(i=>i.id==='linkedin').status==='attention');const original=q.interventions.pending.intervention.id;
 await q.control('continue',run.id,'linkedin');await until(()=>run.items.find(i=>i.id==='linkedin').status==='posted');assert.equal(q.interventions.pending.intervention.id,original);
 const music=run.items.find(i=>i.id==='instagramMusic'),request={runId:run.id,itemId:music.id,id:original};const {review}=await q.interventions.act({...request,action:'check'});await q.interventions.act({...request,action:'continue',reviewId:review.id});await until(()=>!q.processing);assert.equal(run.status,'completed');
});
test('pausing the phone for a song does not pause the browser’s own timeout',async t=>{
 const q=await fixture(t,async ctx=>{
  if(ctx.id==='instagram')return {status:'posted',publication:{postUrl:url}};
  if(ctx.id==='instagramMusic')await ctx.intervene({kind:'music',instructions:'Preview only'},async()=>song);
  if(ctx.id==='x')await new Promise((resolve,reject)=>{if(ctx.signal.aborted)return reject(ctx.signal.reason);ctx.signal.addEventListener('abort',()=>reject(ctx.signal.reason),{once:true});});
  return {status:'posted',publication:{postUrl:url,music:song}};
 });
 q.deadline=75;q.nativeDeadline=150;q.browser.page=async()=>({isClosed:()=>true,close:async()=>{}});
 const run=await q.start(params(['instagram','instagramStory','x']));await until(()=>q.interventions.pending&&run.items.find(i=>i.id==='x').status==='failed');await pause(200);assert.equal(run.items.find(i=>i.id==='instagramMusic').status,'waiting_for_input');
 const item=run.items.find(i=>i.id==='instagramMusic'),request={runId:run.id,itemId:item.id,id:item.intervention.id};const {review}=await q.interventions.act({...request,action:'check'});await q.interventions.act({...request,action:'continue',reviewId:review.id});await until(()=>!q.processing);assert.equal(run.status,'completed_with_errors');assert.equal(run.items.find(i=>i.id==='instagramStory').status,'posted');
});
test('a phone preparation error holds its dependent Story while independent browser posts finish once',async t=>{
 const calls=[];let attempts=0;const q=await fixture(t,async ctx=>{
  calls.push(ctx.id);if(ctx.id==='instagram')return {status:'posted',publication:{postUrl:url}};
  if(ctx.id==='instagramMusic'&&attempts++===0)throw new InterventionError('Navigate back to Edit info');
  return {status:'posted',publication:{postUrl:url,music:song}};
 });
 const run=await q.start(params(['instagram','instagramStory','linkedin','x']));await until(()=>!q.processing);
 assert.equal(run.status,'attention');assert.equal(run.items.find(i=>i.id==='x').status,'posted');assert.equal(run.items.find(i=>i.id==='instagramStory').status,'queued');
 await q.control('continue',run.id,'instagramMusic');await until(()=>!q.processing);assert.equal(run.status,'completed');
 for(const id of ['instagram','instagramStory','linkedin','x'])assert.equal(calls.filter(v=>v===id).length,1);
});
test('a lost music-save response blocks Story and requires explicit verification and continuation',async t=>{
 let saves=0;const calls=[];const q=await fixture(t,async ctx=>{
  calls.push(ctx.id);if(ctx.id==='instagram')return {status:'posted',publication:{postUrl:url}};
  if(ctx.id==='instagramMusic'){await ctx.recordPreparation({music:song});await ctx.markSubmitting();saves++;throw Error('Lost Save response');}
  return 'posted';
 });
 const run=await q.start(params(['instagram','instagramStory','linkedin']));await until(()=>!q.processing);
 assert.equal(run.items.find(i=>i.id==='instagramMusic').status,'uncertain');assert.equal(run.items.find(i=>i.id==='linkedin').status,'posted');assert(run.items.find(i=>i.id==='instagramStory').dependencyBlocked);
 await assert.rejects(q.control('continue',run.id,'instagramStory'),/dependent step/);
 await q.resolve(run.id,'instagramMusic','posted');assert.equal(calls.filter(i=>i==='instagramStory').length,0);
 await q.control('continue',run.id,'instagramStory');await until(()=>!q.processing);assert.equal(run.status,'completed');assert.equal(saves,1);assert.equal(calls.filter(i=>i==='instagram').length,1);
});
test('Pause drains both current jobs, then Resume starts only the remaining work',async t=>{
 const gate=deferred(),calls=[];let started=0;const q=await fixture(t,async ctx=>{
  calls.push(ctx.id);if(ctx.id==='instagram')return {status:'posted',publication:{postUrl:url}};
  if(['instagramMusic','linkedin'].includes(ctx.id)){started++;await gate.promise;}
  return {status:'posted',publication:{postUrl:url,music:song}};
 });
 const run=await q.start(params(['instagram','instagramStory','linkedin','x']));await until(()=>started===2);await q.control('pause',run.id);gate.resolve();await until(()=>!q.processing);
 assert.equal(run.status,'paused');assert(!calls.includes('instagramStory'));assert(!calls.includes('x'));
 await q.control('resume',run.id);await until(()=>!q.processing);assert.equal(run.status,'completed');assert.equal(calls.filter(i=>i==='instagram').length,1);
});
test('Kill cancels both lanes and a pending song handoff before any new submission',async t=>{
 let webStarted=false,newSends=0;const calls=[];const q=await fixture(t,async ctx=>{
  calls.push(ctx.id);if(ctx.id==='instagram')return {status:'posted',publication:{postUrl:url}};
  if(ctx.id==='instagramMusic')await ctx.intervene({kind:'music',instructions:'Select only'},async()=>song);
  else{webStarted=true;await new Promise((resolve,reject)=>{if(ctx.signal.aborted)return reject(ctx.signal.reason);ctx.signal.addEventListener('abort',()=>reject(ctx.signal.reason),{once:true});});}
  await ctx.markSubmitting();newSends++;return 'posted';
 });
 const run=await q.start(params(['instagram','instagramStory','linkedin','x']));await until(()=>webStarted&&q.interventions.pending);await q.control('kill',run.id);await until(()=>!q.processing);
 assert.equal(run.status,'stopped');assert.equal(newSends,0);assert(!q.interventions.pending);assert(!calls.includes('instagramStory'));assert(!calls.includes('x'));
});
test('ManyChat depends on the confirmed feed receipt, never on its music job',()=>{
 const run={mode:'LIVE',instagram:{},manychat:{},items:[{id:'instagram',status:'posted',publication:{postUrl:url}},{id:'instagramMusic',status:'waiting_for_input'},{id:'manychat',status:'queued'}]};
 assert.equal(executionDependency(run,run.items[2]).state,'ready');run.items[0].status='uncertain';assert.equal(executionDependency(run,run.items[2]).state,'blocked');
});

test('an assisted ManyChat confirmation stays available during the phone song handoff',async t=>{
 const q=await fixture(t,async ctx=>{
  if(ctx.id==='instagramMusic')await ctx.intervene({kind:'music',instructions:'Preview only'},async()=>song);
  if(ctx.id==='manychat')return {manual:true};
  return {status:'posted',publication:{postUrl:url,music:song}};
 });
 q.snapshot=async()=>{};
 const run=await q.start(params(['instagram','instagramStory','manychat','linkedin']));
 await until(()=>q.interventions.pending&&run.items.find(i=>i.id==='manychat').status==='awaiting_manual');
 assert.equal(run.status,'waiting_for_input');const handoff=q.interventions.pending.intervention.id;
 await q.control('done',run.id);assert.equal(run.items.find(i=>i.id==='manychat').status,'posted');assert.equal(q.interventions.pending.intervention.id,handoff);
 const item=run.items.find(i=>i.id==='instagramMusic'),request={runId:run.id,itemId:item.id,id:handoff};const {review}=await q.interventions.act({...request,action:'check'});
 await q.interventions.act({...request,action:'continue',reviewId:review.id});await until(()=>!q.processing);assert.equal(run.status,'completed');
});
test('restart preserves both in-flight outcomes and never resumes either lane automatically',async t=>{
 const q=await fixture(t,async()=>assert.fail('No task may be dispatched on restart'));
 await fs.writeFile(path.join(q.dataDir,'runs.json'),JSON.stringify([{id:'interrupted-pipeline',mode:'LIVE',confirmedLive:true,status:'waiting_for_input',pipeline:{version:1},items:[{id:'instagram',status:'posted',publication:{postUrl:url}},{id:'instagramMusic',status:'waiting_for_input',submitting:false,intervention:{id:'expired'}},{id:'instagramStory',status:'queued'},{id:'linkedin',status:'running',submitting:true}]}]));
 const restarted=new Queue({}, {dataDir:q.dataDir,runner:()=>assert.fail('No automatic resend')});await restarted.init();const run=restarted.runs[0];
 assert.equal(run.status,'interrupted');assert.equal(run.confirmedLive,false);assert.equal(run.items[0].status,'posted');assert.equal(run.items[1].status,'failed');assert(!run.items[1].intervention);assert.equal(run.items[2].status,'skipped');assert.equal(run.items[3].status,'uncertain');
});
