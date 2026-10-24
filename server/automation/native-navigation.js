// Copyright (c) 2026 Mrinal. Local accessibility recovery; never publishes.
import {nativeId,nativeBounds,xpathLiteral} from './android-native.js';
import {InterventionError} from './utils.js';

const INSTAGRAM='com.instagram.android';
const attempts=new WeakMap();
const own=nodes=>nodes.filter(n=>n.displayed==='true'&&n.package===INSTAGRAM);
const unique=(nodes,id)=>nodes.filter(n=>n['resource-id']===nativeId(id)).length===1;
const has=(nodes,id)=>nodes.some(n=>n['resource-id']===nativeId(id));
const risky=/\b(?:save|share|post|publish|send|delete|discard|remove|recipient|your stor(?:y|ies)|close friends)\b/i;
const riskyId=/(?:^|[/:_])(?:save|share|post|publish|send|delete|discard|remove|recipient|direct)(?:[/:_]|$)/i;
const plans={
  'feed-music':{labels:['Audio','Music','Add music'],scope:n=>unique(n,'media_thumbnail_tray_button')&&!['share_footer_button','caption_input_text_view','story_share_controls_action_bar','action_sheet_container','music_editor_controls_container','row_search_edit_text'].some(id=>has(n,id))},
  'story-music':{labels:['Music','Add music'],scope:n=>unique(n,'story_share_controls_action_bar')&&!['music_editor_done_button','music_editor_controls_container','row_search_edit_text','action_sheet_container'].some(id=>has(n,id))},
  'post-edit':{labels:['Edit'],guard:true,scope:n=>unique(n,'action_sheet_container')&&unique(n,'recycler_view')}
};
const fail=message=>{const error=new InterventionError(message+' Its screen and draft were preserved. Continue manually on the selected Android device.');error.code='ANDROID_NAVIGATION_UNCERTAIN';return error;};
const inside=(node,container)=>{try{const b=nativeBounds(node),c=nativeBounds(container);return b.width>0&&b.height>0&&b.x>=c.x&&b.y>=c.y&&b.x+b.width<=c.x+c.width&&b.y+b.height<=c.y+c.height;}catch{return false;}};

// The stamp stays in memory only. It detects a repeated viewport without logging
// captions, music queries, accessibility labels or screenshots.
export const nativeViewportStamp=nodes=>JSON.stringify(own(nodes).map(n=>[n['resource-id'],n.text,n['content-desc'],n.bounds,n.scrollable]));

export function nativeNavigationCandidate(nodes,action,{guard}={}){
  const plan=plans[action];if(!plan)throw fail('This Android navigation action is not allowlisted.');
  if(nodes.some(n=>n.displayed==='true'&&(n.password==='true'||n.package&&n.package!==INSTAGRAM)))throw fail('Android navigation is covered by another app or a protected screen.');
  const visible=own(nodes);
  if(!plan.scope(visible)||(plan.guard&&typeof guard!=='function')||(guard&&!guard(nodes)))throw fail('The expected Instagram navigation screen changed.');
  if(visible.some(n=>/direct_(?:external|private)_share_container_view/.test(n['resource-id']||'')))throw fail('Instagram has an open recipient screen.');
  const matches=visible.filter(n=>plan.labels.includes(n.text)||plan.labels.includes(n['content-desc']));
  // Several labels can describe different controls. Never rank or guess one.
  if(matches.length>1)throw fail('More than one Instagram navigation control matched.');
  if(!matches.length)return null;
  const node=matches[0],labels=[node.text,node['content-desc']].filter(Boolean);
  if(node.clickable!=='true'||node.enabled!=='true'||/EditText|SeekBar|CheckBox|Switch/.test(node.class||node.tag||'')||riskyId.test(node['resource-id']||'')||labels.some(label=>risky.test(label)))throw fail('The observed Instagram navigation control is not safe to select.');
  if(action==='post-edit'){
    const sheet=visible.find(n=>n['resource-id']===nativeId('action_sheet_container')),list=visible.find(n=>n['resource-id']===nativeId('recycler_view'));
    if(list.scrollable!=='true'||!inside(list,sheet)||!inside(node,list))throw fail('The Edit control is outside the verified post menu.');
  }
  const attributes={package:INSTAGRAM,displayed:'true',enabled:'true',clickable:'true'};
  for(const key of ['text','content-desc','resource-id'])if(node[key]!==undefined)attributes[key]=node[key];
  const value='//*['+Object.entries(attributes).map(([key,value])=>'@'+key+'='+xpathLiteral(value)).join(' and ')+']';
  return {using:'xpath',value};
}

// At most one observed control is clicked. No coordinates, scrolling, back,
// final buttons or action replay are available through this recovery path.
export async function recoverNativeNavigation(s,{action,guard,ready}){
  s.signal?.throwIfAborted();
  if(typeof ready!=='function')throw fail('Android navigation needs a read-only completion check.');
  let nodes=await s.screen(),complete=await ready(nodes);if(complete)return complete;
  const control=nativeNavigationCandidate(nodes,action,{guard});if(!control)throw fail('Instagram did not expose a unique navigation control.');
  const stamp=action+nativeViewportStamp(nodes),seen=attempts.get(s)||new Set();
  if(seen.has(stamp))throw fail('This Instagram navigation screen has already been tried.');
  // Mark before dispatch, so an ambiguous click response can never be replayed.
  seen.add(stamp);attempts.set(s,seen);s.signal?.throwIfAborted();
  await s.click(control.using,control.value);
  return s.until(ready,'Instagram did not confirm the navigation change. Continue manually; the draft was preserved.',10000);
}
