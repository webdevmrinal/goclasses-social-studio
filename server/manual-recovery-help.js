// Copyright (c) 2026 Mrinal. Manual Gemini advice is separate from running automation.
import {randomUUID} from 'node:crypto';
const text=value=>String(value??'').replace(/AIza[\w-]{20,}|(?:api[_ -]?key|authorization)\s*[:=]\s*\S+/gi,'[private key]').replace(/[\u0000-\u001f]/g,' ').slice(0,400);
export class ManualRecoveryHelp{
 constructor({ai,build,onChange=()=>{}}){this.ai=ai;this.build=build;this.onChange=onChange;this.current=null;this.task=null;this.controller=null;}
 state(){return this.current?structuredClone(this.current):null;}
 publish(){this.onChange(this.state());}
 context(selection){const {context,steps}=this.build(selection);return {context,steps};}
 start(selection){
  if(this.task)throw Object.assign(Error('Gemini help is already being requested. Wait or stop that request.'),{status:409});
  const settings=this.ai.state();if(!settings.enabled||!settings.configured)throw Error('Enable Gemini suggestions and save an API key in Navigation help first. Automatic recovery can stay off.');
  const initial=this.build(selection),controller=new AbortController(),id=randomUUID();this.controller=controller;
  this.current={id,status:'working',context:initial.context,steps:[],message:'Preparing a fresh Gemini request.',events:[]};this.task=Promise.resolve();try{this.publish();}catch(error){this.task=null;this.controller=null;throw error;}
  const update=event=>{if(controller.signal.aborted||this.current?.id!==id)return;const safe={phase:text(event.phase),message:text(event.message),...(event.model?{model:text(event.model)}:{}),...(['provider','cache'].includes(event.source)?{source:event.source}:{})};this.current.events.push(safe);this.current.events=this.current.events.slice(-12);this.current.message=safe.message;this.publish();};
  const promise=Promise.resolve().then(()=>this.ai.recovery({context:initial.context,steps:initial.steps,refresh:true,signal:controller.signal,onEvent:update})).then(result=>{
   if(controller.signal.aborted||this.current?.id!==id)return;
   let fresh;try{fresh=this.build(selection);}catch{fresh=null;}
   if(!fresh||fresh.stamp!==initial.stamp){this.current.status='stale';this.current.steps=[];this.current.message='The activity changed while Gemini was answering. Request fresh steps for its current state.';}
   else if(result&&Array.isArray(result.steps)&&result.steps.length){this.current.status='ready';this.current.steps=result.steps.map(text);this.current.model=text(result.model);this.current.message='Fresh recovery steps are ready. Nothing was clicked or retried.';}
   else {this.current.status='paused';this.current.message=this.ai.state().message||'Gemini could not provide steps. Continue manually or try again later.';}
   this.publish();
  }).catch(()=>{if(!controller.signal.aborted&&this.current?.id===id){this.current.status='paused';this.current.steps=[];this.current.message='Gemini help is unavailable. Follow the normal manual recovery controls and try again later.';this.publish();}}).finally(()=>{if(this.task===promise)this.task=null;if(this.controller===controller)this.controller=null;});
  this.task=promise;return {id,context:initial.context};
 }
 cancel(id){if(!this.controller||this.current?.id!==id)throw Object.assign(Error('This Gemini help request is no longer active.'),{status:409});this.controller.abort();this.current.status='cancelled';this.current.steps=[];this.current.message='Gemini request stopped. Your activity and draft are unchanged.';this.publish();return {ok:true};}
 async close(){this.controller?.abort();await this.task;}
}
