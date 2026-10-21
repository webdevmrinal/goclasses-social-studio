// Copyright (c) 2026 Mrinal. Verified rating-dialog fixtures; no live Android actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AndroidSession,nativeId,dismissInstagramRatingPrompt} from '../server/automation/android-native.js';
import {InterventionError} from '../server/automation/utils.js';
const n=(id,text='',extra={})=>({'resource-id':nativeId(id),package:'com.instagram.android',displayed:'true',text,...extra});
const popup=()=>[n('appirater_title_area','Rate Instagram'),n('appirater_rate_button','Rate Instagram'),n('appirater_rate_later_button','Remind me later'),n('appirater_cancel_button','No, thanks')];
const profile=()=>[n('profile_tab'),n('action_bar_title','ours'),n('profile_header_create_button')];
function fixture(initial=popup()){
 const s=Object.create(AndroidSession.prototype),calls=[];let frame=initial;
 s.activate=async()=>{};s.screen=async()=>structuredClone(frame);
 s.until=async(predicate,message,timeout)=>{for(let i=0;i<6;i++){const result=await predicate(await s.screen());if(result)return result;}throw new InterventionError(message);};
 s.click=async(using,value)=>{assert.equal(using,'xpath');assert(value.includes('@package="com.instagram.android"'));assert(value.includes('appirater_cancel_button'));assert(value.includes('@text="No, thanks"'));assert(value.includes('@displayed="true"'));calls.push('No, thanks');frame=profile();};
 s.clickId=async id=>{calls.push(id);};s.request=async()=>assert.fail('No back, execute or publication command is authorized by dialog recovery');
 return {s,calls,setFrame:value=>frame=value};
}

test('the exact visible Instagram rating dialog gets one No-thanks dismissal before account verification',async()=>{
 const f=fixture(),before=popup();await f.s.account('ours');
 assert.equal(f.s.accountHandle,'ours');assert.equal(f.s.ratingPromptDismissed,true);assert.deepEqual(f.calls,['No, thanks']);assert.deepEqual(before,popup());
 await f.s.account('ours');assert.deepEqual(f.calls,['No, thanks']);
});

test('hidden and foreign rating controls are never dismissed',async()=>{
 for(const frame of [popup().map(node=>({...node,displayed:'false'})),popup().map(node=>({...node,package:'com.other.app'})),profile()]){
  const f=fixture(frame);assert.equal(await dismissInstagramRatingPrompt(f.s,frame),false);assert.deepEqual(f.calls,[]);
 }
});

test('unknown titles, missing controls, hidden cancel and duplicate controls stop without a click',async()=>{
 const unknown=popup();unknown[0].text='A different Instagram dialog';
 const missing=popup().filter(node=>node['resource-id']!==nativeId('appirater_cancel_button'));
 const hidden=popup().map(node=>node['resource-id']===nativeId('appirater_cancel_button')?{...node,displayed:'false'}:node);
 const changed=popup().map(node=>node['resource-id']===nativeId('appirater_cancel_button')?{...node,text:'Discard'}:node);
 const duplicate=[...popup(),n('appirater_cancel_button','No, thanks')],duplicateTitle=[...popup(),n('appirater_title_area','Rate Instagram')];
 for(const frame of [unknown,missing,hidden,changed,duplicate,duplicateTitle]){
  const f=fixture(frame);await assert.rejects(dismissInstagramRatingPrompt(f.s,frame),/rating dialog could not be verified/);assert.deepEqual(f.calls,[]);assert(!f.s.ratingPromptDismissed);
 }
});

test('a rating prompt over an unsent post, Story, music or message editor preserves the entire screen',async()=>{
 for(const id of ['caption_input_text_view','story_share_controls_action_bar','new_post_title','music_editor_controls_container','direct_external_share_container_view','link_sticker_list_web_url_edit_text']){
  const frame=[...popup(),n(id,'Private unsent content')],f=fixture(frame),before=structuredClone(frame);
  await assert.rejects(f.s.account('ours'),/unsent draft behind its rating dialog/);assert.deepEqual(f.calls,[]);assert.deepEqual(frame,before);
 }
});

test('a popup arriving during the account waiter is handled before it can hide the profile',async()=>{
 const f=fixture([]);let reads=0;
 const base=f.s.screen;f.s.screen=async()=>{reads++;if(reads===2)f.setFrame(popup());return base();};
 await f.s.account('ours');assert.equal(f.s.accountHandle,'ours');assert.deepEqual(f.calls,['No, thanks']);
});

test('a popup arriving after public-post Back is dismissed and the account still verifies',async()=>{
 const f=fixture([n('row_feed_profile_header'),n('row_feed_button_share')]);
 f.s.request=async(endpoint,method)=>{assert.equal(endpoint,'/back');assert.equal(method,'POST');f.calls.push('public Back');f.setFrame(popup());};
 await f.s.account('ours');assert.deepEqual(f.calls,['public Back','No, thanks']);assert.equal(f.s.accountHandle,'ours');
});

test('a popup arriving after selecting Profile is handled by the account identity waiter',async()=>{
 const f=fixture([n('profile_tab')]);
 f.s.clickId=async id=>{assert.equal(id,'profile_tab');f.calls.push('profile_tab');f.setFrame(popup());};
 await f.s.account('ours');assert.deepEqual(f.calls,['profile_tab','No, thanks']);assert.equal(f.s.accountHandle,'ours');
});

test('repeated prompts and ambiguous click failures never cause a second dismissal',async()=>{
 let f=fixture();await dismissInstagramRatingPrompt(f.s,popup());f.setFrame(popup());
 await assert.rejects(dismissInstagramRatingPrompt(f.s,popup()),/appeared again/);assert.deepEqual(f.calls,['No, thanks']);
 f=fixture();const original=new Error('The click response was lost.');f.s.click=async()=>{f.calls.push('attempt');throw original;};
 await assert.rejects(dismissInstagramRatingPrompt(f.s,popup()),error=>error===original);assert.equal(f.s.ratingPromptDismissed,true);
 await assert.rejects(dismissInstagramRatingPrompt(f.s,popup()),/appeared again/);assert.deepEqual(f.calls,['attempt']);
});

test('cancellation and a persistent rating prompt stop safely without retries',async()=>{
 let f=fixture(),controller=new AbortController();f.s.signal=controller.signal;controller.abort();
 await assert.rejects(dismissInstagramRatingPrompt(f.s,popup()),{name:'AbortError'});assert.deepEqual(f.calls,[]);assert(!f.s.ratingPromptDismissed);
 f=fixture();f.s.click=async()=>f.calls.push('No, thanks');
 await assert.rejects(dismissInstagramRatingPrompt(f.s,popup()),/rating dialog did not close/);assert.deepEqual(f.calls,['No, thanks']);assert.equal(f.s.ratingPromptDismissed,true);
});
