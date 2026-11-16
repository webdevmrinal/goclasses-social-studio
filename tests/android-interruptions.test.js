import test from 'node:test';import assert from 'node:assert/strict';
import {androidInterruption} from '../shared/android-interruptions.js';
const n=(packageName,id='')=>({package:packageName,'resource-id':id,displayed:'true'});
test('call and lock interruptions are identified without touching any control',()=>{
 assert.equal(androidInterruption([n('com.samsung.android.incallui')])?.kind,'call');
 assert.equal(androidInterruption([n('com.android.systemui','com.android.systemui:id/keyguard_pin_view')])?.kind,'locked');
 assert.equal(androidInterruption([n('com.example.mail')],{expectedInstagram:true})?.kind,'app_switch');
});
test('normal Instagram, navigation bars and expected permission transitions do not pause',()=>{
 for(const nodes of [[n('com.instagram.android'),n('com.android.systemui')],[n('com.google.android.permissioncontroller')],[n('com.google.android.providers.media.module')],[]])assert.equal(androidInterruption(nodes,{expectedInstagram:true}),null);
 assert.equal(androidInterruption([n('com.example.mail')]),null);
});
