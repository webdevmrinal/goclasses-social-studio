import test from 'node:test';import assert from 'node:assert/strict';
import {scopedNativeControl} from '../server/automation/native-scoped-control.js';
import {AndroidSession,nativeId} from '../server/automation/android-native.js';
const n=(id,attrs={})=>({'resource-id':nativeId(id),package:'com.instagram.android',displayed:'true',enabled:'true',clickable:'false',text:'',class:'android.widget.FrameLayout',bounds:'[10,10][110,110]',...attrs});
test('a current Compose wrapper resolves its unique bounded Button without fixed coordinates',()=>{
 const nodes=[n('link_sticker_list_done_icon_button',{'content-desc':'@2131965992'}),n('',{class:'android.widget.Button',clickable:'true','content-desc':'@2131965992'})];
 const c=scopedNativeControl(nodes,{guard:()=>true,resources:['link_sticker_list_done_icon_button'],allowLocalDone:true});
 assert(c.value.includes('android.widget.Button'));assert(c.value.includes('@bounds="[10,10][110,110]"'));
 assert(!c.value.includes('@resource-id="'+nativeId('link_sticker_list_done_icon_button')+'"'));
 assert.throws(()=>scopedNativeControl(nodes,{guard:()=>false,resources:['link_sticker_list_done_icon_button']}),/scene changed/);
});
test('ambiguous, unrelated, hidden and publication controls cannot be recovered',()=>{
 const button=n('renamed',{class:'android.widget.Button',clickable:'true',text:'Done'}),opts={guard:()=>true,labels:['Done'],allowLocalDone:true};
 assert(scopedNativeControl([button],opts));
 assert.throws(()=>scopedNativeControl([button,{...button,bounds:'[120,10][220,110]'}],opts),/More than one/);
 assert.equal(scopedNativeControl([{...button,package:'other.app'}],opts),null);
 assert.equal(scopedNativeControl([{...button,displayed:'false'}],opts),null);
 for(const text of ['Share','Your stories','Save','Delete'])assert.equal(scopedNativeControl([{...button,text}],{...opts,labels:[text]}),null);
});
test('resource prefix loss uses one exact package-scoped alias and no click replay',async()=>{
 const s=Object.create(AndroidSession.prototype),calls=[];s.request=async(url,method,body)=>{calls.push(body);return calls.length===1?[]:[{'element-6066-11e4-a52e-4f735466cecf':'exact-compose-control'}];};
 assert.equal(await s.find('id',nativeId('asset_button')),'exact-compose-control');assert.equal(calls.length,2);
 assert(calls[1].value.includes('@package="com.instagram.android"'));assert(calls[1].value.includes('@resource-id="asset_button"'));
});
