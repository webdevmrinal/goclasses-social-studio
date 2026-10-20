// Copyright (c) 2026 Mrinal. Local Story fixtures; no public actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {prepareStoryAudience,storyAudienceEvidence,discardStory} from '../server/automation/native-story.js';
import {openStoryMusicLibrary} from '../server/automation/native-music.js';
import {Queue} from '../server/queue.js';
import {defaults} from '../server/config.js';
import {InstagramAndroidWorker} from '../server/automation/instagram-android.js';
import {AndroidSession,nativeId,connectAndroidDriver} from '../server/automation/android-native.js';
import {DEFAULT_STORY_LAYOUT,snapStoryPosition,alignStoryItems} from '../shared/instagram.js';
const browser={page:async()=>({isClosed:()=>true})},postUrl='https://www.instagram.com/p/CONFIRMED123/';
const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Queue did not settle');};
const cleanup=async dir=>{if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('mrinal-story-flow-'))await fs.rm(dir,{recursive:true,force:true});};
test('Story follows its exact feed immediately, including web feed posts, before unrelated destinations',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-story-flow-')),calls=[];
 try{
  const queue=new Queue(browser,{dataDir:dir,runner:async ctx=>{calls.push(ctx.id);assert(ctx.runId);if(ctx.id==='instagram'){assert(ctx.continueInstagramStory);return {status:'posted',publication:{postUrl}};}if(ctx.id==='instagramStory')assert.equal(ctx.instagramPublication.postUrl,postUrl);return 'dry_run';}});await queue.init();
  const run=await queue.start({draft:{selected:['instagram','x','instagramStory','linkedin'],captions:{},instagram:{music:{enabled:false}}},config:defaults,media:[]});
  await wait(()=>run.status==='completed'&&!queue.processing);assert.deepEqual(calls,['instagram','instagramStory','x','linkedin']);
 }finally{await cleanup(dir);}
});
test('pausing between feed and Story releases the retained native session and resumes only pending work',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-story-flow-')),calls=[];let closed=0,queue;
 const worker={handoff:null,busy:false,checkAccount:async()=>{},close:async()=>{closed++;worker.handoff=null;worker.busy=false;}};
 try{
  queue=new Queue(browser,{dataDir:dir,instagramWorker:worker,runner:async ctx=>{calls.push(ctx.id);if(ctx.id==='instagram'){worker.handoff={runId:ctx.runId,postUrl};worker.busy=true;await queue.control('pause');return {status:'posted',publication:{postUrl}};}assert.equal(ctx.instagramPublication.postUrl,postUrl);return 'dry_run';}});await queue.init();
  const run=await queue.start({draft:{selected:['instagram','x','instagramStory'],captions:{},instagram:{music:{enabled:true}}},config:defaults,media:[]});
  await wait(()=>run.status==='paused'&&!queue.processing);assert.equal(closed,1);assert.equal(worker.busy,false);assert.deepEqual(calls,['instagram']);
  await queue.control('resume');await wait(()=>run.status==='completed'&&!queue.processing);assert.deepEqual(calls,['instagram','instagramStory','x']);
 }finally{await cleanup(dir);}
});
test('native handoff requires the same run, account and confirmed post, and never retains TEST drafts',async()=>{
 const worker=new InstagramAndroidWorker({dataDir:'unused-fixture'}),ctx={runId:'run-a',continueInstagramStory:true,config:{platforms:{instagram:{handle:'ours'}}},signal:new AbortController().signal};let closed=0;
 worker.s={signal:null,close:async()=>{closed++;}};worker.busy=true;
 assert.equal(worker.retainForStory(ctx,'dry_run',{postUrl}),false);assert.equal(worker.retainForStory(ctx,'posted',{candidates:[postUrl]}),false);
 assert.equal(worker.retainForStory(ctx,'posted',{postUrl}),true);const current=worker.s;
 assert.equal(await worker.openStory(ctx,postUrl),current);assert.equal(current.signal,ctx.signal);assert.equal(closed,0);assert.equal(worker.handoff,null);
 assert(worker.retainForStory(ctx,'posted',{postUrl}));await assert.rejects(worker.openStory({...ctx,runId:'run-b'},postUrl),/handoff changed/);assert.equal(closed,1);assert.equal(worker.busy,false);
});
test('Android activation waits past the launcher and account navigation preserves editors',async()=>{
 const s=Object.create(AndroidSession.prototype),calls=[];
 s.request=async endpoint=>{calls.push(endpoint);};s.until=async(predicate,message,timeout)=>{assert.equal(timeout,90000);assert.equal(await predicate([{displayed:'true',package:'com.google.android.apps.nexuslauncher'}]),false);assert(await predicate([{displayed:'true',package:'com.instagram.android'}]));};
 await s.activate();assert.deepEqual(calls,['/appium/device/activate_app']);
 const n=(id,text='')=>({'resource-id':nativeId(id),displayed:'true',text});let viewer=true;
 s.activate=async()=>{};s.screen=async()=>viewer?[n('row_feed_button_share')]:[n('profile_tab'),n('profile_header_create_button'),n('action_bar_title','ours')];s.request=async(endpoint,method,body)=>{assert.equal(endpoint,'/back');viewer=false;};s.clickId=async id=>{assert.equal(id,'profile_tab');};s.until=async predicate=>predicate(await s.screen());
 await s.account('ours');assert.equal(s.accountHandle,'ours');
 viewer=true;s.screen=async()=>[n('row_feed_button_share'),n('caption_input_text_view','Unsent text')];s.request=async()=>assert.fail('User editor must not be dismissed');await assert.rejects(s.account('ours'),/unsent/);
 s.screen=async()=>[n('row_feed_button_share'),n('media_thumbnail_tray_button')];await assert.rejects(s.account('ours'),/unsent/);
});
test('magnetic placement snaps near centers, releases outside the magnet and ignores absent links',()=>{
 const layout=structuredClone(DEFAULT_STORY_LAYOUT);layout.link.x=.55;
 let value=snapStoryPosition(layout,'card',.513,.492,{hasLink:false});assert.equal(value.x,.5);assert.equal(value.y,.5);assert.equal(value.guides.x,.5);
 value=snapStoryPosition(layout,'card',.55,.55,{hasLink:false});assert.equal(value.x,.55);assert.equal(value.y,.55);assert.equal(value.guides.x,null);
 value=snapStoryPosition(layout,'card',.55,.43,{hasLink:true});assert.equal(value.x,.55);
 const edge=snapStoryPosition(DEFAULT_STORY_LAYOUT,'link',.432,.8);assert(Math.abs(edge.x-.43)<.0001);assert(Math.abs(edge.guides.x-.1)<.0001);
 value=snapStoryPosition(layout,'card',-1,2,{hasLink:false});assert(value.x>=layout.card.width/2+.02);assert.equal(value.y,.62);
});
test('Auto-align centers only present items, preserves widths and leaves a safe gap for the link',()=>{
 const layout=structuredClone(DEFAULT_STORY_LAYOUT);layout.link.x=.57;
 const centered=alignStoryItems(layout,{hasLink:false,cardHeight:.55});assert.equal(centered.card.x,.5);assert.equal(centered.card.y,.5);assert.deepEqual(centered.link,layout.link);
 const paired=alignStoryItems(layout,{hasLink:true,cardHeight:.55,linkHeight:.07});assert.equal(paired.card.x,.5);assert.equal(paired.link.x,.5);assert.equal(paired.card.width,layout.card.width);assert.equal(paired.link.width,layout.link.width);assert(paired.link.y-.035-(paired.card.y+.275)>=.0499);
 assert.throws(()=>alignStoryItems(layout,{hasLink:true,cardHeight:.85,linkHeight:.18}),/space|tall/);
});

test('restart preserves a failed Story as individually retryable and never resumes the confirmed feed',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-story-flow-'));
 try{
  await fs.writeFile(path.join(dir,'runs.json'),JSON.stringify([{id:'old-run',status:'attention',confirmedLive:true,items:[{id:'instagram',status:'posted',publication:{postUrl}},{id:'instagramStory',status:'attention',startedAt:'2026-10-19T11:43:10Z',submitting:false,message:'Android was not ready'},{id:'telegram',status:'uncertain',submitting:true,message:'Verify outcome'}]}]));
  const queue=new Queue(browser,{dataDir:dir,runner:async()=>assert.fail('Restart must never publish')});await queue.init();
  assert.equal(queue.runs[0].status,'interrupted');assert.equal(queue.runs[0].confirmedLive,false);assert.equal(queue.runs[0].items[0].publication.postUrl,postUrl);assert.equal(queue.runs[0].items[1].status,'failed');assert.match(queue.runs[0].items[1].message,/Android was not ready/);assert.equal(queue.runs[0].items[2].status,'uncertain');
 }finally{await cleanup(dir);}
});

test('driver startup recovers once from an explicit instrumentation timeout and refuses ambiguous retries',async()=>{
 let calls=0,resets=0;const failure={ok:false,result:{value:{message:'The instrumentation process cannot be initialized within 60000ms timeout.'}}};
 assert.equal(await connectAndroidDriver(async()=>++calls===1?failure:{ok:true,result:{value:{sessionId:'fresh-session'}}},async()=>{resets++;}),'fresh-session');assert.equal(calls,2);assert.equal(resets,1);
 calls=0;resets=0;await assert.rejects(connectAndroidDriver(async()=>{calls++;throw Error('Lost response');},async()=>{resets++;}),/Lost response/);assert.equal(calls,1);assert.equal(resets,0);
 await assert.rejects(connectAndroidDriver(async()=>failure,async()=>{resets++;}),/could not connect/);assert.equal(resets,1);
});

test('confirmed native handoff proceeds directly, while a standalone Story still checks post ownership',async()=>{
 const worker=new InstagramAndroidWorker({dataDir:'unused-fixture'});let checks=0;
 worker.verifyPost=async()=>{checks++;};worker.openStory=async()=>({});
 const ctx={id:'instagramStory',runId:'run-a',instagram:{music:{enabled:false},story:{sourcePostUrl:postUrl}},config:{platforms:{instagram:{handle:'ours'}}},recordPreparation:async()=>{},step:async message=>{if(message.startsWith('Opening the exact'))throw Error('Preparation boundary reached without any publish action');},mode:'TEST'};
 worker.handoff={runId:'run-a',postUrl,account:'ours'};
 await assert.rejects(worker.run(ctx),/Preparation boundary/);assert.equal(checks,0);
 worker.handoff=null;await assert.rejects(worker.run(ctx),/Preparation boundary/);assert.equal(checks,1);
});

test('inherited Story audio returns through the observed music-search control before choosing a track',async()=>{
 const n=(id,extra={})=>({'resource-id':nativeId(id),displayed:'true',...extra}),library=[n('row_search_edit_text')],calls=[];
 let screen=[n('story_share_controls_action_bar'),{'resource-id':'music_button',displayed:'true'}];
 const s={screen:async()=>screen,until:async predicate=>{const result=predicate(screen);assert(result);return result;},click:async(using,id)=>{assert.equal(id,'music_button');calls.push(id);screen=[n('music_editor_done_button'),n('album_art_button',{'content-desc':'Return to music search'})];},clickId:async id=>{assert.equal(id,'album_art_button');calls.push(id);screen=library;}};
 await openStoryMusicLibrary(s);assert.deepEqual(calls,['music_button','album_art_button']);
 calls.length=0;await openStoryMusicLibrary(s);assert.deepEqual(calls,[]);
 screen=[n('music_editor_done_button')];await assert.rejects(openStoryMusicLibrary(s),/cannot be changed safely/);assert.deepEqual(calls,[]);
});

test('owned Story cleanup unwinds inherited music editors without a Cancel button',async()=>{
 const n=(id,text='')=>({'resource-id':nativeId(id),displayed:'true',text}),frames=[[n('music_browser_container')],[n('music_editor_done_button')],[n('story_share_controls_action_bar'),n('cancel_button')],[n('igds_alert_dialog_primary_button','Discard')],[],[n('profile_header_create_button')],[n('profile_header_create_button'),n('profile_tab')]],calls=[];let i=0;
 const s={screen:async()=>frames[i],until:async(predicate,message,timeout)=>{assert.equal(timeout,10000);assert.equal(predicate(frames[i]),false);while(!predicate(frames[i]))i++;},request:async endpoint=>{calls.push(endpoint);i++;},clickId:async id=>{calls.push(id);i++;},click:async()=>{calls.push('Discard owned Story');i++;}};
 await discardStory(s);assert.equal(i,6);assert.deepEqual(calls,['/back','/back','cancel_button','Discard owned Story']);
});

test('the blue arrow preserves Facebook + Instagram and changed or ambiguous audiences block sharing',async()=>{
 const n=(id,extra={})=>({'resource-id':nativeId(id),displayed:'true',...extra}),picture=await sharp({create:{width:32,height:32,channels:3,background:'#dddddd'}}).png().toBuffer(),calls=[];
 let facebook=true,extraRadio=false;
 const s={screen:async()=>[n('share_story_button'),n('camera_photo_texture_view',{bounds:'[0,0][32,32]'}),n('recipient_picker_radio_button',{checked:'true'}),...(facebook?[n('sharing_preferences_label',{text:'And Facebook Story'})]:[]),...(extraRadio?[n('recipient_picker_radio_button',{checked:'true'})]:[])],click:async(using,label)=>{assert.equal(using,'accessibility id');assert.equal(label,'Share to');calls.push(label);},until:async predicate=>{assert(predicate(await s.screen()));},find:async(using,query)=>{assert(query.includes('row_add_to_story_container'));return 'your-story-radio';},screenshot:async()=>picture};
 const proof=await prepareStoryAudience(s);assert.deepEqual(proof.destinations,['instagram','facebook']);assert.deepEqual(calls,['Share to']);
 facebook=false;await assert.rejects(storyAudienceEvidence(s),/Enable Facebook/);facebook=true;extraRadio=true;await assert.rejects(storyAudienceEvidence(s),/ambiguous/);assert.deepEqual(calls,['Share to']);
});
