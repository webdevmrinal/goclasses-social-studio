// Copyright (c) 2026 Mrinal. Pure sanitization fixtures; no network or device.
import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationAIContext} from '../server/automation/navigation-ai-context.js';
const prefix='com.instagram.android:id/';
const n=(resource='',text='',extra={})=>({package:'com.instagram.android',displayed:'true',class:'android.widget.TextView','resource-id':resource?prefix+resource:'',text,'content-desc':'',clickable:'false',enabled:'true',...extra});
const details={kind:'navigation',title:'Open Instagram music',reason:'Private error with caption',instructions:'Private user instruction',requested:{title:'Private song'}};
const ready=()=>[n('media_thumbnail_tray_button'),n('new_audio_control','Music',{clickable:'true',class:'android.widget.Button'})];

test('projects only safe navigation fields and fixed stage names',()=>{
 const nodes=ready();nodes[1].bounds='[123,456][789,999]';nodes[1]['content-desc']='Private account Mrinal';nodes[1].secret='private';const before=structuredClone(nodes);
 const result=navigationAIContext(nodes,details);
 assert.equal(result.stage,'open_feed_music');assert.equal(result.controls[1].label,'Music');assert(!result.controls[1].resourceId);
 const json=JSON.stringify(result);for(const privateValue of ['Private','Mrinal','123','789','secret','new_audio_control','requested','instructions','reason'])assert(!json.includes(privateValue));
 assert.deepEqual(nodes,before);
 for(const control of result.controls)for(const key of Object.keys(control))assert(['label','resourceId','className','clickable','enabled','scrollable'].includes(key));
});
test('captions, usernames, track metadata, search queries and arbitrary IDs never leave the tree',()=>{
 const secrets=['Private caption','private_account_handle','Rare private song','Private artist','private query','private dynamic id'];
 const nodes=[...ready(),n('edit_media_caption',secrets[0]),n('edit_media_username',secrets[1]),n('song_title',secrets[2]),n('track_artist',secrets[3]),n('row_search_edit_text',secrets[4],{class:'android.widget.EditText'}),n(secrets[5],secrets[0])];
 const result=navigationAIContext(nodes,details),json=JSON.stringify(result);
 for(const secret of secrets)assert(!json.includes(secret));assert(result.controls.some(c=>c.resourceId===prefix+'row_search_edit_text'));
});
test('even an allowlisted word entered as a search query stays private',()=>{
 const result=navigationAIContext([n('row_search_edit_text','Music',{class:'android.widget.EditText','content-desc':'Music'})],details);
 assert(result);assert(!result.controls[0].label);assert(!JSON.stringify(result).includes('"Music"'));
});
for(const [title,stage] of [
 ['Open Instagram music','open_feed_music'],['Open Story music','open_story_music'],
 ['Show the post\u2019s music row','find_post_music_row'],["Show the post's music row",'find_post_music_row'],
 ['Open Edit info in Instagram','open_post_edit'],['Open the post music library','open_post_music'],
 ['Wait for the audio clip','review_audio_clip'],['Return to Edit info','return_to_post_edit'],
 ['Review Story sharing options','review_story_audience']
])test('maps code-owned title '+title,()=>assert.equal(navigationAIContext(ready(),{kind:'navigation',title}).stage,stage));
test('unknown stages and non-navigation handoffs never produce AI context',()=>{
 for(const value of [null,{}, {...details,title:'Private caption as stage'},{...details,kind:'music'},{...details,title:'__proto__'}])assert.equal(navigationAIContext(ready(),value),null);
});
for(const [name,extra] of [
 ['system overlay',n('system','',{package:'android'})],
 ['other app',n('foreign','',{package:'other.app'})],
 ['missing ownership',n('unknown','',{package:undefined})],
 ['password',n('field','private',{password:'true'})],
 ['secure field',n('field','private',{secure:true})],
 ['sensitive field',n('field','private',{sensitive:'true'})],
 ['login resource',n('login_username','private')],
 ['verification resource',n('verification_code','123456')],
 ['recipient resource',n('recipient_picker_radio_button','private')],
 ['direct sharing',n('direct_external_share_container_view','private')],
 ['message composer',n('message_composer','private')],
 ['login label',n('unknown','Log in to Instagram')],
 ['security label',n('unknown','Enter your security code')],
 ['recipient label',n('unknown','Send to')],
 ['unknown editable field',n('new_field','private account',{class:'android.widget.EditText'})],
 ['identity prompt',n('unknown','Phone number, username, or email')],
 ['account creation',n('unknown','Create new account')]
])test(name+' closes the entire context gate',()=>assert.equal(navigationAIContext([...ready(),extra],details),null));
test('a sensitive node beyond all output limits still closes the gate',()=>{
 const nodes=Array.from({length:100},()=>n('music_browser_container'));nodes.push(n('password','secret',{password:'true'}));assert.equal(navigationAIContext(nodes,details),null);
});
test('hidden protected/foreign controls are neither sent nor mistaken for foreground',()=>{
 const result=navigationAIContext([...ready(),n('password','secret',{displayed:'false',password:'true',package:'other.app'})],details);
 assert(result);assert(!JSON.stringify(result).includes('secret'));
});
for(const label of ['Save','Share','Post','Publish','Send','Delete','Remove','Discard','Archive','Go live','Your story','Your stories','Close friends','Done'])test(label+' is never exposed as a suggested navigation control',()=>{
 const nodes=[...ready(),n('control_option_text',label,{clickable:'true'}),n('action_bar_button_action',label,{clickable:'true'})],json=JSON.stringify(navigationAIContext(nodes,details));
 assert(!json.includes('"label":"'+label+'"'));assert(!json.includes('action_bar_button_action'));
 assert(!json.includes('control_option_text'));
});
test('unsafe renamed resource tokens cannot be smuggled behind a Music label',()=>{
 const result=navigationAIContext([...ready(),n('share_footer_button','Music',{class:'android.widget.Button',clickable:'true'})],details);
 assert.equal(result.controls.filter(c=>c.label==='Music').length,1);
});
test('only fixed resource and class tokens are emitted',()=>{
 const result=navigationAIContext([...ready(),n('music_browser_container','private',{class:'private.class.Name'}),n('audio_browser_track_0_123456789','private')],details),json=JSON.stringify(result);
 assert(!json.includes('private'));assert(!json.includes('123456789'));assert(!json.includes('audio_browser_track'));
 assert(result.controls.some(c=>c.resourceId===prefix+'music_browser_container'&&!c.className));
});
test('control count and complete JSON size remain bounded',()=>{
 const nodes=Array.from({length:200},()=>n('music_search_clips_landing_page_container','',{class:'androidx.recyclerview.widget.RecyclerView',clickable:'true',enabled:'true',scrollable:'true'}));
 const result=navigationAIContext(nodes,details);assert(result);assert(result.controls.length<=30);assert(JSON.stringify(result).length<=4000);assert(result.controls.length>0);
 const short=navigationAIContext(Array.from({length:50},()=>n('content_list','',{class:undefined,clickable:undefined,enabled:undefined})),details);assert.equal(short.controls.length,30);
});
test('empty, malformed, hidden-only and unsupported-only trees fail closed',()=>{
 for(const nodes of [null,{},[],[null],[n('secret','private')],[n('music_browser_container','',{displayed:'false'})],Array.from({length:5001},()=>n('content_list'))])assert.equal(navigationAIContext(nodes,details),null);
});
test('boolean flags are copied as booleans and arbitrary values are omitted',()=>{
 const result=navigationAIContext([n('content_list','',{clickable:true,enabled:false,scrollable:'private flag',bounds:'secret'})],details);
 assert.deepEqual(result.controls[0],{resourceId:prefix+'content_list',className:'android.widget.TextView',clickable:true,enabled:false});
});

test('private fields never become navigation labels even when their exact value is Music or Edit',()=>{
 const nodes=[...ready(),...['edit_media_caption','caption_input_text_view','edit_media_username','row_feed_photo_profile_name','song_title','track_artist','artist_name','m2_audio_primary_text'].map(id=>n(id,'Edit',{clickable:'true'})),n('m2_audio_row','Music',{clickable:'true'})];
 const result=navigationAIContext(nodes,details);
 assert(!result.controls.some(c=>c.label==='Edit'));assert.equal(result.controls.filter(c=>c.label==='Music').length,1);
 assert(result.controls.some(c=>c.resourceId===prefix+'m2_audio_row'&&!c.label));
});
