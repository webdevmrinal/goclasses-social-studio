// Copyright (c) 2026 Mrinal. Offline queue fixtures; no platform sessions or publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Queue} from '../server/queue.js';
import {defaults} from '../server/config.js';
import {publicationUrl} from '../server/automation/publication.js';

const postUrl='https://www.instagram.com/p/EXISTING123/';
const browser={page:async()=>({isClosed:()=>true})};
const config=structuredClone(defaults);config.platforms.instagram.handle='ours';
const params=(selected=['instagram','instagramStory','x'],postingMethod='android')=>({
  draft:{selected,captions:{instagram:'Reviewed feed caption',x:'Reviewed next caption'},instagram:{postingMethod,music:{enabled:false},story:{enabled:true,sourcePostUrl:''}}},
  config,media:[]
});
const worker=()=>({busy:false,preflight:null,closed:0,async checkAccount(config,{runId}={}){if(runId)this.preflight={runId};},async close(){this.closed++;this.preflight=null;}});
const settled=async queue=>{
  const end=Date.now()+5000;
  while(queue.processing){if(Date.now()>end)assert.fail('Queue did not settle');await new Promise(resolve=>setTimeout(resolve,10));}
  await queue.persistChain;
};
async function fixture(t,options={}){
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-android-queue-'));
  const queue=new Queue(browser,{dataDir,...options}),workerErrors=[];
  queue.on('workerError',error=>workerErrors.push(error));
  await queue.init();
  t.after(async()=>{
    await queue.persistChain;
    assert.deepEqual(workerErrors,[]);
    assert.equal(path.dirname(dataDir),path.resolve(os.tmpdir()));
    assert(path.basename(dataDir).startsWith('mrinal-android-queue-'));
    await fs.rm(dataDir,{recursive:true,force:true});
  });
  return queue;
}
function priorPost(queue){
  queue.runs.push({id:'prior-confirmed-feed',mode:'LIVE',status:'completed',config,items:[{id:'instagram',status:'posted',publication:{postUrl}}]});
}

test('generic native preparation errors pause TEST and LIVE before Story or another destination',async t=>{
  for(const mode of ['TEST','LIVE'])await t.test(mode,async t=>{
    const calls=[],native=worker(),message='Timed out after 30000ms waiting for root AccessibilityNodeInfo';
    const queue=await fixture(t,{instagramWorker:native,runner:async ctx=>{
      calls.push(ctx.id);
      await ctx.recordPreparation({stage:'opening_music'});
      await ctx.step('Opening music');
      throw Error('\u001b[31m'+message+'\u001b[0m');
    }});
    const reviewed=params(),run=await queue.start({...reviewed,mode,...(mode==='LIVE'?{confirmation:'POST'}:{})});
    await settled(queue);
    assert.equal(run.status,'attention');assert.deepEqual(calls,['instagram']);
    assert.deepEqual(run.items.map(item=>item.status),['attention','queued','queued']);
    assert.equal(run.items[0].submitting,false);
    assert.equal(run.items[0].message,message);assert.equal(run.items[0].failureMessage,message);
    assert.match(run.items[0].recoveryMessage,/unfinished draft/);
    assert.equal(native.closed,1);assert.equal(native.preflight,null);
    assert.deepEqual(run.captions,reviewed.draft.captions);assert.deepEqual(run.instagram,reviewed.draft.instagram);
    await assert.rejects(queue.start(params(['x'])),/already active/);
  });
});

test('Continue preserves the first native failure and restart leaves only that destination retryable',async t=>{
  let checks=0;const calls=[],native=worker();
  native.checkAccount=async()=>{if(++checks>1)throw Error('Close the unsent Instagram Android draft before continuing.');};
  const queue=await fixture(t,{instagramWorker:native,runner:async ctx=>{calls.push(ctx.id);throw Error('The native music library could not read its accessibility root.');}});
  const reviewed=params(),run=await queue.start(reviewed);await settled(queue);
  const firstFailure=run.items[0].message;
  await queue.control('continue');await settled(queue);
  assert.equal(run.status,'attention');assert.deepEqual(calls,['instagram']);
  assert.equal(run.items[0].message,firstFailure);assert.equal(run.items[0].failureMessage,firstFailure);
  assert.match(run.items[0].recoveryMessage,/Close the unsent/);

  const restartCalls=[],restarted=new Queue(browser,{dataDir:queue.dataDir,instagramWorker:worker(),runner:async ctx=>{restartCalls.push(ctx.id);return 'dry_run';}});
  await restarted.init();
  const interrupted=restarted.runs.find(item=>item.id===run.id);
  assert.equal(interrupted.status,'interrupted');assert.equal(interrupted.confirmedLive,false);
  assert.deepEqual(interrupted.items.map(item=>item.status),['failed','skipped','skipped']);
  assert.match(interrupted.items[0].message,/accessibility root/);
  assert.match(interrupted.items[0].message,/Retry only this failed destination/);
  assert.match(interrupted.items[0].recoveryMessage,/Close the unsent/);
  assert.deepEqual(restartCalls,[]);
  const retry=await restarted.start({...reviewed,draft:{...reviewed.draft,selected:['instagram']},retryOf:run.id});await settled(restarted);
  assert.equal(retry.status,'completed');assert.deepEqual(restartCalls,['instagram']);
  assert.equal(retry.retryOf,run.id);assert.deepEqual(retry.captions,reviewed.draft.captions);assert.deepEqual(retry.instagram,reviewed.draft.instagram);
});

test('a failed web feed cannot bypass its Story dependency through TEST source reuse',async t=>{
  const calls=[],queue=await fixture(t,{instagramWorker:worker(),runner:async ctx=>{calls.push(ctx.id);if(ctx.id==='instagram')throw Error('Feed preparation failed');return 'dry_run';}});
  priorPost(queue);
  const run=await queue.start({...params(undefined,'web'),sourceInstagramPublication:{postUrl}});await settled(queue);
  assert.equal(run.status,'attention');assert.deepEqual(calls,['instagram']);
  assert.deepEqual(run.items.map(item=>item.status),['failed','attention','queued']);
  assert.match(run.items[1].message,/feed did not finish successfully/);
  assert.equal(run.items[1].submitting,false);assert.equal(queue.testInstagramPublication(run),undefined);
  await queue.control('continue');await settled(queue);
  assert.equal(run.status,'attention');assert.deepEqual(calls,['instagram']);
});

test('a successful TEST feed still rehearses Story with its confirmed same-account source',async t=>{
  const calls=[],queue=await fixture(t,{instagramWorker:worker(),runner:async ctx=>{
    calls.push(ctx.id);assert.equal(ctx.mode,'TEST');
    if(ctx.id==='instagram')assert.equal(ctx.continueInstagramStory,true);
    if(ctx.id==='instagramStory'){assert.equal(ctx.instagramPublication,undefined);assert.equal(ctx.instagramTestPublication.postUrl,postUrl);}
    return 'dry_run';
  }});
  priorPost(queue);
  const run=await queue.start(params());await settled(queue);
  assert.equal(run.status,'completed');assert.deepEqual(calls,['instagram','instagramStory','x']);
  assert(run.items.every(item=>item.status==='dry_run'&&!item.submitting));
});

test('native errors after submitting stay uncertain and never retry the feed or run its Story',async t=>{
  const calls=[],queue=await fixture(t,{instagramWorker:worker(),runner:async ctx=>{
    calls.push(ctx.id);await ctx.markSubmitting();throw Error('Android disconnected after Share');
  }});
  priorPost(queue);
  const run=await queue.start({...params(),mode:'LIVE',confirmation:'POST'});await settled(queue);
  assert.equal(run.status,'attention');assert.deepEqual(calls,['instagram']);
  assert.deepEqual(run.items.map(item=>item.status),['uncertain','attention','queued']);
  assert.equal(run.items[0].submitting,true);assert.match(run.items[0].message,/Publication may have occurred/);
  assert.equal(queue.testInstagramPublication({...run,mode:'TEST'}),undefined);
  await queue.control('continue');await settled(queue);
  assert.deepEqual(calls,['instagram']);assert.equal(run.items[0].status,'uncertain');
  const restarted=new Queue(browser,{dataDir:queue.dataDir,runner:async()=>assert.fail('Restart must never publish')});await restarted.init();
  assert.equal(restarted.runs[0].items[0].status,'uncertain');
  assert.equal(restarted.runs[0].items[0].submitting,true);assert.equal(restarted.runs[0].confirmedLive,false);
});

test('a generic Story preparation failure preserves the posted feed and permits only a Story retry after restart',async t=>{
  const calls=[],queue=await fixture(t,{instagramWorker:worker(),runner:async ctx=>{
    calls.push(ctx.id);if(ctx.id==='instagram')return {status:'posted',publication:{postUrl}};
    throw Error('Native Story placement driver failed');
  }});
  const reviewed=params(),run=await queue.start({...reviewed,mode:'LIVE',confirmation:'POST'});await settled(queue);
  assert.equal(run.status,'attention');assert.deepEqual(calls,['instagram','instagramStory']);
  assert.deepEqual(run.items.map(item=>item.status),['posted','attention','queued']);
  const retryCalls=[],restarted=new Queue(browser,{dataDir:queue.dataDir,instagramWorker:worker(),runner:async ctx=>{retryCalls.push(ctx.id);assert.equal(ctx.instagramPublication.postUrl,postUrl);return 'dry_run';}});
  await restarted.init();const original=restarted.runs[0];
  assert.deepEqual(original.items.map(item=>item.status),['posted','failed','skipped']);
  const retry=await restarted.start({...reviewed,draft:{...reviewed.draft,selected:['instagramStory']},sourceInstagramPublication:original.items[0].publication,retryOf:run.id});await settled(restarted);
  assert.equal(retry.status,'completed');assert.deepEqual(retryCalls,['instagramStory']);
  assert.equal(original.items[0].publication.postUrl,postUrl);assert.deepEqual(retry.instagram,reviewed.draft.instagram);
});

test('an unrelated web failure keeps the existing queue behavior when there is no dependent Story',async t=>{
  const calls=[],queue=await fixture(t,{runner:async ctx=>{calls.push(ctx.id);if(ctx.id==='x')throw Error('Web preparation failed');return 'dry_run';}});
  const run=await queue.start(params(['x','linkedin'],'web'));await settled(queue);
  assert.equal(run.status,'completed_with_errors');assert.deepEqual(calls,['x','linkedin']);
  assert.deepEqual(run.items.map(item=>item.status),['failed','dry_run']);
});
test('Instagram resolution proof accepts only absolute HTTPS feed permalinks and canonicalizes tracking links',()=>{
  assert.equal(publicationUrl('instagram','https://instagram.com/p/NEW_123-AB/?igsh=tracking#receipt'),'https://www.instagram.com/p/NEW_123-AB/');
  assert.equal(publicationUrl('instagram','https://www.instagram.com/p/EXACT123'),'https://www.instagram.com/p/EXACT123/');
  for(const link of [
    '/p/EXACT123/','//www.instagram.com/p/EXACT123/','javascript:alert(1)',
    'http://www.instagram.com/p/EXACT123/','https://www.instagram.com:444/p/EXACT123/',
    'https://user@www.instagram.com/p/EXACT123/','https://www.instagram.com.evil.example/p/EXACT123/',
    'https://example.com/p/EXACT123/','https://www.instagram.com/reel/EXACT123/',
    'https://www.instagram.com/ours/','https://www.instagram.com/ours/p/EXACT123/',
    'https://www.instagram.com/p/EXACT123/extra','https://www.instagram.com/p/'
  ])assert.equal(publicationUrl('instagram',link),null,link);
});

test('resolving an uncertain feed with its exact permalink continues Story and queued work without repeating the feed',async t=>{
  const calls=[],native=worker(),exact='https://www.instagram.com/p/NEW_123-AB/';
  const queue=await fixture(t,{instagramWorker:native,runner:async ctx=>{
    calls.push(ctx.id);
    if(ctx.id==='instagram'){await ctx.markSubmitting();throw Error('The exact new Instagram post could not be confirmed');}
    if(ctx.id==='instagramStory'){
      assert.equal(ctx.instagramPublication.postUrl,exact);
      assert.equal(ctx.instagramPublication.verifiedBy,'operator_confirmation');
      assert.equal(ctx.instagramTestPublication,undefined);
    }
    await ctx.markSubmitting();return 'posted';
  }});
  const reviewed=params(),run=await queue.start({...reviewed,mode:'LIVE',confirmation:'POST'});await settled(queue);
  assert.equal(run.status,'attention');assert.deepEqual(calls,['instagram']);
  assert.deepEqual(run.items.map(item=>item.status),['uncertain','attention','queued']);
  assert.equal(native.preflight,null);
  const uncertain=structuredClone(run.items[0]);
  for(const postUrl of ['https://example.com/p/WRONG/','/p/RELATIVE/','https://www.instagram.com/reel/WRONG/']){
    await assert.rejects(queue.resolve(run.id,'instagram','posted',{postUrl}),/native publication permalink/);
    assert.deepEqual(run.items[0],uncertain);
  }
  await queue.resolve(run.id,'instagram','posted',{
    postUrl:'https://instagram.com/p/NEW_123-AB/?igsh=tracking',
    verifiedBy:'read_only_recheck',verifiedAt:'forged-client-time',candidates:['https://www.instagram.com/p/OLD/']
  });
  assert.equal(run.status,'attention');assert.deepEqual(calls,['instagram']);
  assert.deepEqual(run.items.map(item=>item.status),['posted','attention','queued']);
  assert.equal(run.items[0].publication.postUrl,exact);
  assert.equal(run.items[0].publication.verifiedBy,'operator_confirmation');
  assert.notEqual(run.items[0].publication.verifiedAt,'forged-client-time');
  assert.equal(run.items[0].publication.candidates,undefined);
  assert.match(run.items[0].message,/operator confirmed this exact post link/);
  const persisted=JSON.parse(await fs.readFile(path.join(queue.dataDir,'runs.json'),'utf8'))[0];
  assert.equal(persisted.items[0].publication.postUrl,exact);assert.equal(persisted.items[0].status,'posted');
  await queue.control('continue');await settled(queue);
  assert.equal(run.status,'completed');assert.deepEqual(calls,['instagram','instagramStory','x']);
  assert(run.items.every(item=>item.status==='posted'));
  assert.deepEqual(run.captions,reviewed.draft.captions);assert.deepEqual(run.instagram,reviewed.draft.instagram);
  await queue.resolve(run.id,'instagram','posted',{postUrl:exact});
  assert.deepEqual(calls,['instagram','instagramStory','x']);
});