import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {storyUploadState} from '../shared/story-upload.js';import {confirmNativeStoryPublication} from '../server/automation/native-story.js';import {verifyOwnPublishedStory,storyPreviewPixels} from '../server/automation/native-story-readback.js';import {nativeId} from '../server/automation/android-native.js';
const n=(id,attrs={})=>({'resource-id':nativeId(id),package:'com.instagram.android',displayed:'true',...attrs});
const uploading=percent=>[n('story_upload_progress',{text:percent+'%',class:'android.widget.ProgressBar'}),n('upload_label',{text:'Uploading...'})];
const sent=[n('toast',{text:'Story shared'})];
test('uploading percentages and a failure are states, never publication evidence',()=>{
 assert.deepEqual(storyUploadState(uploading(90)),{state:'uploading',percent:90});assert.deepEqual(storyUploadState([n('u',{text:"Couldn't upload your story"})]),{state:'failed'});assert.equal(storyUploadState(sent),null);assert.equal(storyUploadState([{...uploading(90)[0],package:'com.android.systemui'}]),null);
});
test('a Story stalled at 90% for more than 30 seconds is observed until its one send completes',async t=>{
 let clock=100000,reads=0;const diagnostics=[],deadlines=[];t.mock.method(Date,'now',()=>clock);
 const s={screen:async()=>{reads++;clock+=20000;return reads<4?uploading(reads<3?90:100):sent;},until:async(fn,message,timeout)=>{deadlines.push(timeout);const end=clock+timeout;while(clock<end){const result=await fn(await s.screen());if(result)return result;}throw Error(message);},click:()=>assert.fail('No second Share'),clickId:()=>assert.fail('No second Share'),request:()=>assert.fail('Read-only confirmation')};
 const receipt=await confirmNativeStoryPublication(s,{submittedAt:clock,onDiagnostic:async e=>diagnostics.push(e)});assert.equal(receipt.instagramAccepted,true);assert.equal(reads,4);assert(deadlines[0]>=170000);assert.deepEqual(diagnostics.filter(d=>d.phase==='uploading').map(d=>d.percent),[90,100]);
});
test('a progress bar on a matching own Story prevents premature pixel confirmation',async()=>{
 const nodes=[n('reel_viewer_root'),n('reel_viewer_title',{text:'ours'}),n('self_toolbar_menu_button'),...uploading(90)];
 const s={screen:async()=>nodes,screenshot:()=>assert.fail('Do not confirm a local uploading preview'),account:()=>assert.fail('Do not navigate during upload')};
 await assert.rejects(verifyOwnPublishedStory(s,{handle:'ours',preview:Buffer.alloc(96000),submittedAt:Date.now()}),e=>e.code==='STORY_NOT_READY');
});
test('an explicit upload failure or Stop returns without a retry or notification action',async()=>{
 const failed={until:async fn=>fn([n('failure',{text:'Upload failed'})]),click:()=>assert.fail(),request:()=>assert.fail()};await assert.rejects(confirmNativeStoryPublication(failed),/upload failed/);
 const controller=new AbortController();controller.abort(new Error('Stopped by operator'));await assert.rejects(confirmNativeStoryPublication({signal:controller.signal}),/Stopped by operator/);
});
test('late appearance of the own Story is retried read-only and then confirmed',async()=>{
 const image=await sharp({create:{width:100,height:200,channels:3,background:'#cb9870'}}).png().toBuffer(),preview=await storyPreviewPixels(image,{x:0,y:0,width:100,height:200}),profile=[n('profile_tab'),n('action_bar_title',{text:'ours'})],avatar=n('row_profile_header_imageview',{'content-desc':'Your profile. Unseen story'}),viewer=[n('reel_viewer_root'),n('reel_viewer_title',{text:'ours'}),n('self_toolbar_menu_button'),n('viewers_facepile_label',{text:'Activity'}),n('reel_viewer_timestamp',{text:'now'}),n('reel_viewer_media_container',{bounds:'[0,0][100,200]'})];let frames=profile,checks=0,views=0;
 const s={screen:async()=>frames,account:async()=>{checks++;frames=checks>1?[...profile,avatar]:profile;},clickId:async id=>{assert.equal(id,'row_profile_header_imageview_frame_layout');views++;frames=viewer;},until:async fn=>{const value=await fn(frames);assert(value);return value;},screenshot:async()=>image,request:()=>assert.fail('No publication request'),gesture:()=>assert.fail('No Story resend')};
 const receipt=await confirmNativeStoryPublication(s,{handle:'ours',preview,submittedAt:Date.now(),settleMs:0,timeout:4000});assert.equal(receipt.verifiedBy,'native_own_story_preview');assert.equal(views,1);assert.equal(checks,2);
});
