// Copyright (c) 2026 Mrinal. Gemini may choose only bounded, observed navigation.
import {createHash} from 'node:crypto';
import {planNavigation} from './ai-plan-wait.js';

const ORIGINS={
  linkedin:['https://www.linkedin.com','https://linkedin.com'],
  instagram:['https://www.instagram.com','https://instagram.com'],instagram_web:['https://www.instagram.com','https://instagram.com'],
  x:['https://x.com','https://www.x.com'],
  youtube:['https://www.youtube.com'],youtubeDA:['https://www.youtube.com'],youtubeCS:['https://www.youtube.com'],
  manychat:['https://app.manychat.com'],whatsapp:['https://web.whatsapp.com'],
  telegram:['https://web.telegram.org']
};
const GOAL_LABELS={open_composer:['Create','Create a post','Start a post','Photo/video','Photo/video post'],open_media_picker:['Add media','Media','Add photos','Photo/video'],open_edit:['Edit','Edit info'],open_music:['Music','Audio','Add music','Add audio'],open_audio:['Music','Audio','Add music','Add audio'],open_preview:['Next'],advance_editor:['Next','Previous','Back'],close_navigation:['Close','Previous','Back']};
const GOALS=new Set(Object.keys(GOAL_LABELS));
const LABELS=['Create','Create a post','Start a post','Add media','Media','Add photos','Photo/video','Photo/video post','Edit','Edit info','Next','Previous','Back','Music','Audio','Add music','Add audio','Close'];
const SELECTOR='button,a[href],[role="button"],[role="link"],[role="menuitem"],[role="tab"],input[type="button"],input[type="submit"]';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const proof=value=>Boolean(value);
const abort=signal=>signal?.throwIfAborted();
function ownedUrl(value,platform){
  try{const url=new URL(value);return !url.username&&!url.password&&!url.port&&ORIGINS[platform]?.includes(url.origin)&&!/(?:\/|^)(?:login|signin|checkpoint|challenge|messaging|messages|direct|i\/flow\/login)(?:\/|$)/i.test(url.pathname)?url.href:null;}catch{return null;}
}

// Only this projection leaves the browser helper. Text, form values, captions,
// DOM, selectors and coordinates are never included in the model's controls.
export function browserNavigationControls(snapshot){
  return (snapshot?.safe?snapshot.controls:[]).map(({id,label,role,enabled,scrollable})=>({id,label,role,enabled,scrollable:Boolean(scrollable)}));
}

export async function collectBrowserNavigationSnapshot(page,platform,goal){
  const url=ownedUrl(page.url(),platform);
  if(!url)return {safe:false,reason:'untrusted_page',controls:[]};
  let observed;
  try{
    observed=await page.evaluate(async({labels,selector})=>{
      const normalize=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
      const labelMap=new Map(labels.map(label=>[label.toLowerCase(),label]));
      const visible=element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0'&&!element.closest('[hidden],[inert],[aria-hidden="true"]');};
      const inViewport=element=>{const r=element.getBoundingClientRect();return r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;};
      const protectedLabel=/\b(?:password|passcode|security code|verification code|sign in|log in|captcha|choose recipients?|select recipients?|send to|discard|delete|remove|purchase|buy now|confirm payment)\b/i;
      const inputs=[...document.querySelectorAll('input,textarea,[contenteditable="true"],[role="textbox"]')].filter(visible);
      if(inputs.some(element=>element.matches('input[type="password"],input[autocomplete="one-time-code"],input[autocomplete="current-password"],input[autocomplete="new-password"]')||protectedLabel.test([element.getAttribute('aria-label'),element.getAttribute('placeholder'),element.getAttribute('name')].join(' '))))return {safe:false,reason:'protected_screen'};
      if([...document.querySelectorAll('iframe')].some(element=>visible(element)&&/recaptcha|hcaptcha|challenge/.test(element.getAttribute('src')||'')))return {safe:false,reason:'protected_screen'};
      const dialogs=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]')].filter(visible).filter((element,index,list)=>!list.some(other=>other!==element&&other.contains(element)));
      if(dialogs.length>1)return {safe:false,reason:'ambiguous_overlay'};
      const dialog=dialogs[0];
      if(dialog&&protectedLabel.test([dialog.getAttribute('aria-label'),...dialog.querySelectorAll('h1,h2,h3,[role="heading"]')].map(value=>typeof value==='string'?value:value?.textContent).join(' ')))return {safe:false,reason:'protected_screen'};
      const root=dialog||document;
      const elements=[...root.querySelectorAll(selector)];
      const editableHasContent=inputs.some(element=>String('value'in element?element.value:element.textContent).trim());
      const finalLabel=/^(?:post|share|save|publish|send|delete|remove|discard|archive|submit|confirm|done|apply|finish|activate|go\s+live|your stor(?:y|ies)|close friends)(?:\b|$)/i;
      const finalId=/(?:^|[_:/-])(?:post|share|save|publish|send|delete|remove|discard|submit|confirm|done|finish)(?:[_:/-]|$)/i;
      const controls=[];
      for(let index=0;index<elements.length;index++){
        const element=elements[index];
        if(!visible(element)||!inViewport(element)||element.disabled||element.matches('[aria-disabled="true"],input[type="submit"]')||element.closest('[aria-disabled="true"]'))continue;
        // Prefer an explicit accessible label. A final button cannot masquerade
        // as safe navigation because its descendant contains an allowed word.
        const source=element.getAttribute('aria-label')||element.getAttribute('title')||('value'in element?element.value:'')||element.innerText||element.textContent;
        const label=labelMap.get(normalize(source).toLowerCase());if(!label||label==='Close'&&editableHasContent)continue;
        const navigationId=value=>['Start a post','Create a post'].includes(label)?String(value||'').replace(/(^|[_:/-])(?:start|create)[_:/-]+(?:a[_:/-]+)?post(?=$|[_:/-])/gi,'$1navigation'):String(value||'');
        if([element.getAttribute('aria-label'),element.getAttribute('title'),element.innerText,element.value].some(value=>finalLabel.test(normalize(value)))||[element.id,element.getAttribute('data-testid'),element.getAttribute('name')].some(value=>finalId.test(navigationId(value))))continue;
        if(element.matches('[download]')||element.form&&element.type==='submit'||element.closest('[contenteditable="true"]')||element.getAttribute('target')&&!['_self',''].includes(element.getAttribute('target')))continue;
        const href=element.getAttribute('href');
        if(href){try{const target=new URL(href,location.href);if(target.origin!==location.origin||!/^(https:)$/.test(target.protocol)||/\/(?:logout|signout|login|delete|remove|messages|messaging|direct)(?:\/|$)/i.test(target.pathname))continue;}catch{continue;}}
        const rect=element.getBoundingClientRect(),x=Math.max(0,Math.min(innerWidth-1,rect.x+rect.width/2)),y=Math.max(0,Math.min(innerHeight-1,rect.y+rect.height/2)),hit=document.elementFromPoint(x,y);
        if(!hit||hit!==element&&!element.contains(hit))continue;
        const role=element.getAttribute('role')||(/^(A)$/.test(element.tagName)?'link':'button');
        if(!['button','link','menuitem','tab'].includes(role))continue;
        const record={index,label,role,enabled:true,tag:element.tagName,href:href?new URL(href,location.href).href:null,rect:[rect.x,rect.y,rect.width,rect.height].map(Math.round),expanded:element.getAttribute('aria-expanded'),selected:element.getAttribute('aria-selected')};
        controls.push(record);
      }
      // Duplicate semantics are deliberately excluded: the model cannot rank
      // two identical Edit/Next controls on an unknown layout.
      const unique=controls.filter(item=>controls.filter(other=>other.label===item.label).length===1);
      const scroll=[];
      const scrollElements=dialog?[dialog,...dialog.querySelectorAll('*')]:[document.scrollingElement];
      for(let index=0;index<scrollElements.length;index++){
        const element=scrollElements[index];if(!element||element!==document.scrollingElement&&!visible(element))continue;
        if(element.scrollHeight<=element.clientHeight+8||element!==document.scrollingElement&&!/(?:auto|scroll)/.test(getComputedStyle(element).overflowY))continue;
        // One verified scroll region avoids guessing between nested panels.
        scroll.push({scrollIndex:index,role:'scroll_region',label:'Scroll navigation',enabled:true,scrollable:true,position:Math.round(element.scrollTop),maximum:Math.round(element.scrollHeight-element.clientHeight)});
      }
      const scrollControls=scroll.length===1?scroll:[];
      const overlay=dialog?dialog.outerHTML:'';
      const overlayHash=overlay?[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(overlay)))].map(n=>n.toString(16).padStart(2,'0')).join(''):null;
      return {safe:true,url:location.href,controls:unique,scroll:scrollControls,overlayHash,dialog:Boolean(dialog),viewport:[innerWidth,innerHeight],scrollPosition:[Math.round(scrollX),Math.round(scrollY)]};
    },{labels:GOAL_LABELS[goal]||LABELS,selector:SELECTOR});
  }catch{return {safe:false,reason:'screen_unavailable',controls:[]};}
  if(!observed.safe)return {...observed,controls:[]};
  if(observed.url!==url||!ownedUrl(page.url(),platform))return {safe:false,reason:'page_changed',controls:[]};
  const controls=[...observed.controls,...observed.scroll].slice(0,25).map((control,index)=>({...control,id:`c${index+1}`}));
  const stamp=digest({...observed,controls});
  return {safe:true,url,stamp,controls,dialog:observed.dialog};
}

async function bindControl(page,snapshot,control){
  if(control.scrollable)return null;
  const root=snapshot.dialog?page.locator('[role="dialog"],[aria-modal="true"],dialog[open]').filter({visible:true}).first():page;
  const handle=await root.locator(SELECTOR).nth(control.index).elementHandle();
  if(!handle)return null;
  const matches=await handle.evaluate((element,expected)=>{
    const normalize=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    const source=element.getAttribute('aria-label')||element.getAttribute('title')||('value'in element?element.value:'')||element.innerText||element.textContent;
    const rect=element.getBoundingClientRect(),hit=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,rect.x+rect.width/2)),Math.max(0,Math.min(innerHeight-1,rect.y+rect.height/2)));
    return element.isConnected&&!element.disabled&&element.getAttribute('aria-disabled')!=='true'&&normalize(source).toLowerCase()===expected.label.toLowerCase()&&element.tagName===expected.tag&&(!expected.href||element.href===expected.href)&&hit&&(hit===element||element.contains(hit));
  },control).catch(()=>false);
  if(!matches){await handle.dispose();return null;}return handle;
}

async function scrollControl(page,snapshot,control,direction){
  return page.evaluate(({dialog,index,direction,position})=>{
    const visible=element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!element.closest('[hidden],[inert],[aria-hidden="true"]');};
    const dialogs=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]')].filter(visible).filter((element,_index,list)=>!list.some(other=>other!==element&&other.contains(element)));
    if(Boolean(dialogs.length)!==dialog||dialogs.length>1)return false;
    const root=dialogs[0],elements=dialog?[root,...root.querySelectorAll('*')]:[document.scrollingElement],element=elements[index];
    if(!element||Math.round(element.scrollTop)!==position)return false;
    const before=element.scrollTop; element.scrollBy({top:(direction==='up'?-1:1)*Math.min(480,Math.max(120,element.clientHeight*.65)),behavior:'instant'});
    return element.scrollTop!==before;
  },{dialog:snapshot.dialog,index:control.scrollIndex,direction,position:control.position});
}

// AI decisions are hints over stable c1/c2 bindings. Every mutation is followed
// by the caller's read-only expected-state proof. Submission is not an action.
export async function recoverBrowserNavigation({page,ai,platform,goal,isComplete,signal,step=async()=>{},reportRecovery=async()=>{},maxSteps=3,wait=pause}={}){
  const trace=[];let actions=0;
  const finish=(completed,reason,value)=>({completed,reason,actions,trace,...(completed?{proof:value}:{})});
  const emit=async event=>{trace.push(event);await step(event.message);};
  abort(signal);
  if(!page||typeof ai?.plan!=='function'||typeof isComplete!=='function'||!GOALS.has(goal))return finish(false,'unsupported_context');
  const limit=Math.max(1,Math.min(3,Number.isInteger(maxSteps)?maxSteps:3)),deadline=Date.now()+60000,seen=new Set();
  for(let index=0;index<limit&&Date.now()<deadline;index++){
    abort(signal);
    const snapshot=await collectBrowserNavigationSnapshot(page,platform,goal);if(!snapshot.safe)return finish(false,snapshot.reason);
    const complete=await isComplete();abort(signal);if(proof(complete))return finish(true,'expected_state_confirmed',complete);
    if(seen.has(snapshot.stamp))return finish(false,'unchanged_screen');
    const controls=browserNavigationControls(snapshot);if(!controls.length)return finish(false,'no_safe_controls');
    await emit({type:'planning',message:'Gemini is checking the available navigation controls.'});abort(signal);
    let planned;
    try{planned=await planNavigation(ai,{platform,stage:goal,controls,signal,onEvent:reportRecovery},{deadline,step});}catch(error){abort(signal);return finish(false,'model_unavailable');}
    abort(signal);
    const action=planned?.action;
    if(!action||!['click','scroll','wait','stop'].includes(action.type))return finish(false,'model_unavailable');
    if(action.type==='stop')return finish(false,'model_uncertain');
    const current=await collectBrowserNavigationSnapshot(page,platform,goal);if(!current.safe||current.stamp!==snapshot.stamp)return finish(false,'screen_changed');
    const changedComplete=await isComplete();abort(signal);if(proof(changedComplete))return finish(true,'expected_state_confirmed',changedComplete);
    const chosen=current.controls.find(control=>control.id===action.controlId);
    if(action.type!=='wait'&&(!chosen||(action.type==='scroll')!==Boolean(chosen.scrollable)))return finish(false,'invalid_control');
    if(action.type==='scroll'&&!['up','down'].includes(action.direction))return finish(false,'invalid_control');
    await reportRecovery({phase:'executing',fix:planned.fix,action:action.type==='click'?'Click '+chosen.label:action.type==='scroll'?'Scroll '+action.direction:'Wait for the screen',model:planned.model,message:'Trying the locally verified action suggested by Gemini.'});
    seen.add(snapshot.stamp);abort(signal);
    if(action.type==='click'){
      const handle=await bindControl(page,current,chosen);if(!handle)return finish(false,'screen_changed');
      try{abort(signal);await emit({type:'action',action:'click',label:chosen.label,model:typeof planned.model==='string'&&/^[a-z0-9.-]{1,80}$/i.test(planned.model)?planned.model:undefined,message:`Gemini navigation: ${chosen.label}.`});abort(signal);const final=await collectBrowserNavigationSnapshot(page,platform,goal);if(!final.safe||final.stamp!==current.stamp)return finish(false,'screen_changed');actions++;await handle.click({timeout:3000});}
      catch(error){abort(signal);return finish(false,'navigation_unconfirmed');}finally{await handle.dispose();}
    }else if(action.type==='scroll'){
      await emit({type:'action',action:'scroll',message:`Gemini navigation: scroll ${action.direction}.`});abort(signal);const final=await collectBrowserNavigationSnapshot(page,platform,goal);if(!final.safe||final.stamp!==current.stamp)return finish(false,'screen_changed');actions++;
      if(!await scrollControl(page,current,chosen,action.direction))return finish(false,'unchanged_screen');
    }else{await emit({type:'action',action:'wait',message:'Gemini navigation: wait briefly for the screen.'});actions++;}
    await reportRecovery({phase:'verifying',message:'Checking whether the expected screen is ready.'});
    for(let observation=0;observation<4;observation++){
      abort(signal);await wait(250);abort(signal);
      const after=await collectBrowserNavigationSnapshot(page,platform,goal);if(!after.safe)return finish(false,after.reason);
      const ready=await isComplete();abort(signal);if(proof(ready)){await emit({type:'complete',message:'The expected screen is confirmed. Returning to the reviewed automation.'});return finish(true,'expected_state_confirmed',ready);}
    }
    const after=await collectBrowserNavigationSnapshot(page,platform,goal);if(!after.safe)return finish(false,after.reason);
    if(after.stamp===snapshot.stamp)return finish(false,'unchanged_screen');
  }
  return finish(false,'step_limit');
}
