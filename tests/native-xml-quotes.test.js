// Copyright (c) 2026 Mrinal. Offline XML fixtures; no Android, account, or publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeNodes,nativeId,AndroidSession} from '../server/automation/android-native.js';
import {visibleMusicChoice,musicPlayback} from '../server/automation/native-music.js';
const song={key:'794869054356136',title:'Drake X BlocBoy JB Type Beat "Cash Flow"',artist:'Hrithik Mehra',length:'2:30',selector:'audio_browser_track_4_794869054356136'};
const quotedMusic=(playing=false,withRow=true)=>`<?xml version='1.0' encoding='UTF-8'?>
<hierarchy class="hierarchy" rotation='0'>
 <node class='android.widget.EditText' resource-id="${nativeId('row_search_edit_text')}" displayed='true' text=""/>
 <node class="android.view.ViewGroup" resource-id='${nativeId('music_browser_container')}' displayed="true"/>
 ${withRow?`<node class="android.view.ViewGroup" resource-id='${song.selector}' displayed="true"/>
 <node class='android.widget.TextView' resource-id="${nativeId('song_title')}" displayed='true' text='${song.title}'/>
 <node class="android.widget.TextView" resource-id='${nativeId('artist_name')}' displayed="true" text='${song.artist} • ${song.length}'/>`:''}
 <node class='android.view.View' resource-id="audio_bar_select_tap_target" displayed='true' content-desc='Select track ${song.title} by ${song.artist}'/>
 <node class="android.view.View" resource-id='audio_bar_playback_tap_target' displayed="true"/>
 <node class='android.widget.Button' resource-id="playback_label" displayed='true' content-desc='${playing?'Pause':'Play'} track ${song.title} by ${song.artist}'/>
</hierarchy>`;

test('mixed XML quote styles retain the exact quoted song and paused playback proof',()=>{
 const nodes=nativeNodes(quotedMusic());
 assert.deepEqual(visibleMusicChoice(nodes),song);
 assert.equal(musicPlayback(nodes,song),false);
 assert.equal(nodes.find(n=>n['resource-id']===nativeId('song_title')).text,song.title);
 assert.equal(nodes.find(n=>n['resource-id']==='audio_bar_select_tap_target')['content-desc'],'Select track '+song.title+' by '+song.artist);
});
test('a fresh selected preview is readable after an earlier empty check, for paused and playing tracks',()=>{
 const empty=nativeNodes('<hierarchy><node class="android.view.View" resource-id="com.instagram.android:id/music_browser_container" displayed="true"/></hierarchy>');
 assert.equal(visibleMusicChoice(empty),null);
 for(const playing of [false,true]){const nodes=nativeNodes(quotedMusic(playing));assert.deepEqual(visibleMusicChoice(nodes),song);assert.equal(musicPlayback(nodes,song),playing);}
});
test('quoted preview credits remain readable when the selected list row is offscreen',()=>{
 assert.deepEqual(visibleMusicChoice(nativeNodes(quotedMusic(false,false))),{title:song.title,artist:song.artist});
});
test('quoted text does not relax duplicate or cross-song preview checks',()=>{
 const nodes=nativeNodes(quotedMusic());
 assert.equal(visibleMusicChoice([...nodes,nodes.find(n=>n['resource-id']==='audio_bar_select_tap_target')]),null);
 const changed=quotedMusic().replace('Play track '+song.title+' by '+song.artist,'Play track A Different Song by '+song.artist);
 assert.equal(visibleMusicChoice(nativeNodes(changed)),null);
});
test('literal greater-than signs inside either attribute delimiter do not end a native tag',()=>{
 const nodes=nativeNodes(`<hierarchy><node class="android.widget.TextView" resource-id='first' text='A > B "quoted"' displayed="true"/><node class='android.widget.TextView' resource-id="second" text="C > D 'quoted'" displayed='true'/></hierarchy>`);
 assert.equal(nodes.length,2);assert.equal(nodes[0].text,'A > B "quoted"');assert.equal(nodes[1].text,"C > D 'quoted'");assert.equal(nodes[1].displayed,'true');
});
test('predefined and numeric XML entities decode once in both quote styles',()=>{
 const nodes=nativeNodes(`<node class='android.widget.TextView' text="A &amp; B &lt; C &gt; D &quot;quote&quot; &apos;apostrophe&apos; &#34; &#x1F3B5; &amp;quot;" resource-id='track' displayed='true'/>`);
 assert.equal(nodes[0].text,`A & B < C > D "quote" 'apostrophe' " 🎵 &quot;`);
});
test('encoded tag-like text stays text rather than creating native controls',()=>{
 const nodes=nativeNodes(`<node class='android.widget.TextView' resource-id="track" text='&lt;node class=&quot;android.widget.EditText&quot; password=&quot;true&quot;/&gt;' displayed='true'/>`);
 assert.equal(nodes.length,1);assert.equal(nodes[0].password,undefined);assert.equal(nodes[0].text,'<node class="android.widget.EditText" password="true"/>');
});
test('single-quoted password attributes retain the native protected-screen guard',async()=>{
 const s=Object.create(AndroidSession.prototype);s.request=async()=>`<hierarchy><node class='android.widget.EditText' resource-id="password" password='true' displayed='true' text='private'/></hierarchy>`;s.click=()=>assert.fail('A protected-screen read cannot click');
 await assert.rejects(s.screen(),/Finish Instagram sign-in/);
});
test('ordinary double-quoted native nodes retain all existing properties',()=>{
 const xml='<hierarchy><android.widget.TextView class="android.widget.TextView" resource-id="title" text="A &amp; B" displayed="true" enabled="true" bounds="[0,1][20,30]"/></hierarchy>';
 assert.deepEqual(nativeNodes(xml),[{tag:'android.widget.TextView',class:'android.widget.TextView','resource-id':'title',text:'A & B',displayed:'true',enabled:'true',bounds:'[0,1][20,30]'}]);
});
test('malformed attributes fail closed instead of exposing a partial screen or losing a password flag',()=>{
 const valid='<node class="android.widget.Button" resource-id="button" displayed="true"/>';
 for(const bad of [
  `<node class='android.widget.EditText' password='true>`,
  `<node class="android.widget.EditText" password=true/>`,
  `<node class="android.widget.EditText"password='true'/>`,
  `<node class='android.widget.EditText' password='true' password="false"/>`,
  `<node class="android.widget.TextView" text="Wrong "quote""/>`,
  `<node class='android.widget.TextView' text='unterminated>`,
  `<node class='android.widget.TextView' text='literal < tag'/>`,
  `<node class='android.widget.TextView' text='&#x110000;'/>`,
  `<node class='android.widget.TextView' text='&#xD800;'/>`,
  `<node class='android.widget.TextView' text='&#0;'/>`
 ])assert.deepEqual(nativeNodes('<hierarchy>'+valid+bad+'</hierarchy>'),[],bad);
});
