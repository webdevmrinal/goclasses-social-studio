// Copyright (c) 2026 Mrinal. Offline accessibility fixtures; no Android or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeId,AndroidSession} from '../server/automation/android-native.js';
import {nativeNavigationCandidate,recoverNativeNavigation} from '../server/automation/native-navigation.js';
import {assistNativeStage,openMusicLibrary,storyMusicCheckpoint} from '../server/automation/native-music.js';
import {InstagramAndroidWorker} from '../server/automation/instagram-android.js';
import {selectPostEdit,anchorEditInfo,readEditMusic} from '../server/automation/native-edit-music.js';

const n=(id,text='',extra={})=>({'resource-id':nativeId(id),package:'com.instagram.android',displayed:'true',enabled:'true',clickable:'false',text,'content-desc':'',bounds:'[20,100][200,150]',...extra});
const control=(id,text,extra={})=>n(id,text,{clickable:'true',...extra});
const photo=(extra=[])=>[n('media_thumbnail_tray_button'),...extra];
const musicButton=()=>control('new_music_control','Music');
const menu=(extra=[])=>[n('action_sheet_container','',{bounds:'[0,0][540,1170]'}),n('recycler_view','',{bounds:'[18,80][522,1100]',scrollable:'true'}),...extra];
function driver(initial,{clickError,waitError}={}){
 let nodes=initial;const clicks=[];let reads=0;
 const s={clicks,reads:()=>reads,set:n=>{nodes=n;},screen:async()=>{reads++;return nodes;},click:async(using,value)=>{clicks.push({using,value});if(clickError)throw clickError;nodes=[n('row_search_edit_text')];},until:async(predicate,message)=>{if(waitError)throw waitError;const result=await predicate(nodes);if(!result)throw Error(message);return result;}};
 return s;
}
const ready=nodes=>nodes.some(n=>n['resource-id']===nativeId('row_search_edit_text'));

test('a renamed music control uses only exact observed accessibility attributes',()=>{
 const selected=nativeNavigationCandidate(photo([musicButton()]),'feed-music');
 assert.equal(selected.using,'xpath');assert(selected.value.includes('@text="Music"'));assert(selected.value.includes('@resource-id="'+nativeId('new_music_control')+'"'));
 assert(selected.value.includes('@package="com.instagram.android"'));assert(selected.value.includes('@enabled="true"'));assert(selected.value.includes('@clickable="true"'));
 assert(!selected.value.includes('bounds'));assert(!selected.value.includes('parent::'));
});
test('one scoped navigation click is followed by its completion check',async()=>{
 const s=driver(photo([musicButton()]));assert.equal(await recoverNativeNavigation(s,{action:'feed-music',ready}),true);
 assert.equal(s.clicks.length,1);assert.equal(s.reads(),1);
});
test('a navigation already completed needs no click',async()=>{
 const s=driver([n('row_search_edit_text')]);assert.equal(await recoverNativeNavigation(s,{action:'feed-music',ready}),true);assert.equal(s.clicks.length,0);
});
test('an unconfirmed action is never repeated on the same viewport',async()=>{
 const original=photo([musicButton()]),failure=Error('No confirmed transition'),s=driver(original,{waitError:failure});
 await assert.rejects(recoverNativeNavigation(s,{action:'feed-music',ready}),e=>e===failure);s.set(original);
 await assert.rejects(recoverNativeNavigation(s,{action:'feed-music',ready}),/already been tried/);assert.equal(s.clicks.length,1);
});
test('a lost click response is never replayed',async()=>{
 const failure=Error('Lost click response'),s=driver(photo([musicButton()]),{clickError:failure});
 await assert.rejects(recoverNativeNavigation(s,{action:'feed-music',ready}),e=>e===failure);
 await assert.rejects(recoverNativeNavigation(s,{action:'feed-music',ready}),/already been tried/);assert.equal(s.clicks.length,1);
});
for(const [name,nodes] of [
 ['duplicate labels',photo([musicButton(),control('another_audio','Audio')])],
 ['disabled control',photo([control('audio','Music',{enabled:'false'})])],
 ['nonclickable label',photo([n('audio','Music')])],
 ['unknown stage',[musicButton()]],
 ['post review',photo([musicButton(),n('share_footer_button')])],
 ['foreign overlay',photo([musicButton(),n('overlay','',{package:'other.app'})])],
 ['password field',photo([musicButton(),n('password','',{password:'true'})])],
 ['recipient screen',photo([musicButton(),n('direct_external_share_container_view')])],
 ['unsafe resource id',photo([control('save_button','Music')])],
 ['unsafe secondary label',photo([control('audio','Music',{'content-desc':'Save'})])],
 ['editable field',photo([control('audio','Music',{class:'android.widget.EditText'})])]
])test(name+' hands off without any action',async()=>{
 const s=driver(nodes);await assert.rejects(recoverNativeNavigation(s,{action:'feed-music',ready}),/preserved/);assert.equal(s.clicks.length,0);
});
for(const label of ['Save','Share','Post','Publish','Send','Delete','Discard','Remove','Your story','Close friends'])test(label+' cannot become a recovery action',async()=>{
 const s=driver(photo([control('unknown',label)]));await assert.rejects(recoverNativeNavigation(s,{action:'feed-music',ready}),/unique navigation control/);assert.equal(s.clicks.length,0);
});
test('unknown actions are rejected even with a unique clickable control',()=>{
 assert.throws(()=>nativeNavigationCandidate(photo([control('safe','Save')]),'save'),/not allowlisted/);
});
test('Story music requires its own Story editor',()=>{
 const nodes=[n('story_share_controls_action_bar'),musicButton()];
 assert(nativeNavigationCandidate(nodes,'story-music'));assert.throws(()=>nativeNavigationCandidate(nodes,'feed-music'),/screen changed/);
});
test('Edit needs its caller guard and a contained row in the verified menu',()=>{
 const nodes=menu([control('renamed_edit','Edit')]);
 assert.throws(()=>nativeNavigationCandidate(nodes,'post-edit'),/screen changed/);
 assert.throws(()=>nativeNavigationCandidate(nodes,'post-edit',{guard:()=>false}),/screen changed/);
 assert(nativeNavigationCandidate(nodes,'post-edit',{guard:()=>true}));
 assert.throws(()=>nativeNavigationCandidate(menu([control('renamed_edit','Edit',{bounds:'[20,1100][200,1150]'})]),'post-edit',{guard:()=>true}),/outside the verified post menu/);
});
test('cancellation prevents even the first navigation read',async()=>{
 const s=driver(photo([musicButton()]));s.signal=AbortSignal.abort(Error('Stopped'));
 await assert.rejects(recoverNativeNavigation(s,{action:'feed-music',ready}),/Stopped/);assert.equal(s.reads(),0);assert.equal(s.clicks.length,0);
});
test('a failed stage rechecks completion once without repeating its action',async()=>{
 let attempts=0,handoffs=0;const proof={caption:'Reviewed'},s={screen:async()=>[],signal:undefined};
 const result=await assistNativeStage(s,{intervene:async()=>{handoffs++;}},{kind:'navigation'},async()=>{attempts++;throw Error('Late response');},()=>proof);
 assert.equal(result,proof);assert.equal(attempts,1);assert.equal(handoffs,0);
});
test('manual continuation only inspects and never replays the failed action',async()=>{
 let attempts=0,checks=0,handoffs=0;const proof={caption:'Reviewed'},s={screen:async()=>[]};
 const result=await assistNativeStage(s,{intervene:async(details,inspect)=>{handoffs++;assert.equal(details.reason,'Missing selector');return inspect();}},{kind:'navigation'},async()=>{attempts++;throw Error('Missing selector');},()=>++checks===1?null:proof);
 assert.equal(result,proof);assert.equal(attempts,1);assert.equal(checks,2);assert.equal(handoffs,1);
});
test('identity failure and cancellation cannot open a handoff',async()=>{
 for(const error of [Object.assign(Error('Wrong account'),{name:'AccountMismatchError'}),Error('Stopped')]){
  let handoffs=0;const s={screen:async()=>[],...(error.message==='Stopped'?{signal:AbortSignal.abort(error)}:{})};
  await assert.rejects(assistNativeStage(s,{intervene:async()=>{handoffs++;}},{},async()=>{throw error;},()=>true),e=>e===error);assert.equal(handoffs,0);
 }
});
test('only a definite selector no-match receives the pre-action recovery code',async()=>{
 const s=Object.create(AndroidSession.prototype);s.request=async()=>[];s.find=AndroidSession.prototype.find.bind(s);
 await assert.rejects(s.find('id',nativeId('missing'),{deadline:Date.now()+1}),e=>e.code==='ANDROID_CONTROL_UNAVAILABLE');
 s.request=async()=>[{},{}];await assert.rejects(s.find('id',nativeId('duplicate')),e=>e.code==='ANDROID_CONTROL_AMBIGUOUS');
});
test('feed music selector failure uses one semantic fallback but mutation failures never do',async()=>{
 const library=[n('row_search_edit_text'),n('music_browser_container'),n('track','',{'resource-id':'audio_browser_track_0_12345'}),n('song_title','Reviewed'),n('artist_name','Artist \u2022 2:45')];
 for(const code of ['ANDROID_CONTROL_UNAVAILABLE',undefined,'ANDROID_CONTROL_AMBIGUOUS']){
  let frame=photo([musicButton()]),calls=0;const failure=Object.assign(Error('Primary failed'),{code});
  const s={screen:async()=>frame,until:async(fn,message)=>{for(let i=0;i<4;i++){const value=await fn(frame);if(value)return value;}throw Error(message);},click:async(using,selector)=>{calls++;if(selector.includes('parent::'))throw failure;frame=library;}};
  if(code==='ANDROID_CONTROL_UNAVAILABLE'){const rows=await openMusicLibrary(s);assert.equal(rows[0].key,'12345');assert.equal(calls,2);}
  else{await assert.rejects(openMusicLibrary(s),e=>e===failure);assert.equal(calls,1);}
 }
});

test('renamed Edit is selected only within the verified post menu and completion is inspected',async()=>{
 let nodes=menu([n('control_option_text','Save'),control('renamed_edit','Edit')]),clicks=0;
 const s={screen:async()=>nodes,until:async(fn,message)=>{const value=await fn(nodes);if(!value)throw Error(message);return value;},click:async(using,selector)=>{clicks++;assert.equal(using,'xpath');assert(selector.includes('@resource-id="'+nativeId('renamed_edit')+'"'));assert(!selector.includes('Save'));nodes=[n('layout_edit_media_info_layout'),n('action_bar_title','Edit info')];},request:async()=>assert.fail('No scroll when a safe Edit is visible')};
 await selectPostEdit(s);assert.equal(clicks,1);
});
test('an unknown scroll response stops before another gesture or selection',async()=>{
 let gestures=0;const nodes=menu([n('control_option_text','Save')]),s={screen:async()=>nodes,until:async(fn)=>fn(nodes),click:async()=>assert.fail('No click'),request:async()=>{gestures++;return 'true';}};
 await assert.rejects(selectPostEdit(s),/did not confirm its scroll position/);assert.equal(gestures,1);
});
test('existing-post scroll navigation stops when its verified editor does not move',async()=>{
 const identity={handle:'ours',caption:'Reviewed'},base=[n('layout_edit_media_info_layout'),n('action_bar_title','Edit info'),n('edit_media_username','ours'),n('edit_media_scroll_view','',{bounds:'[0,80][540,1100]'})];
 for(const [fn,caption,expected] of [[anchorEditInfo,[],/complete existing-post caption/],[readEditMusic,[n('edit_media_caption','Reviewed')],/Scroll below Add product details/]]){
  let gestures=0;const s={screen:async()=>[...base,...caption],adb:async()=>{gestures++;}};
  await assert.rejects(fn(s,identity),expected);assert.equal(gestures,1);
 }
});

const inheritedClip=(start='12.5')=>[n('music_editor_done_button','',{'content-desc':'Done'}),n('delete_button','',{'content-desc':'Remove music'}),n('album_art_button','',{'content-desc':'Return to music search'}),n('duration','',{'content-desc':'15 second clip'}),n('slider',start,{tag:'android.widget.SeekBar','content-desc':'Select the part of the audio track to use'})];
test('Story checkpoints are pure and reject unowned, partial or ambiguous screens',()=>{
 const library=[n('row_search_edit_text'),n('music_browser_container')],clip=inheritedClip(),before=structuredClone(clip);
 assert.deepEqual(storyMusicCheckpoint(library),{kind:'library'});assert.equal(storyMusicCheckpoint(clip),null);assert.equal(storyMusicCheckpoint(clip,{allowInherited:true}).kind,'inherited');assert.deepEqual(clip,before);
 for(const nodes of [[n('row_search_edit_text')],[...library,n('row_search_edit_text')],[...library,n('music_editor_controls_container')],clip.filter(n=>n['resource-id']!==nativeId('delete_button')),clip.map(n=>({...n,package:'other.app'})),[...clip,n('password','',{password:'true'})]])assert.equal(storyMusicCheckpoint(nodes,{allowInherited:true}),null);
});
test('the inherited Story route uses renamed Music navigation and only local Done',async()=>{
 const worker=new InstagramAndroidWorker({dataDir:'unused-offline-fixture'}),calls=[];let nodes=[n('story_share_controls_action_bar'),musicButton()];
 const s={screen:async()=>nodes,until:async(fn,message)=>{const value=await fn(nodes);if(!value)throw Error(message);return value;},click:async(using,selector)=>{calls.push('Music');assert.equal(using,'xpath');assert(selector.includes('@text="Music"'));nodes=inheritedClip();},clickId:async id=>{assert.equal(id,'music_editor_done_button');calls.push('local Done');nodes=[n('story_share_controls_action_bar')];}};
 const result=await worker.applyStoryMusic(s,{title:'Reviewed',artist:'Artist'},{allowInherited:true});
 assert(result.inherited&&result.sourceVerified);assert.deepEqual(calls,['Music','local Done']);
});
test('an inherited Story handoff checks without tapping and resumes its local checkpoint once',async()=>{
 const worker=new InstagramAndroidWorker({dataDir:'unused-offline-fixture'}),calls=[];let nodes=[n('story_share_controls_action_bar')],handoffs=0;
 const s={screen:async()=>nodes,until:async(fn,message)=>{const value=await fn(nodes);if(!value)throw Error(message);return value;},click:async()=>assert.fail('Handoff cannot reopen controls'),clickId:async id=>{assert.equal(id,'music_editor_done_button');calls.push('local Done');nodes=[n('story_share_controls_action_bar')];}};
 const ctx={intervene:async(details,inspect)=>{handoffs++;assert.equal(details.kind,'navigation');assert.equal(await inspect(),null);nodes=inheritedClip().map(n=>({...n,package:'other.app'}));assert.equal(await inspect(),null);nodes=inheritedClip();const result=await inspect();assert.equal(result.kind,'inherited');assert.deepEqual(calls,[]);return result;}};
 const result=await worker.applyStoryMusic(s,{title:'Reviewed',artist:'Artist'},{allowInherited:true,ctx});assert(result.sourceVerified);assert.equal(handoffs,1);assert.deepEqual(calls,['local Done']);
});
test('a lost Story Music click that completed is inspected without another click or handoff',async()=>{
 const worker=new InstagramAndroidWorker({dataDir:'unused-offline-fixture'}),calls=[];let nodes=[n('story_share_controls_action_bar'),n('music_button','',{'resource-id':'music_button'})];
 const s={screen:async()=>nodes,until:async fn=>fn(nodes),click:async(using,id)=>{assert.equal(id,'music_button');calls.push('Music');nodes=inheritedClip();throw Error('Lost response');},clickId:async id=>{assert.equal(id,'music_editor_done_button');calls.push('local Done');nodes=[n('story_share_controls_action_bar')];}};
 await worker.applyStoryMusic(s,{title:'Reviewed',artist:'Artist'},{allowInherited:true,ctx:{intervene:async()=>assert.fail('The completed action needs no handoff')}});
 assert.deepEqual(calls,['Music','local Done']);
});
test('a library handoff resumes song review without reopening Music or accepting inherited audio',async()=>{
 const worker=new InstagramAndroidWorker({dataDir:'unused-offline-fixture'}),calls=[],song={title:'Reviewed',artist:'Artist'};let nodes=[n('story_share_controls_action_bar')],handoffs=0;
 const library=[n('row_search_edit_text'),n('music_browser_container'),n('select','',{'resource-id':'audio_bar_select_tap_target','content-desc':'Select track Reviewed by Artist'}),n('pause','',{'content-desc':'Pause track Reviewed by Artist'})];
 const s={screen:async()=>nodes,until:async(fn,message)=>{for(let i=0;i<3;i++){const value=await fn(nodes);if(value)return value;}throw Error(message);},click:async(using,id)=>{if(id==='audio_bar_select_tap_target'){calls.push('select reviewed track');nodes=inheritedClip();}else{assert.equal(using,'accessibility id');assert.equal(id,'Music Only');calls.push('Music Only');}},clickId:async id=>{assert.equal(id,'music_editor_done_button');calls.push('local Done');nodes=[n('story_share_controls_action_bar')];}};
 const ctx={intervene:async(details,inspect)=>{handoffs++;assert.equal(details.kind,'navigation');nodes=inheritedClip();assert.equal(await inspect(),null);nodes=library;const result=await inspect();assert.deepEqual(result,{kind:'library'});assert.deepEqual(calls,[]);return result;}};
 const result=await worker.applyStoryMusic(s,song,{ctx});assert.equal(result.style,'Music Only');assert.equal(handoffs,1);assert.deepEqual(calls,['select reviewed track','Music Only','local Done']);
});
