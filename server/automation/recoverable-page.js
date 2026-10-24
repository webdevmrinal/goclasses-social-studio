// Copyright (c) 2026 Mrinal. Generic pre-submit navigation recovery; no adapter selector patches.
import {recoverBrowserNavigation} from './browser-ai-recovery.js';
import {InterventionError} from './utils.js';

export function browserNavigationGoal(role,name){
 if(!['button','link','menuitem','tab','dialog'].includes(role))return null;
 const value=(name instanceof RegExp?name.source:typeof name==='string'?name:'').replace(/\\/g,'').replace(/^[\^]|[\$]$/g,'').toLowerCase();
 if(/^(?:start a post|create a post)$/.test(value)||value==='create'||role==='dialog'&&value==='create post modal')return 'open_composer';
 if(['edit','edit info'].includes(value))return 'open_edit';
 if(['music','audio','add music'].includes(value))return 'open_music';
 return null;
}
function selectorFailure(error){return error?.name==='TimeoutError'||/strict mode violation|no such element|element not found|did not resolve/i.test(error?.message||'');}
export function recoverablePage(page,{ai,platform,signal,step,canRecover=()=>true,recover=recoverBrowserNavigation}={}){
 const attempted=new Set();let remaining=3;
 const enabled=()=>{const state=ai?.state();return state?.enabled&&state.automatic&&state.configured&&remaining>0&&!signal?.aborted&&canRecover();};
 const complete=async(goal,target,method)=>{
  if(method==='waitFor')return await target.isVisible().catch(()=>false);
  if(goal==='open_composer')return await page.getByRole('dialog').filter({visible:true}).evaluateAll(elements=>elements.some(el=>!!el.querySelector('[contenteditable="true"],[role="textbox"],textarea')));
  if(goal==='open_edit')return await page.getByRole('dialog').filter({visible:true}).evaluateAll(elements=>elements.some(el=>/edit/i.test(el.getAttribute('aria-label')||'')&&!!el.querySelector('[contenteditable="true"],[role="textbox"],textarea')));
  return false;
 };
 const wrap=(target,goal=null)=>new Proxy(target,{get(object,key){
  const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
  if(/^getBy/.test(String(key))||['locator','filter','first','last','nth','and','or'].includes(key))return(...args)=>{
   const next=value.apply(object,args),nextGoal=key==='getByRole'?browserNavigationGoal(args[0],args[1]?.name):goal;
   return wrap(next,nextGoal);
  };
  if(['click','waitFor'].includes(key))return async(...args)=>{
   signal?.throwIfAborted();
   const eligible=goal&&enabled()&&(key!=='waitFor'||!args[0]?.state||args[0].state==='visible');
   try{return await value.apply(object,eligible?[{...args[0],timeout:Math.min(args[0]?.timeout||7000,7000)}]:args);}
   catch(error){
    signal?.throwIfAborted();if(!eligible||!enabled()||!selectorFailure(error)||attempted.has(goal))throw error;
    attempted.add(goal);
    const result=await recover({page,ai,platform,goal,signal,step,maxSteps:remaining,isComplete:()=>complete(goal,object,key)});
    remaining-=Math.max(1,result?.actions||0);
    if(result?.completed)return undefined;
    throw new InterventionError('Gemini could not complete this navigation safely. '+(result?.reason||'Continue manually on the expected screen.')+' The posting action was not retried.');
   }
  };
  return value.bind(object);
 }});
 return wrap(page);
}
