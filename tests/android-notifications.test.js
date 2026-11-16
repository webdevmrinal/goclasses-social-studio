// Source-only fixtures. No Android connection, notification taps or publication.
import test from 'node:test';import assert from 'node:assert/strict';
import {AndroidSession,nativeId} from '../server/automation/android-native.js';
import {InstagramAndroidWorker} from '../server/automation/instagram-android.js';
import {androidInterruption} from '../shared/android-interruptions.js';
const node=(packageName,id)=>({package:packageName,'resource-id':id,displayed:'true',class:'android.view.View'});
const editor=[node('com.instagram.android',nativeId('story_share_controls_action_bar')),node('com.instagram.android',nativeId('camera_photo_texture_view'))];
const banner=node('com.android.systemui','com.android.systemui:id/heads_up_status_bar_layout');
const xml=nodes=>'<hierarchy>'+nodes.map(n=>'<node '+Object.entries(n).map(([k,v])=>k+'="'+v+'"').join(' ')+'/>').join('')+'</hierarchy>';
function session(scenes){const s=Object.create(AndroidSession.prototype),calls=[],progress=[];s.accountHandle='goclasses_cse';s.onLocatorRecovery=async m=>progress.push(m);s.request=async(endpoint,method='GET')=>{calls.push([endpoint,method]);assert.equal(endpoint,'/source');assert.equal(method,'GET');return xml(scenes.length>1?scenes.shift():scenes[0]);};return {s,calls,progress};}

test('WhatsApp heads-up banners over Instagram are transient; calls and locks keep priority',()=>{
 assert.equal(androidInterruption([...editor,banner])?.kind,'notification');
 assert.equal(androidInterruption([...editor,banner,node('com.android.systemui','com.android.systemui:id/notification_panel')])?.kind,'notification');
 assert.equal(androidInterruption([...editor,banner,node('com.samsung.android.incallui','')])?.kind,'call');
 assert.equal(androidInterruption([...editor,banner,node('com.android.systemui','com.android.systemui:id/keyguard_pin_view')])?.kind,'locked');
 assert.equal(androidInterruption([...editor,node('com.android.systemui','com.android.systemui:id/notification_panel')])?.kind,'system_panel');
 assert.equal(androidInterruption([...editor,node('com.android.systemui','com.android.systemui:id/navigation_bar_frame')]),null);
 assert.equal(androidInterruption([banner]),null,'Do not infer an Instagram screen behind an unknown foreground');
});

test('a banner caused by a parallel browser post clears through reads before Story inheritance',async()=>{
 const {s,calls,progress}=session([[...editor,banner],editor]),music={title:'One Take',artist:'DEXTAH',key:'1141878854038012'},url='https://www.instagram.com/p/SAME_VERIFIED_POST/';
 s.click=()=>assert.fail('No notification or music click');s.onInterruption=()=>assert.fail('A short banner should not need manual intervention');
 const audio=await new InstagramAndroidWorker({dataDir:'.'}).inheritPostMusic(s,music,{postUrl:url,music},url);
 assert(audio.inherited);assert.equal(progress.length,1);assert.deepEqual(calls,[['/source','GET'],['/source','GET']]);
});

test('a persistent banner pauses for manual help rather than dismissing it',async()=>{
 const {s,calls}=session([[...editor,banner]]);let paused=0;
 s.onInterruption=async(details,inspect)=>{paused++;assert.equal(details.kind,'notification');assert.equal(await inspect(),false);s.request=async(endpoint,method='GET')=>{calls.push([endpoint,method]);assert.equal(endpoint,'/source');assert.equal(method,'GET');return xml(editor);};assert.equal(await inspect(),true);};
 const result=await s.screen({deadline:Date.now()+15});assert.equal(paused,1);assert.equal(result.length,2);assert(calls.every(([endpoint,method])=>endpoint==='/source'&&method==='GET'));
});

test('a call arriving during the banner wait goes to manual help without replaying an action',async()=>{
 const call=[...editor,node('com.samsung.android.incallui','')],{s,calls}=session([[...editor,banner],call,editor]);let paused=0;
 s.onInterruption=async(details,inspect)=>{paused++;assert.equal(details.kind,'call');assert.equal(await inspect(),true);};
 await s.screen();assert.equal(paused,1);assert.equal(calls.length,4);assert(calls.every(([,method])=>method==='GET'));
});

test('Stop during a notification wait cancels before the next source read',async()=>{
 const {s,calls}=session([[...editor,banner]]),controller=new AbortController();s.signal=controller.signal;
 s.onLocatorRecovery=async()=>controller.abort(new Error('Stopped by operator'));
 await assert.rejects(s.screen(),/Stopped by operator/);assert.equal(calls.length,1);
});

test('notification text and actions never enter recovery messages',()=>{
 const result=androidInterruption([...editor,{...banner,text:'private message and OTP 123456','content-desc':'Reply to private sender'}]);
 assert.equal(result.kind,'notification');assert(!JSON.stringify(result).includes('123456'));assert(!JSON.stringify(result).includes('private sender'));
});
