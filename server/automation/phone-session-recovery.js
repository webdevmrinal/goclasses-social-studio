// Copyright (c) 2026 Mrinal. Reconnect only a preselected phone; never replay a publishing action.
import {InterventionError} from './utils.js';
import {planNavigation} from './ai-plan-wait.js';
export async function recoverPhoneSession({ctx={},signal,reconnect,kind='read',problem='The selected phone disconnected during Instagram preparation.'}={}){
 const allowed=()=>typeof ctx.canRecoverConnection==='function'?ctx.canRecoverConnection():ctx.canRecoverNavigation?.()!==false;
 signal?.throwIfAborted();
 if(!allowed())throw new InterventionError('The phone disconnected after a submission may have begun. Verify the result before retrying.');
 let traceError;const emit=async event=>{signal?.throwIfAborted();try{await ctx.reportRecovery?.({problem,...event});if(event.message)await ctx.step?.(event.message);}catch(error){traceError=error;throw error;}signal?.throwIfAborted();};
 await emit({phase:'detected',message:problem});
 const ai=ctx.navigationAI,settings=ai?.state?.();let fix='Reconnect the same paired phone, verify its identity, and inspect the existing Instagram screen.',model,mayReconnect=true;
 if(settings?.enabled&&settings.configured&&settings.automatic){
  let plan;try{plan=await planNavigation(ai,{platform:'instagram_android',stage:'reconnect_selected_phone',capabilities:{reconnectSelectedPhone:true},controls:[{id:'c1',label:'Reconnect selected phone',role:'button',enabled:true,scrollable:false}],signal,onEvent:event=>emit(event)},{deadline:Date.now()+60000,step:ctx.step});}catch(error){signal?.throwIfAborted();if(traceError)throw traceError;}
  if(plan?.action?.type==='click'&&plan.action.controlId==='c1'&&Object.keys(plan.action).sort().join(',')==='controlId,type'){fix=plan.fix||fix;model=plan.model;}
  else if(plan){mayReconnect=false;await emit({phase:'paused',message:'Gemini could not verify a connection fix. Reconnect the selected phone, then continue.'});}
  else await emit({phase:'proposed',fix,message:'Gemini is unavailable. Using the built-in same-phone connection check; no screen action will be replayed.'});
 }else await emit({phase:'proposed',fix,message:'Using the built-in same-phone connection check. Gemini automatic recovery is off.'});
 const restore=async()=>{
  signal?.throwIfAborted();if(!allowed())throw new InterventionError('This preparation is no longer eligible for automatic recovery.');
  await emit({phase:'executing',fix,model,action:'Reconnect selected phone',message:'Reconnecting only the selected paired phone and rebuilding its inspection session.'});
  const result=await reconnect();signal?.throwIfAborted();
  await emit({phase:'verifying',fix,model,action:'Verify phone identity and inspection session',message:kind==='open'?'Checking the same phone and its fresh inspection session.':'Checking the existing Instagram screen without reopening the Story.'});
  if(result!==true&&result?.connected!==true)throw new InterventionError('The selected phone is not ready yet.');
  return {connected:true};
 };
 let connected,lastError;
 if(mayReconnect)try{connected=await restore();}catch(error){signal?.throwIfAborted();if(traceError)throw traceError;lastError=error;}
 if(!connected){
  await emit({phase:'paused',fix,model,message:'The selected phone is unavailable. Unlock it, keep it on the same Wi-Fi, and enable Wireless debugging. The timer pauses while waiting.'});
  if(!ctx.intervene)throw lastError||new InterventionError('Reconnect the selected phone before continuing. Its Instagram screen was preserved.');
  connected=await ctx.intervene({kind:'connection',title:'Reconnect your Android phone',instructions:'Unlock the selected phone, connect it to the same Wi-Fi, and enable Wireless debugging. Keep the current Instagram screen. Leave Save and Your story untouched, then continue here.'},async()=>{
   // A user-requested connection check may reconnect this one paired device. It
   // never taps its screen, changes account, pairs a new phone, or authorizes Share.
   try{return await restore();}catch(error){signal?.throwIfAborted();if(traceError)throw traceError;await emit({phase:'paused',fix,model,message:'The selected phone is still unavailable. Check Wi-Fi and Wireless debugging, then continue again.'});return null;}
  });
 }
 signal?.throwIfAborted();
 await emit({phase:'succeeded',fix,model,message:kind==='action'?'The same phone reconnected. Checking the last action before continuing; it will not be replayed.':'The same phone reconnected. Resuming the pending screen check; completed posts and music edits are unchanged.'});
 return Boolean(connected);
}
