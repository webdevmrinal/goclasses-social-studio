// Copyright (c) 2026 Mrinal. Offline native fixtures; no account or publication.
import test from 'node:test';import assert from 'node:assert/strict';
import {nativeId} from '../server/automation/android-native.js';
import {matchesMusicReference,resolveMusic,visibleMusicChoice,previewMusicChoice,assistNativeStage} from '../server/automation/native-music.js';
const song={key:'234567',title:'Hype!',artist:'VastPenguin, Another Artist',length:'2:31',selector:'audio_browser_track_0_234567'},ref={title:'hype',artist:'vastpenguin'};
const n=(id,values={})=>({'resource-id':id,displayed:'true',package:'com.instagram.android',...values});
const library=(rows=[song],preview)=>[n(nativeId('row_search_edit_text')),n(nativeId('music_browser_container')),...rows.flatMap(r=>[n(r.selector),n(nativeId('song_title'),{text:r.title}),n(nativeId('artist_name'),{text:r.artist+' · '+r.length})]),...(preview?[n('audio_bar_select_tap_target',{'content-desc':'Select track '+preview.title+' by '+preview.artist}),n('audio_bar_playback_tap_target'),n('pause',{'content-desc':'Pause track '+preview.title+' by '+preview.artist})]:[])];
test('music lookup tolerates punctuation, casing, accents and collaboration credits, but keeps variants distinct',()=>{
 for(const artist of ['VastPenguin','vastpenguin','Another Artist'])assert(matchesMusicReference(song,{...ref,artist}));
 assert(matchesMusicReference({...song,title:'Hype! (Official Audio)'},ref));assert(matchesMusicReference({...song,title:'Café'},{title:'cafe',artist:'VastPenguin'}));
 for(const other of [{title:'Hype! Remix'},{artist:'Penguin'},{key:'987654'}])assert(!matchesMusicReference(song,{...ref,...other}));
 assert(!matchesMusicReference({...song,title:'राम'},{title:'रम',artist:'VastPenguin'}),'Indic vowel marks are meaningful, not removable accents');
 assert(!matchesMusicReference({...song,artist:'Someone Else'},ref));assert(!matchesMusicReference(song,{title:'',artist:'VastPenguin'}));
});
test('visible recommendation or already previewed song is used without searching, scrolling or re-clicking',async()=>{
 for(const preview of [undefined,song]){const s={screen:async()=>library([song],preview),click:async()=>assert.fail('No search/click'),adb:async()=>assert.fail('No scroll')};const found=await resolveMusic(s,ref);assert.deepEqual(found,song);if(preview)await previewMusicChoice(s,found);}
});
test('multiple matching native IDs ask the user before selecting or searching',async()=>{
 const other={...song,key:'345678',selector:'audio_browser_track_1_345678'},s={screen:async()=>library([song,other]),click:async()=>assert.fail('No mutation')};let asked=0;
 const selected=await resolveMusic(s,ref,{intervene:async(details,inspect)=>{asked++;assert.equal(details.kind,'music');assert.match(details.instructions,/Do not tap/);assert.equal(await inspect(),null);s.screen=async()=>library([song,other],other);assert.deepEqual(await inspect(),{title:other.title,artist:other.artist});return other;}});assert.equal(asked,1);assert.equal(selected.key,other.key);
});
test('a missing song or slow library asks for manual preview, without applying the wrong track',async()=>{
 const s={screen:async()=>[],click:async()=>assert.fail('No mutation')};let asked=0;const picked=await resolveMusic(s,ref,{intervene:async(details,inspect)=>{asked++;s.screen=async()=>library([],song);const value=await inspect();assert.equal(value.title,song.title);return value;}});assert.equal(asked,1);assert.equal(picked.artist,song.artist);
});
test('manual preview reading rejects duplicate selectors, no playback proof and malformed labels',()=>{
 assert.equal(visibleMusicChoice(library()),null);const frame=library([song],song);assert(visibleMusicChoice(frame));assert.equal(visibleMusicChoice([...frame,frame.find(x=>x['resource-id']==='audio_bar_select_tap_target')]),null);assert.equal(visibleMusicChoice(frame.filter(x=>x['resource-id']!=='pause')),null);
});
test('a blocked navigation resumes at the verified screen, without replaying Edit',async()=>{
 let attempts=0,checks=0;const result=await assistNativeStage({screen:async()=>['Edit info']},{intervene:async(details,inspect)=>{assert.equal(details.kind,'navigation');return inspect();}},{kind:'navigation',instructions:'Open Edit info'},async()=>{attempts++;throw Error('Edit missing');},nodes=>{checks++;return nodes[0]==='Edit info'?{caption:'exact'}:null;});assert.deepEqual(result,{caption:'exact'});assert.equal(attempts,1);assert.equal(checks,1);
});
test('cancellation never opens a new handoff or retries a native action',async()=>{
 const s={signal:AbortSignal.abort(Error('Stopped')),screen:async()=>{throw Error('Unavailable');}};await assert.rejects(resolveMusic(s,ref,{intervene:()=>assert.fail('No handoff after stop')}),/Stopped/);
});

test('a searched song resolves by title and collaboration credit without a second query',async()=>{
 let searched=false,queries=0;const s={screen:async()=>library(searched?[song]:[]),clickId:async id=>assert.equal(id,'row_search_edit_text'),text:async(using,id,value)=>{queries++;assert.equal(value,'hype');searched=true;},until:async fn=>{for(let i=0;i<6;i++){const result=await fn(await s.screen());if(result)return result;}throw Error('Fixture wait');}};
 // Search acknowledgement is part of the native screen, not a fabricated result.
 const screen=s.screen;s.screen=async()=>{const rows=await screen();rows.find(x=>x['resource-id']===nativeId('row_search_edit_text')).text=searched?'hype':'';return rows;};
 assert.equal((await resolveMusic(s,ref)).key,song.key);assert.equal(queries,1);
});
test('existing-post music pins the full native credit and completes only the local clip Done',async()=>{
 const {chooseEditMusic}=await import('../server/automation/native-edit-music.js');let phase='edit',done=0;const identity={handle:'ours',caption:'Reviewed'},own=(id,text='')=>n(nativeId(id),{text});
 const s={screen:async()=>phase==='edit'?[own('layout_edit_media_info_layout'),own('action_bar_title','Edit info'),own('edit_media_username','ours'),own('edit_media_caption','Reviewed'),own('edit_media_scroll_view'),own('m2_audio_row'),own('m2_audio_primary_text',done?song.title:'Add music'),own('m2_audio_secondary_text',done?song.artist:'')]:phase==='library'?library():phase==='preview'?library([song],song):[own('action_bar_title','Add audio'),own('music_editor_controls_container'),own('song_title',song.title),own('track_artist',song.artist),own('action_bar_button_action'),n('clip',{tag:'android.widget.SeekBar','content-desc':'Select the part of the audio track to use',text:'12.5'})],until:async fn=>{const value=await fn(await s.screen());assert(value,'Expected exact native checkpoint');return value;},clickId:async id=>{if(id==='m2_audio_row'){assert.equal(phase,'edit');phase='library';}else{assert.equal(id,'action_bar_button_action');assert.equal(phase,'clip');phase='edit';done++;}},click:async(using,id)=>{assert.equal(using,'id');if(id===song.selector){assert.equal(phase,'library');phase='preview';}else{assert.equal(id,'audio_bar_select_tap_target');assert.equal(phase,'preview');phase='clip';}},text:async()=>assert.fail('Visible song must not search'),adb:async()=>assert.fail('No scrolling needed')};
 const selected=await chooseEditMusic(s,ref,identity);assert.equal(selected.artist,song.artist);assert.equal(selected.title,song.title);assert.equal(selected.key,song.key);assert.equal(done,1,'Only local Add audio Done, never the outer online Save');
});
