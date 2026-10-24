// Copyright (c) 2026 Mrinal. In-task Android handoffs; never authorize publication.
import {randomUUID} from 'node:crypto';
import {InterventionError} from './automation/utils.js';
const proof=value=>JSON.stringify(value&&Object.fromEntries(['key','title','artist','length','caption'].filter(k=>value[k]!==undefined).map(k=>[k,value[k]])));
export class NativeInterventions{
 constructor(queue){this.queue=queue;this.pending=null;}
 async wait(run,item,signal,details,inspect,{pause,resume}){
  signal.throwIfAborted();if(item.submitting||this.pending)throw new InterventionError('Manual preparation is unavailable after submission or during another handoff.');
  const {aiContext,...publicDetails}=details;
  const previous=run.status,intervention={...publicDetails,id:randomUUID(),createdAt:new Date().toISOString()};
  pause();item.intervention=intervention;item.status='waiting_for_input';run.status='waiting_for_input';item.message=details.instructions;
  let abort;
  try{
   return await new Promise((resolve,reject)=>{
    abort=()=>reject(signal.reason||new InterventionError('Stopped by operator.'));
    this.pending={run,item,signal,inspect,resolve,reject,intervention,busy:false,adviceController:new AbortController()};signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted)abort();else { this.queue.change().catch(reject); this.advice(this.pending,aiContext).catch(()=>{}); }
   });
  }finally{
   signal.removeEventListener('abort',abort);this.pending?.adviceController.abort();this.pending=null;delete item.intervention;
   item.status='running';if(run.status==='waiting_for_input')run.status=previous;
   if(!signal.aborted)resume();await this.queue.change();
  }
 }
 async advice(p,context){
  const ai=this.queue.navigationAI,state=ai?.state();
  if(!context||p.intervention.kind!=='navigation'||!state?.enabled||!state.configured||p.signal.aborted)return;
  p.intervention.ai={status:'loading',message:'Checking navigation options...'};await this.queue.change();
  if(this.pending!==p||p.signal.aborted)return;
  let result;try{result=await ai.suggest({...context,signal:AbortSignal.any([p.signal,p.adviceController.signal])});}catch{ /* provider problems never affect a prepared post */ }
  if(this.pending!==p||p.signal.aborted||p.run.status!=='waiting_for_input')return;
  const current=ai.state();p.intervention.ai=result?{status:'ready',steps:result.steps,model:result.model}:{status:current.status,message:current.message||'Gemini is unavailable. Follow the instructions above and continue manually.'};
  await this.queue.change();
 }
 async act({runId,itemId,id,action,reviewId}){
  const p=this.pending;
  if(!p||p.run.id!==runId||p.item.id!==itemId||p.intervention.id!==id||p.run.status!=='waiting_for_input'||p.item.submitting||p.signal.aborted)throw new InterventionError('This Android handoff is no longer active.');
  if(!['check','continue'].includes(action)||p.busy)throw new InterventionError('Wait for the current screen check.');
  p.busy=true;
  try{
   p.signal.throwIfAborted();const value=await p.inspect();p.signal.throwIfAborted();
   if(!value){delete p.intervention.review;delete p.review;await this.queue.change();throw new InterventionError(p.intervention.kind==='music'?'Preview a song in the Instagram music library first. Leave the library open.':'The expected screen is not ready. Follow the instructions on the selected Android device, then check again.');}
   if(p.intervention.kind==='music'){
    if(action==='check'){
     const native=structuredClone(value);p.review={value:native,proof:proof(native),id:randomUUID()};
     p.intervention.review={title:native.title,artist:native.artist,key:native.key,id:p.review.id};await this.queue.change();return {review:p.intervention.review};
    }
    if(!p.review||p.review.id!==reviewId||p.review.proof!==proof(value)){
     delete p.review;delete p.intervention.review;await this.queue.change();throw new InterventionError('The selected song changed. Check it again before approving.');
    }
   }else if(action!=='continue')return {ready:true};
   // No click or native mutation here. The suspended task resumes at its local
   // checkpoint, then all normal image/caption/account and final Save guards run.
   p.item.manualInputs||=[];p.item.manualInputs.push({kind:p.intervention.kind,at:new Date().toISOString(),...(p.intervention.kind==='music'?{music:JSON.parse(proof(value))}:{})});
   p.resolve(value);return {ok:true};
  }finally{p.busy=false;}
 }
}
