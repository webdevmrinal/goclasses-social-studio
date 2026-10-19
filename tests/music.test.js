// Copyright (c) 2026 Mrinal. Native music fixtures; no emulator or publishing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {nativeId} from '../server/automation/android-native.js';
import {musicResults,expandMusicTray,scrollMusicPage,revealMusicResult,setMusicPlayback,musicPlayback} from '../server/automation/native-music.js';
import {InstagramAndroidWorker} from '../server/automation/instagram-android.js';
const node=(id,attrs={})=>({'resource-id':id,displayed:'true',...attrs});
const songs=Array.from({length:20},(_,i)=>({key:String(9000+i),title:'Song '+i,artist:'Artist '+i,length:'3:10',selector:'audio_browser_track_'+i+'_'+(9000+i)}));
function nativeFixture(){
 const s={expanded:false,page:0,playing:false,track:null,touches:[],closed:false};
 s.screen=async()=>{
  const start=s.expanded?[0,6,12][s.page]:0,rows=songs.slice(start,start+(s.expanded?9:3)),y=s.expanded?136:824;
  return [node(nativeId('bottom_sheet_container'),{bounds:'[0,136][720,1512]'}),node(nativeId('bottom_sheet_drag_handle_frame'),{bounds:'[0,'+y+'][720,'+(y+48)+']'}),node(nativeId('music_search_clips_landing_page_container')),node(nativeId('row_search_edit_text')),node(nativeId('content_list'),{bounds:s.expanded?'[0,418][720,1512]':'[0,1106][720,1512]'}),...rows.flatMap(r=>[node(r.selector),node(nativeId('song_title'),{text:r.title}),node(nativeId('artist_name'),{text:r.artist+' \u2022 '+r.length})]),...(s.track?[node('audio_bar',{bounds:'[16,1368][704,1484]'}),node('audio_bar_select_tap_target',{'content-desc':'Select track '+s.track.title+' by '+s.track.artist}),node('audio_bar_playback_tap_target'),node('',{'content-desc':(s.playing?'Pause':'Play')+' track '+s.track.title+' by '+s.track.artist})]:[])];
 };
 s.until=async predicate=>{for(let i=0;i<10;i++){const value=await predicate(await s.screen());if(value)return value;}throw Error('Fixture wait did not settle');};
 s.adb=async args=>{s.touches.push(args);if(!s.expanded)s.expanded=true;else s.page=Math.max(0,Math.min(2,s.page+(+args[4]>+args[6]?1:-1)));};
 s.click=async(using,id)=>{s.touches.push(id);if(id==='audio_bar_playback_tap_target')s.playing=!s.playing;else{const song=songs.find(r=>r.selector===id);assert(song);s.track=song;s.playing=true;}};
 s.close=async()=>{s.closed=true;};return s;
}
test('music tray expands before listing songs and scrolling stays inside the list above the player',async()=>{
 const s=nativeFixture();assert.equal(musicResults(await s.screen()).length,3);assert.equal((await expandMusicTray(s)).length,9);assert.equal(s.expanded,true);
 s.track=songs[0];const rows=await scrollMusicPage(s);assert.equal(rows[0].key,songs[6].key);const gesture=s.touches.at(-1);assert(+gesture[4]<1368);assert(+gesture[6]>418);
 const unknown={screen:async()=>[node(nativeId('profile_tab'))],adb:async()=>assert.fail('No gesture outside music')};await assert.rejects(scrollMusicPage(unknown),/library changed/);
});
test('pagination deduplicates real tracks and old choices recover after native rows are recycled',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-music-pages-')),s=nativeFixture(),worker=new InstagramAndroidWorker({dataDir:dir});
 try{
  worker.s=s;worker.busy=true;worker.picker={query:'',account:'fixture',results:await expandMusicTray(s),hasMore:true};
  const more=await worker.more();assert.equal(more.results.length,20);assert.equal(new Set(more.results.map(r=>r.key)).size,20);assert.equal(s.page,2);
  const preview=await worker.preview(songs[1].key);assert.equal(preview.playback.paused,false);assert.equal(s.page,0);
  assert.equal((await worker.pause()).playback.paused,true);assert.equal(s.playing,false);
  assert.equal((await worker.preview(songs[1].key)).playback.paused,false);assert.equal(s.playing,true);
  assert.equal((await worker.more()).hasMore,false);assert.equal(s.page,2);
  const selected=await worker.choose(songs[1].key);assert.equal(selected.selection.query,songs[1].title);assert.equal(selected.selection.key,songs[1].key);assert(s.closed);assert(!worker.busy);
 }finally{await worker.close();if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('mrinal-music-pages-'))await fs.rm(dir,{recursive:true,force:true});}
});
test('pause is idempotent and refuses a changed native preview instead of toggling another song',async()=>{
 const s=nativeFixture();s.expanded=true;s.track=songs[0];s.playing=false;
 assert.equal(musicPlayback(await s.screen(),songs[0]),false);assert.equal((await setMusicPlayback(s,songs[0],false)).paused,true);assert.equal(s.touches.length,0);
 await assert.rejects(setMusicPlayback(s,songs[1],false),/preview changed/);assert.equal(s.touches.length,0);
 await setMusicPlayback(s,songs[0],true);assert.equal(s.playing,true);await setMusicPlayback(s,songs[0],false);assert.equal(s.playing,false);
 await assert.rejects(revealMusicResult(s,{...songs[0],title:'A different song'}),/exact song/);assert.equal(s.track.key,songs[0].key);
});
