// Copyright (c) 2026 Mrinal. One bounded quota-window wait, never a posting retry.
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{signal?.throwIfAborted();let timer;const abort=()=>{clearTimeout(timer);reject(signal.reason||new Error('Recovery stopped'));};timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});
export async function planNavigation(ai,input,{deadline,step=async()=>{},now=Date.now,wait=sleep}={}){
 input.signal?.throwIfAborted();let result=await ai.plan(input);input.signal?.throwIfAborted();if(result)return result;
 const state=ai.state?.(),remaining=state?.today?.remaining;
 const delay=Number(state?.cooldownUntil)-now()+75;
 if(state?.status!=='cooldown'||!Number.isFinite(delay)||delay<=0||delay>35000||remaining===0||!Number.isFinite(deadline)||now()+delay+1000>=deadline)return null;
 await step('Gemini recovery is waiting '+Math.ceil(delay/1000)+' seconds for the free-tier request window.');
 await wait(delay,input.signal);input.signal?.throwIfAborted();if(now()>=deadline)return null;
 result=await ai.plan(input);input.signal?.throwIfAborted();return result;
}
