// Copyright (c) 2026 Mrinal. Verified Story-viewer handoff fixtures; all native controls are simulated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AndroidSession,nativeId} from '../server/automation/android-native.js';
import {InstagramAndroidWorker} from '../server/automation/instagram-android.js';
import {openRepost} from '../server/automation/native-repost.js';
import {InterventionError} from '../server/automation/utils.js';

const postUrl='https://www.instagram.com/p/VERIFIED123/';
const n=(id,extra={})=>({'resource-id':nativeId(id),package:'com.instagram.android',displayed:'true',text:'',...extra});
function viewerFixture({extraCurrentShare=false,changedShareLabel=false,addCount=1}={}){
  const calls=[],deepLinks=[],shareSelectors=[],shares=[],s=Object.create(AndroidSession.prototype);
  let surface='viewer',clipboard='',copies=0,additions=0,closed=0;
  const current=n('row_feed_button_share',{'content-desc':'Send post. Button.',bounds:'[0,80][50,130]',key:'current-share'});
  const viewer=[n('row_feed_profile_header'),n('row_feed_photo_profile_name',{text:'ours'}),current,
    ...(extraCurrentShare?[n('row_feed_button_share',{'content-desc':'Send post. Button.',bounds:'[60,80][110,130]',key:'duplicate-current-share'})]:[]),
    n('row_feed_profile_header'),n('row_feed_photo_profile_name',{text:'following-author'}),
    n('row_feed_button_share',{'content-desc':'Send post. Button.',bounds:'[0,400][50,450]',key:'following-share'})];
  const sheet=[n('button',{'content-desc':'Copy link',key:'copy-link'}),...Array.from({length:addCount},(_,i)=>n('button',{'content-desc':'Add to story',key:'add-story-'+i}))];
  const editor=[n('story_share_controls_action_bar'),n('camera_photo_texture_view')];
  const screen=()=>surface==='viewer'?viewer:surface==='sheet'?sheet:editor;
  s.screen=async()=>screen();
  s.until=async(predicate,message)=>{const result=await predicate(screen());if(!result)throw new InterventionError(message);return result;};
  s.screenshot=async()=>Buffer.from('simulated-native-preview');
  s.close=async()=>{closed++;};
  s.request=async(endpoint,method,body)=>{
    if(endpoint==='/execute/sync'){
      calls.push(body.script);
      if(body.script==='mobile: deepLink'){deepLinks.push(body.args[0].url);assert.equal(body.args[0].package,'com.instagram.android');surface='viewer';return;}
      if(body.script==='mobile: setClipboard'){clipboard=Buffer.from(body.args[0].content,'base64').toString('utf8');assert(clipboard.startsWith('studio-receipt:'));return;}
      if(body.script==='mobile: getClipboard')return Buffer.from(clipboard).toString('base64');
      assert.fail('Unexpected execution command: '+body.script);
    }
    if(endpoint==='/elements'){
      let matches;
      if(body.value.includes('row_feed_button_share')){
        shareSelectors.push(body);
        matches=screen().filter(node=>node['resource-id']===nativeId('row_feed_button_share')&&(!body.value.includes('@bounds=')||body.value.includes(node.bounds)));
      }else if(body.value.includes('Copy link'))matches=screen().filter(node=>node['content-desc']==='Copy link');
      else if(body.value.includes('Add to story'))matches=screen().filter(node=>node['content-desc']==='Add to story');
      else assert.fail('Unexpected selector: '+body.value);
      return matches.map(node=>({'element-6066-11e4-a52e-4f735466cecf':node.key}));
    }
    const attribute=endpoint.match(/^\/element\/([^/]+)\/attribute\/(text|content-desc)$/);
    if(attribute){const node=screen().find(node=>node.key===attribute[1]);assert(node);return changedShareLabel&&node.key==='current-share'&&attribute[2]==='content-desc'?'Share elsewhere':node[attribute[2]];}
    const click=endpoint.match(/^\/element\/([^/]+)\/click$/);
    if(click){
      calls.push(click[1]);
      if(click[1].endsWith('share')){assert.equal(surface,'viewer');shares.push(click[1]);surface='sheet';return;}
      if(click[1]==='copy-link'){assert.equal(surface,'sheet');copies++;clipboard=postUrl;surface='viewer';return;}
      if(click[1].startsWith('add-story-')){assert.equal(surface,'sheet');additions++;surface='editor';return;}
    }
    assert.fail('Unexpected native request: '+endpoint);
  };
  return {s,calls,deepLinks,shareSelectors,shares,copies:()=>copies,additions:()=>additions,closed:()=>closed};
}
const context=()=>({id:'instagramStory',runId:'run-a',mode:'LIVE',continueInstagramStory:true,signal:new AbortController().signal,
  instagram:{music:{enabled:false},story:{sourcePostUrl:postUrl,linkEnabled:false}},config:{platforms:{instagram:{handle:'ours'}}},
  recordPreparation:async()=>{},snapshot:async()=>{},step:async message=>{if(message.startsWith('Applying the reviewed shared-post'))throw Error('Fixture reached Story layout boundary');}});
function storyWorker(f){const worker=new InstagramAndroidWorker({dataDir:'unused-story-handoff-fixture'});worker.s=f.s;worker.busy=true;worker.openForRun=async()=>f.s;return worker;}

test('explicit current-viewer reuse scopes Share to the verified post and never navigates or copies a link',async()=>{
  const f=viewerFixture();
  assert.equal(await openRepost(f.s,postUrl,{reuseCurrent:true}),postUrl);
  assert.deepEqual(f.deepLinks,[]);assert.equal(f.copies(),0);assert.deepEqual(f.shares,['current-share']);assert.equal(f.additions(),1);
  assert.equal(f.shareSelectors.length,1);assert.equal(f.shareSelectors[0].using,'xpath');
  assert(f.shareSelectors[0].value.includes('@bounds='));assert(f.shareSelectors[0].value.includes('[0,80][50,130]'));
  assert(!f.calls.includes('following-share'));assert(!f.calls.some(call=>call.includes('Clipboard')));
});

test('Story source without explicit current-viewer reuse navigates to its canonical exact URL',async()=>{
  const f=viewerFixture();
  await openRepost(f.s,postUrl+'?igsh=tracking');
  assert.deepEqual(f.deepLinks,[postUrl]);assert.equal(f.copies(),0);assert.equal(f.additions(),1);
  const invalid=viewerFixture();await assert.rejects(openRepost(invalid.s,'https://example.com/p/WRONG/',{reuseCurrent:true}),/exact published Instagram post URL/);
  assert.deepEqual(invalid.calls,[]);
});

test('current-viewer reuse still rejects ambiguous or changed Share and missing or duplicate Add to story controls',async t=>{
  for(const [name,options,message] of [
    ['duplicate Share',{extraCurrentShare:true},/sharing control is ambiguous/],
    ['changed Share label',{changedShareLabel:true},/sharing control changed/],
    ['missing Add to story',{addCount:0},/cannot be shared to a Story/],
    ['duplicate Add to story',{addCount:2},/matched 2 controls/]
  ])await t.test(name,async()=>{
    const f=viewerFixture(options);await assert.rejects(openRepost(f.s,postUrl,{reuseCurrent:true}),message);
    assert.deepEqual(f.deepLinks,[]);assert.equal(f.copies(),0);assert.equal(f.additions(),0);assert(!f.calls.includes('following-share'));
  });
});

test('a standalone Story verifies and copies its source once, then reuses that same viewer without another deep link',async()=>{
  const f=viewerFixture(),worker=storyWorker(f),ctx=context();
  await assert.rejects(worker.run(ctx),/Story layout boundary/);
  assert.deepEqual(f.deepLinks,[postUrl]);assert.equal(f.copies(),1);
  assert.deepEqual(f.shares,['current-share','current-share']);assert.equal(f.additions(),1);assert.equal(f.closed(),1);
});

test('retained Story sessions reuse only a receipt that explicitly confirms the current viewer',async t=>{
  for(const currentViewer of [true,false])await t.test(String(currentViewer),async()=>{
    const f=viewerFixture(),worker=storyWorker(f),ctx=context();
    worker.verifyPost=async()=>assert.fail('A matching confirmed feed handoff must not copy its receipt again');
    assert(worker.retainForStory(ctx,'posted',{postUrl},currentViewer));assert.equal(worker.handoff.currentViewer,currentViewer);
    await assert.rejects(worker.run(ctx),/Story layout boundary/);
    assert.deepEqual(f.deepLinks,currentViewer?[]:[postUrl]);assert.equal(f.copies(),0);
    assert.deepEqual(f.shares,['current-share']);assert.equal(f.additions(),1);assert.equal(f.closed(),1);assert.equal(worker.handoff,null);
  });
});

test('a retained native viewer is released before Story when its run, account or exact post changes',async t=>{
  for(const [name,change,url] of [
    ['run',{runId:'run-b'},postUrl],
    ['account',{config:{platforms:{instagram:{handle:'other'}}}},postUrl],
    ['post',{},'https://www.instagram.com/p/OTHER123/']
  ])await t.test(name,async()=>{
    const f=viewerFixture(),worker=storyWorker(f),ctx=context();assert(worker.retainForStory(ctx,'posted',{postUrl},true));
    await assert.rejects(worker.openStory({...ctx,...change},url),/handoff changed/);
    assert.deepEqual(f.calls,[]);assert.equal(f.closed(),1);assert.equal(worker.handoff,null);assert.equal(worker.busy,false);
  });
});

test('TEST rehearsals, unconfirmed posts and aborted contexts never retain a native viewer',()=>{
  for(const [change,status,publication] of [
    [{mode:'TEST'},'dry_run',{postUrl}],
    [{},'posted',{candidates:[postUrl]}],
    [{continueInstagramStory:false},'posted',{postUrl}],
    [{runId:undefined},'posted',{postUrl}],
    [{signal:AbortSignal.abort()},'posted',{postUrl}]
  ]){
    const worker=new InstagramAndroidWorker({dataDir:'unused-story-handoff-fixture'});
    assert.equal(worker.retainForStory({...context(),...change},status,publication,true),false);assert.equal(worker.handoff,undefined);
  }
});