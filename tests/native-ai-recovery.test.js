// Copyright (c) 2026 Mrinal. Offline native AI recovery fixtures; no device or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeId} from '../server/automation/android-native.js';
import {AccountMismatchError} from '../server/automation/utils.js';
import {recoverNativeWithAI} from '../server/automation/native-ai-recovery.js';

const n=(id,text='',extra={})=>({'resource-id':nativeId(id),text,'content-desc':'',class:'android.widget.TextView',package:'com.instagram.android',displayed:'true',enabled:'true',clickable:'false',scrollable:'false',bounds:'[20,120][250,170]',...extra});
const button=(id,text,extra={})=>n(id,text,{clickable:'true',...extra});
const photo=(extra=[])=>[n('media_thumbnail_tray_button'),button('changed_music_button','Music',{class:'android.widget.ImageButton'}),...extra];
const library=()=>[n('row_search_edit_text','',{class:'android.widget.EditText'}),n('music_browser_container')];
const menu=(extra=[])=>[n('action_sheet_container','',{bounds:'[0,0][540,1170]'}),n('recycler_view','',{bounds:'[10,100][530,1100]',scrollable:'true'}),n('control_option_text','Save'),...extra];
const editor=(extra=[])=>[n('layout_edit_media_info_layout','',{bounds:'[0,60][540,1170]'}),n('action_bar_title','Edit info'),n('edit_media_scroll_view','',{bounds:'[10,100][530,1100]',scrollable:'true'}),n('edit_media_username','private_account'),n('edit_media_caption','PRIVATE REVIEWED CAPTION',{class:'android.widget.EditText'}),...extra];
const feedDetails={kind:'navigation',title:'Open Instagram music'};
const editDetails={kind:'navigation',title:'Open Edit info in Instagram',verifiedPost:true};
const ready=nodes=>nodes.some(node=>node['resource-id']===nativeId('music_browser_container'))&&{screen:'music-library'};
function fixture(nodes,{onAction,onFind,screen,rect={x:0,y:0,width:540,height:1170}}={}){
 const s={nodes,reads:0,finds:[],mutations:[],requests:[],signal:undefined,
  async screen(options){this.reads++;this.lastDeadline=options?.deadline;return screen?screen(this):this.nodes;},
  async find(using,value,options){this.finds.push({using,value,deadline:options?.deadline});if(onFind)await onFind(this);return 'local-element';},
  async request(endpoint,method='GET',body,options){this.requests.push({endpoint,method,body,deadline:options?.deadline});if(endpoint==='/window/rect')return rect;assert(method==='POST');assert(endpoint==='/element/local-element/click'||endpoint==='/execute/sync');this.mutations.push({endpoint,body});return onAction?onAction(this,endpoint,body):null;}
 };return s;
}
function provider(action={type:'click',controlId:'c1'},overrides={}){
 const calls=[];return {calls,state:()=>({enabled:true,automatic:true}),async plan(input){calls.push(input);return typeof action==='function'?action(input):{action,model:'gemini-offline-fixture'};},...overrides};
}
const recover=(s,ai,options={})=>recoverNativeWithAI({s,ai,details:feedDetails,inspect:ready,...options});

test('a renamed Music button is clicked once, with only a sanitized local control token sent',async()=>{
 const s=fixture(photo([n('unknown_private_id','PRIVATE SECRET'),n('song_title','PRIVATE SONG')]),{onAction:s=>{s.nodes=library();return null;}}),ai=provider(),steps=[];
 const result=await recover(s,ai,{step:async text=>steps.push(text)});assert(result.completed);assert.deepEqual(result.proof,{screen:'music-library'});assert.equal(result.actions,1);assert.equal(s.mutations.length,1);assert.equal(ai.calls.length,1);assert.equal(ai.calls[0].platform,'instagram_android');assert.equal(ai.calls[0].stage,'open_feed_music');assert.deepEqual(ai.calls[0].controls,[{id:'c1',label:'Music',role:'button',enabled:true,scrollable:false}]);
 const sent=JSON.stringify({...ai.calls[0],signal:undefined});for(const value of ['PRIVATE','changed_music_button','bounds','caption','unknown_private_id'])assert(!sent.includes(value));assert(s.finds[0].value.includes('@resource-id="'+nativeId('changed_music_button')+'"'));assert(s.finds[0].deadline>Date.now());assert(steps.every(text=>text.startsWith('Gemini recovery 1/3:')));
});
test('already completed navigation needs no provider or mutation',async()=>{
 const s=fixture(library()),ai=provider(),result=await recover(s,ai);assert(result.completed);assert.equal(ai.calls.length,0);assert.equal(s.mutations.length,0);
});
for(const settings of [{enabled:false,automatic:false},{enabled:true,automatic:false},{enabled:false,automatic:true},{}])test('automatic recovery requires both opt-ins: '+JSON.stringify(settings),async()=>{
 const s=fixture(photo()),ai=provider(undefined,{state:()=>settings}),result=await recover(s,ai);assert(!result.completed);assert.equal(ai.calls.length,0);assert.equal(s.reads,0);assert.equal(s.mutations.length,0);
});
for(const extra of [n('password','',{password:'true'}),n('overlay','',{package:'other.app'}),n('login_username','PRIVATE'),n('direct_external_share_container_view'),n('input','PRIVATE',{class:'android.widget.EditText'}),n('system','',{package:'android'})])test('protected or mixed screen never reaches the provider: '+extra['resource-id'],async()=>{
 const s=fixture(photo([extra])),ai=provider(),result=await recover(s,ai,{inspect:()=>true});assert(!result.completed);assert.equal(ai.calls.length,0);assert.equal(s.mutations.length,0);
});
for(const label of ['Save','Share','Post','Publish','Send','Delete','Discard','Done','Your story','Your stories','Close friends'])test('final button '+label+' cannot be planned or clicked',async()=>{
 const s=fixture([n('media_thumbnail_tray_button'),button('changed_final_button',label)]),ai=provider(),result=await recover(s,ai);assert(!result.completed);assert.equal(ai.calls.length,0);assert.equal(s.mutations.length,0);
});
test('ambiguous Music controls stop before a provider request',async()=>{
 const s=fixture(photo([button('second_music','Audio')])),ai=provider(),result=await recover(s,ai);assert(!result.completed);assert.equal(ai.calls.length,0);assert.equal(s.mutations.length,0);
});
for(const action of [{type:'click',controlId:'c99'},{type:'click',controlId:nativeId('changed_music_button')},{type:'click',controlId:'c1',selector:'Share'},{type:'scroll',controlId:'c1',direction:'down'},{type:'back'},{type:'shell',command:'adb shell input tap 2 3'}])test('unbound or unsupported plan is rejected: '+JSON.stringify(action),async()=>{
 const s=fixture(photo()),ai=provider(action),result=await recover(s,ai);assert(!result.completed);assert.equal(s.mutations.length,0);assert.equal(s.finds.length,0);
});
test('a stale changed UI is inspected but never receives the previous plan',async()=>{
 const s=fixture(photo()),ai=provider(async()=>{s.nodes=photo([n('new_overlay_label','changed')]);return {action:{type:'click',controlId:'c1'}};}),result=await recover(s,ai);assert(!result.completed);assert.match(result.reason,/changed while planning/);assert.equal(s.mutations.length,0);assert.equal(result.trace[0].status,'stale');
});
test('a navigation that completes during planning is accepted without a click',async()=>{
 const s=fixture(photo()),ai=provider(async()=>{s.nodes=library();return {action:{type:'click',controlId:'c1'}};}),result=await recover(s,ai);assert(result.completed);assert.equal(result.actions,0);assert.equal(s.mutations.length,0);
});
test('quota/cooldown/null plans hand back promptly without an action',async()=>{
 const s=fixture(photo()),ai=provider(async()=>null),started=Date.now(),result=await recover(s,ai);assert(!result.completed);assert.match(result.reason,/unavailable or resting/);assert(Date.now()-started<1000);assert.equal(ai.calls.length,1);assert.equal(s.mutations.length,0);
});
test('a provider exception is contained without exposing its raw error',async()=>{
 const s=fixture(photo()),ai=provider(async()=>{throw Error('PRIVATE TOKEN quota exceeded');}),result=await recover(s,ai);assert(!result.completed);assert(!JSON.stringify(result).includes('PRIVATE'));assert.equal(s.mutations.length,0);
});
test('cancellation prevents reads and provider work',async()=>{
 const s=fixture(photo()),ai=provider(),signal=AbortSignal.abort(Error('User stopped'));await assert.rejects(recover(s,ai,{signal}),/User stopped/);assert.equal(s.reads,0);assert.equal(ai.calls.length,0);
});
test('cancellation while planning prevents dispatch',async()=>{
 const controller=new AbortController(),s=fixture(photo()),ai=provider(async()=>{controller.abort(Error('User stopped'));return {action:{type:'click',controlId:'c1'}};});await assert.rejects(recover(s,ai,{signal:controller.signal}),/User stopped/);assert.equal(s.mutations.length,0);
});
test('account mismatch from the inspector propagates without AI',async()=>{
 const s=fixture(photo()),ai=provider(),error=new AccountMismatchError('Wrong account');await assert.rejects(recover(s,ai,{inspect:()=>{throw error;}}),value=>value===error);assert.equal(ai.calls.length,0);assert.equal(s.mutations.length,0);
});
for(const reason of ['The Android caption does not match the reviewed draft.','The existing post account or caption changed.','The images differ from the reviewed selection.'])test('content verification error never goes to Gemini: '+reason,async()=>{
 const s=fixture(photo()),ai=provider(),result=await recover(s,ai,{details:{...feedDetails,reason}});assert(!result.completed);assert.equal(ai.calls.length,0);assert.equal(s.reads,0);
});
test('Edit needs the explicit verified-post marker',async()=>{
 const s=fixture(menu([button('renamed_edit','Edit')])),ai=provider(),result=await recover(s,ai,{details:{kind:'navigation',title:'Open Edit info in Instagram'},inspect:()=>false});assert(!result.completed);assert.equal(ai.calls.length,0);assert.equal(s.mutations.length,0);
});
test('a verified renamed Edit row opens only within its observed menu',async()=>{
 const s=fixture(menu([button('renamed_edit','Edit')]),{onAction:s=>{s.nodes=editor();return null;}}),ai=provider(),result=await recover(s,ai,{details:editDetails,inspect:nodes=>nodes.some(node=>node['resource-id']===nativeId('layout_edit_media_info_layout'))&&{editor:true}});assert(result.completed);assert.equal(s.mutations.length,1);assert.equal(ai.calls[0].controls[0].label,'Edit');assert(!JSON.stringify(ai.calls[0].controls).includes('Save'));
});
test('a verified menu can scroll and then click newly visible Edit',async()=>{
 let count=0;const s=fixture(menu(),{onAction:(s,endpoint)=>{if(++count===1){assert.equal(endpoint,'/execute/sync');s.nodes=menu([button('renamed_edit','Edit')]);return true;}s.nodes=editor();return null;}}),ai=provider(input=>({action:input.controls.some(control=>control.label==='Edit')?{type:'click',controlId:input.controls.find(control=>control.label==='Edit').id}:{type:'scroll',controlId:'c1',direction:'down'}})),result=await recover(s,ai,{details:editDetails,inspect:nodes=>nodes.some(node=>node['resource-id']===nativeId('layout_edit_media_info_layout'))&&{editor:true}});assert(result.completed);assert.equal(result.actions,2);assert.equal(s.mutations[0].body.script,'mobile: scrollGesture');assert.deepEqual(s.mutations[0].body.args,[{elementId:'local-element',direction:'down',percent:.65}]);assert(s.requests.filter(request=>request.method==='POST').every(request=>Number.isFinite(request.deadline)));assert(ai.calls.every(call=>call.controls.every(control=>!control.label.includes('PRIVATE'))));
});
test('scrolling outside the device window is refused',async()=>{
 const s=fixture(menu(),{rect:{x:0,y:0,width:400,height:700}}),ai=provider({type:'scroll',controlId:'c1',direction:'down'}),result=await recover(s,ai,{details:editDetails,inspect:()=>false});assert(!result.completed);assert.equal(s.mutations.length,0);assert.equal(s.finds.length,0);assert.match(result.reason,/scroll region/);
});
test('a Story canvas is never offered as a scroll region',async()=>{
 const nodes=[n('story_share_controls_action_bar'),n('content_list','',{scrollable:'true',bounds:'[0,0][540,1170]'})],s=fixture(nodes),ai=provider({type:'scroll',controlId:'c1',direction:'down'}),result=await recover(s,ai,{details:{kind:'navigation',title:'Open Story music'},inspect:()=>false});assert(!result.completed);assert.equal(ai.calls.length,0);assert.equal(s.mutations.length,0);
});
test('a known existing-post Music row opens without sending the current song or caption',async()=>{
 const s=fixture(editor([button('m2_audio_row',''),n('m2_audio_primary_text','PRIVATE SONG'),n('m2_audio_secondary_text','PRIVATE ARTIST')]),{onAction:s=>{s.nodes=library();return null;}}),ai=provider(),result=await recover(s,ai,{details:{kind:'navigation',title:'Open the post music library'}});assert(result.completed);assert(!JSON.stringify(ai.calls[0].controls).includes('PRIVATE'));assert.equal(ai.calls[0].controls[0].label,'Music');
});
test('changing a visible local caption anchor stops after the first action',async()=>{
 const s=fixture(editor(),{onAction:s=>{s.nodes=editor([n('unknown','moved')]).map(node=>node['resource-id']===nativeId('edit_media_caption')?{...node,text:'CHANGED CAPTION'}:node);return true;}}),ai=provider({type:'scroll',controlId:'c1',direction:'down'}),result=await recover(s,ai,{details:{kind:'navigation',title:'Show the post’s music row'},inspect:()=>false});assert(!result.completed);assert.equal(ai.calls.length,1);assert.equal(result.actions,1);assert.equal(s.mutations.length,1);
});
test('no-progress screen stops immediately instead of recursively retrying',async()=>{
 const s=fixture(photo()),ai=provider(),result=await recover(s,ai);assert(!result.completed);assert.equal(result.actions,1);assert.equal(ai.calls.length,1);assert.equal(result.trace[0].status,'no_progress');
});
test('the hard step ceiling remains three even if callers request a larger recursion budget',async()=>{
 let count=0;const s=fixture(menu(),{onAction:s=>{s.nodes=menu([n('unknown','screen '+(++count))]);return true;}}),ai=provider({type:'scroll',controlId:'c1',direction:'down'}),result=await recover(s,ai,{details:editDetails,inspect:()=>false,maxSteps:999});assert(!result.completed);assert.equal(ai.calls.length,3);assert.equal(result.actions,3);assert.equal(s.mutations.length,3);assert.match(result.reason,/step limit/);
});
test('an unconfirmed mutation is never repeated, even across recovery invocations',async()=>{
 const s=fixture(photo(),{onAction:()=>{throw Error('Lost action response');}}),ai=provider(),first=await recover(s,ai),second=await recover(s,ai);assert(!first.completed);assert.equal(first.actions,1);assert.equal(first.trace[0].status,'unconfirmed');assert(!second.completed);assert.equal(second.actions,0);assert.equal(s.mutations.length,1);assert.match(second.reason,/already been attempted/);
});
test('a lost action response that completed is verified by inspection without replay',async()=>{
 const s=fixture(photo(),{onAction:s=>{s.nodes=library();throw Error('Lost action response');}}),ai=provider(),result=await recover(s,ai);assert(result.completed);assert.equal(result.actions,1);assert.equal(s.mutations.length,1);assert.equal(result.trace[0].status,'completed_after_uncertain_response');
});
test('an unknown scroll outcome stops without issuing a second gesture',async()=>{
 const s=fixture(menu(),{onAction:s=>{s.nodes=menu([n('unknown','changed')]);return 'true';}}),ai=provider({type:'scroll',controlId:'c1',direction:'down'}),result=await recover(s,ai,{details:editDetails,inspect:()=>false});assert(!result.completed);assert.equal(result.actions,1);assert.equal(s.mutations.length,1);assert.equal(ai.calls.length,1);
});
test('a deliberate stop plan never executes controls',async()=>{
 const s=fixture(photo()),ai=provider({type:'stop'}),result=await recover(s,ai);assert(!result.completed);assert.equal(result.actions,0);assert.equal(result.trace[0].status,'stopped');assert.equal(s.mutations.length,0);
});

test('an unexpected driver element token cannot alter the command endpoint',async()=>{
 const s=fixture(photo());s.find=async()=>String.raw`..\different\action`;const ai=provider(),result=await recover(s,ai);assert(!result.completed);assert.equal(s.mutations.length,0);assert.match(result.reason,/navigation control is unavailable/);
});
