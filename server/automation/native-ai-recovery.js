// Copyright (c) 2026 Mrinal. Bounded navigation only; publication remains outside this module.
import {createHash} from 'node:crypto';
import {planNavigation} from './ai-plan-wait.js';
import {setTimeout as delay} from 'node:timers/promises';
import {nativeId,nativeBounds,xpathLiteral} from './android-native.js';
import {navigationAIContext} from './navigation-ai-context.js';
import {nativeNavigationCandidate,nativeViewportStamp} from './native-navigation.js';

const INSTAGRAM='com.instagram.android',attempted=new WeakMap();
const own=nodes=>nodes.filter(n=>n?.displayed==='true'&&n.package===INSTAGRAM);
const one=(nodes,id)=>{const matches=own(nodes).filter(n=>n['resource-id']===nativeId(id));return matches.length===1?matches[0]:null;};
const present=(nodes,id)=>Boolean(one(nodes,id));
const risky=/(?:^|[\s/:_])(?:save|share|sharing|post|publish|send|submit|confirm|delete|discard|remove|done|apply|finish|activate|recipient|direct|password|login)(?:[\s/:_]|$)/i;
const secretResource=/(?:caption|username|user_name|profile_name|song_title|track_artist|artist_name|m2_audio_(?:primary|secondary)_text|audio_browser_track)/i;
const inside=(box,outer)=>box.width>0&&box.height>0&&box.x>=outer.x&&box.y>=outer.y&&box.x+box.width<=outer.x+outer.width&&box.y+box.height<=outer.y+outer.height;
const rectangle=node=>{try{return nativeBounds(node);}catch{return null;}};
const stamp=nodes=>createHash('sha256').update(nativeViewportStamp(nodes)).digest('hex');
const sameControl=(a,b)=>a&&b&&a.using===b.using&&a.value===b.value&&JSON.stringify(a.box||null)===JSON.stringify(b.box||null);
const attributes=node=>Object.fromEntries(['package','resource-id','text','content-desc','displayed','enabled','clickable','bounds'].filter(key=>typeof node[key]==='string').map(key=>[key,node[key]]));
const selector=node=>({using:'xpath',value:'//*['+Object.entries(attributes(node)).map(([key,value])=>'@'+key+'='+xpathLiteral(value)).join(' and ')+']'});
const snapshotSafe=nodes=>Array.isArray(nodes)&&nodes.length>0&&nodes.length<=5000&&nodes.every(node=>node&&typeof node==='object'&&!Array.isArray(node));
const modelName=value=>typeof value==='string'&&/^[a-z0-9.-]{1,80}$/.test(value)?value:undefined;
function editScreen(nodes){return present(nodes,'layout_edit_media_info_layout')&&one(nodes,'action_bar_title')?.text==='Edit info'&&present(nodes,'edit_media_scroll_view');}
function menuScreen(nodes){
 const sheet=one(nodes,'action_sheet_container'),list=one(nodes,'recycler_view'),outer=rectangle(sheet),box=rectangle(list);
 return Boolean(sheet&&list&&list.scrollable==='true'&&outer&&box&&inside(box,outer));
}
function sourceControl(context,node,label){
 if(!node||secretResource.test(String(node['resource-id']||'')))return false;
 return context.controls.some(control=>(control.resourceId===node['resource-id']||!control.resourceId&&control.label===label)&&(!label||control.label===label));
}
function safeNode(node){
 return node&&node.displayed==='true'&&node.package===INSTAGRAM&&node.enabled==='true'&&node.clickable==='true'&&!/EditText|SeekBar|CheckBox|Switch/.test(node.class||node.tag||'')&&!risky.test(String(node['resource-id']||''))&&![node.text,node['content-desc']].some(value=>risky.test(String(value||'')));
}
function bindingsFor(nodes,details){
 const context=snapshotSafe(nodes)&&navigationAIContext(nodes,details);if(!context)return null;
 const bindings=[];
 const add=(label,command,extra={})=>bindings.push({label,command,...extra});
 const localAction={open_feed_music:'feed-music',open_story_music:'story-music',open_post_edit:'post-edit'}[context.stage];
 if(localAction){
  if(localAction==='post-edit'&&details.verifiedPost!==true)return null;
  let candidate;
  try{candidate=nativeNavigationCandidate(nodes,localAction,{...(localAction==='post-edit'?{guard:menuScreen}:{})});}
  catch{return null;}
  if(candidate){
   const labels=localAction==='post-edit'?['Edit']:localAction==='feed-music'?['Audio','Music','Add music']:['Music','Add music'];
   const choices=own(nodes).filter(node=>labels.includes(node.text)||labels.includes(node['content-desc']));
   if(choices.length!==1)return null;
   const node=choices[0],label=labels.find(value=>value===node.text||value===node['content-desc']);
   if(safeNode(node)&&sourceControl(context,node,label))add(label,candidate);
  }
 }
 if(context.stage==='open_post_music'&&editScreen(nodes)){
  const node=one(nodes,'m2_audio_row');
  if(safeNode(node)&&sourceControl(context,node)&&![node.text,node['content-desc']].some(value=>risky.test(String(value||''))))add('Music',selector(node));
 }
 const scrollId=context.stage==='open_post_edit'&&details.verifiedPost===true&&menuScreen(nodes)?'recycler_view':['find_post_music_row','open_post_music'].includes(context.stage)&&editScreen(nodes)?'edit_media_scroll_view':null;
 if(scrollId){
  const node=one(nodes,scrollId),box=rectangle(node);
  const known=context.controls.some(control=>control.resourceId===nativeId(scrollId)&&control.scrollable===true&&control.enabled===true);
  const outer=rectangle(one(nodes,scrollId==='recycler_view'?'action_sheet_container':'layout_edit_media_info_layout'));
  if(known&&node.scrollable==='true'&&node.enabled==='true'&&box&&outer&&inside(box,outer)&&box.width>=80&&box.height>=100)add(scrollId==='recycler_view'?'Options menu':'Edit info',selector(node),{box,scrollable:true});
 }
 return bindings.length?{stage:context.stage,stamp:stamp(nodes),bindings:bindings.map((binding,index)=>({...binding,id:'c'+(index+1)}))}:null;
}
function validatedAction(plan,snapshot){
 if(!plan||typeof plan!=='object'||Array.isArray(plan)||Object.keys(plan).some(key=>!['action','model'].includes(key)))return null;
 const value=plan.action;if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const keys=Object.keys(value).sort().join(',');
 if(value.type==='wait'||value.type==='stop')return keys==='type'?{type:value.type}:null;
 const binding=snapshot.bindings.find(binding=>binding.id===value.controlId);if(!binding)return null;
 if(value.type==='click'&&keys==='controlId,type'&&!binding.scrollable)return {type:'click',binding};
 if(value.type==='scroll'&&keys==='controlId,direction,type'&&binding.scrollable&&['up','down'].includes(value.direction))return {type:'scroll',binding,direction:value.direction};
 return null;
}

// A plan is advisory until it passes the fresh local allowlist. No cloud text,
// coordinates, selectors, URLs, scripts, song choices or final buttons execute.
export async function recoverNativeWithAI({s,ai,details,inspect,step=async()=>{},signal,maxSteps=3}={}){
 const trace=[];let actions=0;
 const result=(reason,proof)=>({completed:Boolean(proof),...(proof?{proof}:{}),reason,trace,actions});
 const requestedSignals=[s?.signal,signal].filter(Boolean),cancelled=()=>{for(const value of requestedSignals)value.throwIfAborted();};
 cancelled();
 if(!s||typeof s.screen!=='function'||typeof inspect!=='function'||typeof ai?.plan!=='function')return result('Automatic navigation is unavailable. Continue manually.');
 let settings;try{settings=ai.state?.();}catch{return result('Automatic navigation is unavailable. Continue manually.');}
 if(settings?.enabled!==true||settings.automatic!==true)return result('Automatic navigation is off. Continue manually.');
 if(/(?:caption|account|images?|media|selection|order).{0,80}(?:mismatch|does not match|differ|changed|wrong)|(?:wrong|mismatched).{0,30}(?:account|caption)/i.test(String(details?.reason||'')))return result('The reviewed content or account needs manual verification.');
 const limit=Number.isFinite(maxSteps)?Math.max(0,Math.min(3,Math.floor(maxSteps))):3;
 const deadline=Date.now()+60000,budget=AbortSignal.timeout(60000),combined=AbortSignal.any([...requestedSignals,budget]);
 const timeLeft=()=>{cancelled();if(Date.now()>=deadline||budget.aborted)throw Object.assign(Error('Recovery budget exhausted'),{code:'NATIVE_AI_BUDGET'});};
 const read=async()=>{timeLeft();const nodes=await s.screen({deadline});timeLeft();return nodes;};
 const anchors=new Map();
 const check=async nodes=>{
  timeLeft();if(!snapshotSafe(nodes)||!navigationAIContext(nodes,details))return null;
  for(const node of own(nodes)){if(!['edit_media_username','edit_media_caption','caption_input_text_view'].some(id=>node['resource-id']===nativeId(id)))continue;const key=node['resource-id'];if(anchors.has(key)&&anchors.get(key)!==node.text)throw Error('Local content anchor changed');anchors.set(key,node.text);}
  const value=await inspect(nodes);timeLeft();return value;
 };
 const failError=error=>{cancelled();if(error?.name==='AccountMismatchError')throw error;return result(error?.code==='NATIVE_AI_BUDGET'?'Automatic navigation reached its time limit. Continue manually.':'The expected device state could not be verified. Continue manually.');};
 const seen=new Set();let nodes;
 try{nodes=await read();const proof=await check(nodes);if(proof)return result('The expected screen is ready.',proof);}catch(error){return failError(error);}
 for(let index=0;index<limit;index++){
  cancelled();if(Date.now()>=deadline||budget.aborted)return result('Automatic navigation reached its time limit. Continue manually.');const snapshot=bindingsFor(nodes,details);
  if(!snapshot)return result('This screen has no verified automatic navigation path. Continue manually.');
  if(seen.has(snapshot.stamp))return result('Navigation did not make progress. Continue manually.');
  seen.add(snapshot.stamp);
  await step('Gemini recovery '+(index+1)+'/'+limit+': checking navigation...');
  let plan;
  try{
   timeLeft();plan=await planNavigation(ai,{platform:'instagram_android',stage:snapshot.stage,controls:snapshot.bindings.map(binding=>({id:binding.id,label:binding.label,role:binding.scrollable?'scroll_region':'button',enabled:true,scrollable:Boolean(binding.scrollable)})),signal:combined},{deadline,step});timeLeft();
  }catch(error){cancelled();if(error?.name==='AccountMismatchError')throw error;return result(budget.aborted?'Automatic navigation reached its time limit. Continue manually.':'Gemini is unavailable. Continue manually.');}
  if(!plan)return result('Gemini is unavailable or resting. Continue manually.');
  const action=validatedAction(plan,snapshot);
  if(!action)return result('Gemini did not identify a verified navigation action. Continue manually.');
  const record={step:index+1,type:action.type,...(action.binding?{label:action.binding.label}:{}),...(modelName(plan.model)?{model:plan.model}:{}),status:'planned'};trace.push(record);
  if(action.type==='stop'){record.status='stopped';return result('Gemini needs manual help with this screen.');}
  try{
   nodes=await read();const proof=await check(nodes);if(proof){record.status='already_completed';return result('The expected screen is ready.',proof);}
   const fresh=bindingsFor(nodes,details),binding=action.binding&&fresh?.bindings.find(value=>value.id===action.binding.id);
   if(!fresh||fresh.stamp!==snapshot.stamp||action.binding&&!sameControl(action.binding.command,binding?.command)){record.status='stale';return result('The device screen changed while planning. Continue manually.');}
   if(action.type==='wait'){
    await step('Gemini recovery '+(index+1)+'/'+limit+': waiting for the screen...');await delay(500,undefined,{signal:combined});record.status='waited';
   }else{
    const mark=snapshot.stage+':'+snapshot.stamp+':'+action.type+':'+action.binding.id+':'+(action.direction||''),prior=attempted.get(s)||new Set();
    if(prior.has(mark)){record.status='already_attempted';return result('This navigation action has already been attempted. Continue manually.');}
    if(typeof s.find!=='function'||typeof s.request!=='function')return result('The device cannot execute verified recovery actions. Continue manually.');
    if(action.type==='scroll'){
     const rect=await s.request('/window/rect','GET',undefined,{deadline});timeLeft();
     if(!rect||!['x','y','width','height'].every(key=>Number.isFinite(rect[key]))||rect.width<=0||rect.height<=0||rect.width>10000||rect.height>10000||!inside(binding.box,rect)){record.status='unsafe_bounds';return result('The scroll region could not be verified on screen. Continue manually.');}
    }
    const elementId=await s.find(binding.command.using,binding.command.value,{deadline});timeLeft();
    if(typeof elementId!=='string'||!/^[A-Za-z0-9:_-]{1,200}$/.test(elementId))return result('The observed navigation control is unavailable. Continue manually.');
    await step('Gemini recovery '+(index+1)+'/'+limit+': '+(action.type==='click'?'opening '+binding.label:'scrolling '+binding.label)+'...');timeLeft();
    // Mark before dispatch: a lost response cannot replay the mutation, even if
    // another caller retries this recovery on the same session and viewport.
    prior.add(mark);attempted.set(s,prior);actions++;record.status='dispatched';
    if(action.type==='click')await s.request('/element/'+elementId+'/click','POST',{}, {deadline});
    else{const moved=await s.request('/execute/sync','POST',{script:'mobile: scrollGesture',args:[{elementId,direction:action.direction,percent:.65}]},{deadline});if(typeof moved!=='boolean')throw Error('Unknown scroll outcome');}
    record.status='acted';
   }
   nodes=await read();const afterProof=await check(nodes);if(afterProof){record.status='completed';return result('Navigation recovered and verified.',afterProof);}
   if(stamp(nodes)===snapshot.stamp){record.status='no_progress';return result('Navigation did not make progress. Continue manually.');}
  }catch(error){
   cancelled();if(error?.name==='AccountMismatchError')throw error;
   if(record.status==='dispatched'){
    record.status='unconfirmed';
    // Only inspect after an uncertain action. Never issue a second mutation.
    try{nodes=await read();const proof=await check(nodes);if(proof){record.status='completed_after_uncertain_response';return result('Navigation completed and was verified without replay.',proof);}}catch(checkError){cancelled();if(checkError?.name==='AccountMismatchError')throw checkError;}
    return result('The navigation action was not confirmed. Continue manually; it was not repeated.');
   }
   return failError(error);
  }
 }
 return result('Automatic navigation reached its step limit. Continue manually.');
}
