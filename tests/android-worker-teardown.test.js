// Local driver teardown failures must not change a verified publication result.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {InstagramAndroidWorker} from '../server/automation/instagram-android.js';
import {nativeId} from '../server/automation/android-native.js';
const config={androidDevice:{type:'phone',serial:'OFFICE123'},platforms:{instagram:{handle:'ours'}}};
const cleanupFailure=()=>new Error('Android: Error executing adbExec; adb.exe: device offline; '+('sensitive command '.repeat(200)));
const node=(id,values={})=>({'resource-id':nativeId(id),package:'com.instagram.android',displayed:'true',text:'',tag:'android.widget.TextView',bounds:'[0,0][100,20]',...values});
function assertReleased(worker){
 assert.equal(worker.s,null);assert.equal(worker.busy,false);assert.equal(worker.picker,null);assert.equal(worker.operation,false);assert.equal(worker.opening,false);assert.equal(worker.progressState,null);assert.equal(worker.handoff,null);assert.equal(worker.preflight,null);assert.equal(worker.timer,null);
}

test('driver teardown failure clears local worker state without exposing a raw command or touching Instagram',async()=>{
 const calls=[],worker=new InstagramAndroidWorker({dataDir:'unused-teardown-fixture'});
 worker.s={close:async()=>{calls.push('delete driver');throw cleanupFailure();},request:async()=>assert.fail('No app control belongs in teardown'),adb:async()=>assert.fail('No app force-stop belongs in teardown')};
 worker.busy=worker.operation=worker.opening=true;worker.picker={owned:true};worker.handoff={runId:'old'};worker.preflight={runId:'old'};worker.progressState={message:'Old stage'};worker.timer=setTimeout(()=>assert.fail('Expired timer must be cleared'),100);
 await worker.close();assertReleased(worker);assert.deepEqual(calls,['delete driver']);
 assert.equal(worker.cleanupWarning.code,'ANDROID_DRIVER_CLEANUP_FAILED');assert(worker.cleanupWarning.message.length<200);assert(!worker.cleanupWarning.message.includes('sensitive command'));assert(!Number.isNaN(Date.parse(worker.cleanupWarning.at)));
 const warning=structuredClone(worker.cleanupWarning);await worker.close();assert.deepEqual(worker.cleanupWarning,warning);assert.deepEqual(calls,['delete driver']);
 worker.s={close:async()=>{calls.push('clean delete');}};await worker.close();assert.equal(worker.cleanupWarning,null);assertReleased(worker);
});

for(const stage of ['open','account'])test('original '+stage+' failure survives a second driver cleanup error',async()=>{
 const original=new Error('Original '+stage+' failure'),calls=[];
 const session={open:async()=>{calls.push('open');if(stage==='open')throw original;},account:async()=>{calls.push('account');throw original;},close:async()=>{calls.push('delete driver');throw cleanupFailure();}};
 const worker=new InstagramAndroidWorker({dataDir:'unused-teardown-fixture',sessionFactory:()=>session});
 await assert.rejects(worker.open(config),error=>error===original);assertReleased(worker);assert.equal(calls.at(-1),'delete driver');assert.equal(worker.cleanupWarning.code,'ANDROID_DRIVER_CLEANUP_FAILED');
});

// This exercises the worker's actual verified-existing-audio return path. It
// only reads a fixture post, copies its link and leaves its unchanged edit.
// There is no final Save, new post, Story or send operation in this fixture.
test('runMusic retains its independently verified posted receipt when closing the driver fails',async()=>{
 const postUrl='https://www.instagram.com/p/VERIFIED123/',caption='Reviewed caption',song={title:'Existing song',artist:'Existing artist'},calls=[];
 const pixels=await sharp({create:{width:300,height:600,channels:3,background:'#b78956'}}).png().toBuffer();
 let stage='viewer';
 const viewer=()=>[node('row_feed_button_share',{'content-desc':'Send post. Reviewed fixture',bounds:'[10,300][50,340]'}),node('row_feed_photo_profile_name',{text:'ours'}),node('media_option_button'),node('caption',{'resource-id':undefined,text:'ours '+caption})];
 const menu=()=>[node('action_sheet_container',{bounds:'[0,200][300,600]'}),node('recycler_view',{bounds:'[0,220][300,580]',scrollable:'true'}),node('control_option_text',{text:'Edit',bounds:'[0,300][300,350]'})];
 const edit=()=>[node('layout_edit_media_info_layout'),node('action_bar_title',{text:'Edit info'}),node('edit_media_username',{text:'ours'}),node('edit_media_caption',{text:caption,bounds:'[0,320][300,550]'}),node('edit_media_scroll_view',{bounds:'[0,100][300,560]'}),node('m2_audio_row'),node('m2_audio_primary_text',{text:song.title}),node('m2_audio_secondary_text',{text:song.artist})];
 const current=()=>stage==='viewer'?viewer():stage==='menu'?menu():stage==='edit'?edit():[node('button',{'content-desc':'Copy link'})];
 const session={
  screen:async()=>current(),screenshot:async()=>pixels,
  until:async predicate=>{const result=await predicate(current());assert(result,'Fixture must satisfy the current observed screen');return result;},
  find:async()=>{assert.equal(stage,'viewer');return 'observed-share';},
  request:async(endpoint,_method,body)=>{
   calls.push(endpoint+(body?.script?' '+body.script:''));
   if(endpoint==='/execute/sync'&&body.script==='mobile: deepLink'){assert.equal(body.args[0].url,postUrl);stage='viewer';return;}
   if(endpoint==='/execute/sync'&&body.script==='mobile: setClipboard')return;
   if(endpoint==='/execute/sync'&&body.script==='mobile: getClipboard')return Buffer.from(postUrl).toString('base64');
   if(endpoint==='/element/observed-share/click'){assert.equal(stage,'viewer');stage='copy';return;}
   if(endpoint==='/back'){assert.equal(stage,'edit');stage='viewer';return;}
   assert.fail('Unexpected request '+endpoint);
  },
  click:async(using,value)=>{assert.equal(using,'xpath');if(stage==='copy'){assert(value.includes('Copy link'));stage='viewer';return;}assert.equal(stage,'menu');assert(value.includes('@text="Edit"'));stage='edit';},
  clickId:async id=>{assert.equal(stage,'viewer');assert.equal(id,'media_option_button');stage='menu';},
  adb:async args=>{assert.equal(stage,'edit');assert.deepEqual(args.slice(0,3),['shell','input','swipe']);},
  account:async handle=>{assert.equal(stage,'viewer');assert.equal(handle,'ours');calls.push('account');},
  close:async()=>{calls.push('delete driver');throw cleanupFailure();}
 };
 const worker=new InstagramAndroidWorker({dataDir:'unused-teardown-fixture'});worker.openForRun=async()=>{worker.s=session;worker.busy=true;return session;};
 const result=await worker.runMusic({id:'instagramMusic',mode:'LIVE',config,instagram:{postingMethod:'web',music:{enabled:true,source:'details',reference:song}},instagramPublication:{postUrl},instagramCaption:caption,recordPreparation:async()=>{},step:async()=>{}});
 assert.equal(result.status,'posted');assert.equal(result.publication.postUrl,postUrl);assert.equal(result.publication.verifiedBy,'existing_post_audio');assert.equal(result.publication.music.inherited,true);assert.equal(calls.at(-1),'delete driver');assert.equal(stage,'viewer');assertReleased(worker);assert(worker.cleanupWarning);
});
