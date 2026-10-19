// Copyright (c) 2026 Mrinal. Offline fixtures only; never posts to Instagram.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {DEFAULT_STORY_LAYOUT,instagramOptions,storyErrors,importStory} from '../shared/instagram.js';
import {validateDraft} from '../shared/platforms.js';
import {destinationReadiness} from '../shared/readiness.js';
import {Queue} from '../server/queue.js';
import {defaults} from '../server/config.js';
import {createApp} from '../server/index.js';
import {InstagramAndroidWorker} from '../server/automation/instagram-android.js';
import {AndroidSession,nativeId,nativeNodes,xpathLiteral} from '../server/automation/android-native.js';
import {musicResults} from '../server/automation/native-music.js';
const selection={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',key:'1072827201597383',title:'altitude (higher purpose)',artist:'Uppermost',query:'Uppermost altitude',account:'goclasses_cse',durationSeconds:30};
const options=()=>({music:{enabled:true,selection},story:{enabled:true,url:'https://www.goclasses.in/apply',label:'Application Form',sourcePostUrl:'',layout:structuredClone(DEFAULT_STORY_LAYOUT)}});
const browser={page:async()=>({isClosed:()=>true,close:async()=>{}})};
const waitFor=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Queue did not settle');};
test('repost Story requires a song, exact source dependency, valid link and bounded layout',()=>{
  const value=options();assert.equal(instagramOptions(value).story.label,'Application Form');
  assert.deepEqual(storyErrors(value.story,['instagram','instagramStory']),[]);
  assert(storyErrors(value.story,['instagramStory']).some(e=>e.includes('exact published URL')));
  value.story.sourcePostUrl='https://www.instagram.com/p/ABC123/';
  assert.deepEqual(storyErrors(value.story,['instagramStory']),[]);
  assert(storyErrors(value.story,['instagram','instagramStory']).some(e=>e.includes('clear')));
  value.story.url='javascript:alert(1)';value.story.label='x'.repeat(21);value.story.layout.link.y=1;
  assert.equal(storyErrors(value.story,['instagramStory']).length,3);
  assert.throws(()=>instagramOptions({music:{enabled:true,selection:{id:'fake'}}}),/choose a song/);
});
test('a blocked optional Story does not block a feed-only review',()=>{
  const value=options();delete value.music.selection;value.music.enabled=false;
  const draft={selected:['instagram'],captions:{instagram:'Hello'},instagram:value,mediaIds:['image']};
  assert.deepEqual(validateDraft(draft,[{id:'image'}]),[]);
  assert(destinationReadiness({...draft,selected:['instagram','instagramStory']},[{id:'image'}],{platforms:{instagram:{handle:'goclasses_cse'}}}).instagramStory.errors.length);
});
test('Story caption import clears stale options and keeps a named application link',()=>{
  const value=importStory({instagramStory:'Application Form\nhttps://www.goclasses.in/apply'});
  assert.equal(value.url,'https://www.goclasses.in/apply');assert.equal(value.label,'Application Form');assert(value.enabled);
  assert.equal(importStory({}).enabled,false);assert.equal(importStory({}).url,'');
});
test('native catalogue parsing uses real track IDs and rejects incomplete rows',()=>{
  const xml='<node class="android.view.View" resource-id="audio_browser_track_0_123" displayed="true"/>'+Array.from({length:9},()=>'<node class="android.view.View"/>').join('')+'<node class="android.widget.TextView" resource-id="com.instagram.android:id/song_title" text="A &amp; B"/><node class="android.widget.TextView" resource-id="com.instagram.android:id/artist_name" text="Artist \u2022 3:44"/>';
  const list=musicResults(nativeNodes(xml));assert.equal(list[0].key,'123');assert.equal(list[0].title,'A & B');assert.equal(list[0].artist,'Artist');
  assert.deepEqual(musicResults(nativeNodes(xml.replace('Artist \u2022 3:44','Loading'))),[]);
  assert.equal(xpathLiteral('a"b\'c'),"concat(\"a\", '\"', \"b'c\")");
});
test('music manifests are issued by this worker and scoped to its Instagram account',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-music-'));
  try{const worker=new InstagramAndroidWorker({dataDir:dir});await worker.init();worker.selections=[selection];
    assert.throws(()=>worker.selection(selection,'different_account'),/Choose/);
    assert.throws(()=>worker.selection({id:'unknown'},selection.account),/Choose/);
    assert.equal(worker.selection({...selection,title:'Forged title'},selection.account).title,selection.title);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Story follows the feed, inherits its exact permalink and freezes reviewed options',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-story-queue-')),calls=[];
  try{const queue=new Queue(browser,{dataDir:dir,runner:async ctx=>{
    calls.push(ctx.id);
    if(ctx.id==='instagram')return {status:'posted',publication:{postUrl:'https://www.instagram.com/p/EXACT123/'}};
    assert.equal(ctx.instagramPublication.postUrl,'https://www.instagram.com/p/EXACT123/');assert.equal(ctx.instagram.story.label,'Application Form');return 'dry_run';
  }});await queue.init();
  const instagram=options();const run=await queue.start({draft:{selected:['instagramStory','instagram'],captions:{instagram:'Hello'},instagram},config:defaults,media:[]});
  instagram.story.label='changed';await waitFor(()=>run.status==='completed'&&!queue.processing);await queue.persistChain;
  assert.deepEqual(calls,['instagram','instagramStory']);assert.equal(run.instagram.story.label,'Application Form');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('HTTP Story-only retries reuse the source post and cannot republish the successful feed',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-story-http-'));await fs.writeFile(path.join(dir,'instagram-music.json'),JSON.stringify([selection]));
  const config=structuredClone(defaults);config.platforms.instagram.handle=selection.account;await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));
  const calls=[];const {app,queue}=await createApp({dataDir:dir,browser,queueOptions:{instagramWorker:{busy:false,checkAccount:async()=>{}},runner:async ctx=>{calls.push(ctx.id);return 'dry_run';}}});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  const post=(url,body)=>fetch(origin+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    const instagram=options();instagram.music.enabled=false;instagram.story.sourcePostUrl='https://www.instagram.com/p/EXACT123/';
    const bad=await post('/api/runs',{draft:{selected:['instagramStory'],captions:{},mediaIds:[],instagram:{...instagram,music:{selection:{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}}}},mode:'TEST'});
    assert.equal(bad.status,400);assert.match((await bad.json()).error,/Choose the Instagram song again/);
    queue.runs=[{id:'original',status:'completed_with_errors',mode:'LIVE',captions:{instagram:'Already published'},media:[],mediaByPlatform:{instagram:[],instagramStory:[]},instagram,items:[{id:'instagram',status:'posted',publication:{postUrl:instagram.story.sourcePostUrl}},{id:'instagramStory',status:'failed'}]}];
    const response=await post('/api/runs/original/retry',{platform:'instagramStory',mode:'TEST'});assert.equal(response.status,201);
    await waitFor(()=>queue.runs[0].status==='completed'&&!queue.processing);await queue.persistChain;assert.deepEqual(calls,['instagramStory']);assert.equal(queue.runs[0].sourceInstagramPublication.postUrl,instagram.story.sourcePostUrl);
  }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});

test('native account preflight blocks every destination before a single runner executes',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-native-preflight-'));let calls=0;
  try{
    const queue=new Queue(browser,{dataDir:dir,instagramWorker:{busy:false,checkAccount:async()=>{throw Error('Android session expired');}},runner:async()=>{calls++;return 'posted';}});
    await queue.init();const run=await queue.start({draft:{selected:['x','instagramStory'],captions:{x:'Hello'},instagram:options()},config:defaults,media:[],mode:'LIVE',confirmation:'POST'});
    await waitFor(()=>run.status==='attention'&&!queue.processing);assert.equal(calls,0);assert.equal(run.items[0].status,'queued');assert.equal(run.items[1].status,'attention');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('a failed new feed never hands an older source permalink to Story',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-story-dependency-'));let source='not called';
  try{
    const queue=new Queue(browser,{dataDir:dir,runner:async ctx=>{if(ctx.id==='instagram')throw Error('Feed preparation failed');source=ctx.instagramPublication;throw Error('No new feed reference');}});
    await queue.init();const run=await queue.start({draft:{selected:['instagram','instagramStory'],captions:{instagram:'New'},instagram:options()},config:defaults,media:[],sourceInstagramPublication:{postUrl:'https://www.instagram.com/p/OLD/'}});
    await waitFor(()=>run.status==='completed_with_errors'&&!queue.processing);assert.equal(source,undefined);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('unrelated Story edits cannot unlock a matching uncertain feed or a failed automatic Story',()=>{
  const original=options(),media=[{id:'image-a'}],captions={instagram:'A reviewed post',instagramStory:''};
  const run={captions,instagram:structuredClone(original),media,mediaByPlatform:{instagram:['image-a'],instagramStory:[]},items:[{id:'instagram',status:'uncertain',message:'Verify outcome'},{id:'instagramStory',status:'failed',message:'Fix Story'}]};
  const config={platforms:{instagram:{handle:selection.account}}};
  const draft={selected:['instagram','instagramStory'],captions:{...captions},mediaIds:['image-a'],instagram:structuredClone(original)};
  let ready=destinationReadiness(draft,media,config,{},undefined,[run]);
  assert(ready.instagram.errors.some(e=>e.includes('Last attempt')));
  assert(ready.instagramStory.errors.some(e=>e.includes('Last attempt')));
  draft.instagram.story.label='Read more';
  draft.instagram.music.selection={...selection,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
  ready=destinationReadiness(draft,media,config,{},undefined,[run]);
  assert(ready.instagram.errors.some(e=>e.includes('Last attempt')),'Story changes and reselecting the same song do not unlock a feed retry');
  draft.instagram=structuredClone(original);draft.captions.instagram='A new announcement';draft.mediaIds=['image-b'];
  ready=destinationReadiness(draft,[{id:'image-b'}],config,{},undefined,[run]);
  assert(!ready.instagramStory.errors.some(e=>e.includes('Last attempt')),'A new parent post has a separate Story');
});

test('native account checks ignore hidden views and preserve visible user drafts',async()=>{
  const node=(name,extra={})=>({'resource-id':nativeId(name),displayed:'true',...extra});
  const profile=[node('profile_header_create_button'),node('profile_tab'),node('action_bar_title',{text:selection.account})];
  const make=initial=>{let nodes=initial;const calls=[],s=Object.create(AndroidSession.prototype);s.activate=async()=>{};s.screen=async()=>nodes;s.clickId=async name=>{calls.push(name);};s.request=async path=>{assert.equal(path,'/back');calls.push('back');nodes=profile;};return {s,calls};};
  let fixture=make([...profile,node('story_share_controls_action_bar',{displayed:'false'})]);await fixture.s.account(selection.account);assert.deepEqual(fixture.calls,['profile_tab']);
  fixture=make([node('story_share_controls_action_bar'),node('direct_external_share_container_view',{displayed:'false'})]);await assert.rejects(fixture.s.account(selection.account),/Close the unsent/);assert.deepEqual(fixture.calls,[]);
  fixture=make([node('direct_external_share_container_view'),node('row_search_edit_text',{class:'android.widget.EditText',text:'Search...'})]);await fixture.s.account(selection.account);assert.deepEqual(fixture.calls,['back','profile_tab']);
  fixture=make([node('music_browser_container')]);await assert.rejects(fixture.s.account(selection.account),/Close the unsent/);assert.deepEqual(fixture.calls,[]);
});
