// Copyright (c) 2026 Mrinal. Permission fixtures never access real photos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AndroidSession,nativeId,isPhotoAccessPicker,instagramOwnsPhotoPicker,cancelInstagramPhotoAccess} from '../server/automation/android-native.js';
import {discardPost} from '../server/automation/native-music.js';
const provider='com.google.android.providers.media.module',n=(id,extra={})=>({'resource-id':id,displayed:'true',...extra});
const picker=()=>[n(provider+':id/privacy_text',{package:provider,text:'Select photos and videos you allow this app to access'}),n(provider+':id/button_add',{package:provider,text:'Allow (5)'}),n('',{package:provider,tag:'android.widget.ImageButton','content-desc':'Cancel'}),n(provider+':id/icon_thumbnail',{package:provider,selected:'true'})];
const owner='topResumedActivity=ActivityRecord{3a79a9b u0 com.google.android.providers.media.module/com.android.providers.media.photopicker.PhotoPickerUserSelectActivity t38}\ntopDisplayFocusedRootTask=Task{2be1d7b #38 type=standard A=10212:com.instagram.android}';
const gallery=()=>[n(nativeId('new_post_title'),{package:'com.instagram.android',text:'New post'}),n(nativeId('gallery_folder_menu_tv'),{package:'com.instagram.android',text:'Recents'}),n(nativeId('action_bar_cancel'),{package:'com.instagram.android'})];
function fixture(){
 const s=Object.create(AndroidSession.prototype),original=picker(),calls=[];let frame=original;
 s.screen=async()=>frame;s.adb=async args=>{assert.deepEqual(args,['shell','dumpsys','activity','activities']);return owner;};
 s.until=async predicate=>{for(let i=0;i<8;i++){const result=await predicate(frame);if(result)return result;}assert.fail('Fixture did not settle');};
 s.request=async endpoint=>{assert.equal(endpoint,'/appium/device/activate_app');calls.push('activate');};
 s.click=async(using,query)=>{assert.equal(using,'xpath');assert(query.includes(provider));assert(query.includes('Cancel'));calls.push('Cancel permission');frame=gallery();};
 s.clickId=async id=>{assert.equal(id,'action_bar_cancel');calls.push('Close owned gallery');frame=[n(nativeId('profile_tab'),{package:'com.instagram.android'})];};
 return {s,calls,original};
}
test('photo-access recovery verifies the foreground Instagram task, never a background or foreign owner',()=>{
 assert(isPhotoAccessPicker(picker()));assert(instagramOwnsPhotoPicker(owner));
 assert(!instagramOwnsPhotoPicker(owner.replace('A=10212:com.instagram.android','A=10001:com.other.app')+'\nBackground com.instagram.android'));
 assert(!instagramOwnsPhotoPicker(owner.replace('t38}','t39}')));
 assert(!isPhotoAccessPicker(picker().map(node=>({...node,package:'com.other.app'}))));
});
test('activation cancels only the stale permission dialog and preserves existing selections and the unfinished post',async()=>{
 const {s,calls,original}=fixture(),before=structuredClone(original);
 await assert.rejects(s.account('ours'),/unfinished New post screen/);
 assert.deepEqual(original,before);assert.deepEqual(calls,['activate','Cancel permission']);assert((await s.screen()).some(node=>node.text==='Recents'));
});
test('a foreign picker is preserved and owned-draft cleanup safely unwinds a blocked permission prompt',async()=>{
 let f=fixture();f.s.adb=async()=>owner.replace('A=10212:com.instagram.android','A=10001:com.other.app');await assert.rejects(cancelInstagramPhotoAccess(f.s),/could not be verified/);assert.deepEqual(f.calls,[]);
 f=fixture();await discardPost(f.s,'');assert.deepEqual(f.calls,['Cancel permission','Close owned gallery']);assert((await f.s.screen()).some(node=>node['resource-id']===nativeId('profile_tab')));
});
