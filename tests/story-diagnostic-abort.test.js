// Copyright (c) 2026 Mrinal. Offline cancellation fixtures; no native or publication actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeId} from '../server/automation/android-native.js';
import {confirmNativeStoryPublication} from '../server/automation/native-story.js';
const n=(id,extra={})=>({'resource-id':nativeId(id),package:'com.instagram.android',displayed:'true',...extra});
const completion=[n('title_text_view',{text:'Also share to'}),n('title',{text:'Also share to','content-desc':'Also share to'}),n('direct_recipient_add_to_highlights_row'),n('add_to_highlights_label',{text:'Add to highlights'}),n('send_button',{class:'android.widget.Button',text:'','content-desc':'Done',enabled:'true',clickable:'true',bounds:'[24,1038][516,1122]'})];
for(const [name,nodes] of [['legacy toast',[n('toast',{text:'Story shared'})]],['completion sheet',completion]]){
 test('cancellation while persisting the '+name+' acknowledgment prevents cleanup and preserves its abort reason',async()=>{
  const controller=new AbortController(),reason=new Error('Stopped while recording the Story acknowledgment'),phases=[];
  const s={signal:controller.signal,until:async predicate=>{const evidence=await predicate(nodes);assert(evidence);return evidence;},screen:async()=>assert.fail('No revalidation after cancellation'),click:async()=>assert.fail('No Done, Share or recipient Send after cancellation')};
  await assert.rejects(confirmNativeStoryPublication(s,{onDiagnostic:async diagnostic=>{phases.push(diagnostic.phase);if(diagnostic.phase==='acknowledged'){await Promise.resolve();controller.abort(reason);}}}),error=>error===reason);
  assert.deepEqual(phases,['waiting_for_acknowledgement','acknowledged']);
 });
}
