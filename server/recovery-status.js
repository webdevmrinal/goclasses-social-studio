// Copyright (c) 2026 Mrinal. Small, truthful recovery status for SSE and Activity.
import {randomUUID} from 'node:crypto';
const phases=new Set(['detected','calling','waiting','proposed','executing','verifying','succeeded','paused','failed']);
const text=(value,limit=400)=>typeof value==='string'?value.replace(/authorization\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi,'[private key]').replace(/AIza[\w-]{20,}|(?:api[_ -]?key|authorization)\s*[:=]\s*\S+/gi,'[private key]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ').trim().slice(0,limit):'';
export class RecoveryStatus{
 constructor(onChange=()=>{}){this.onChange=onChange;this.current=null;}
 state(){return this.current?structuredClone(this.current):null;}
 restore(value){
  if(!value||typeof value!=='object'||!Array.isArray(value.events))return null;
  this.current={id:typeof value.id==='string'&&/^[a-f0-9-]{36}$/.test(value.id)?value.id:randomUUID(),problem:text(value.problem)||'Previous recovery',practice:value.practice===true,canStop:false,status:'paused',phase:'paused',events:[],...(typeof value.runId==='string'?{runId:text(value.runId,80)}:{}),...(typeof value.itemId==='string'?{itemId:text(value.itemId,40)}:{})};
  for(const event of value.events.slice(-24)){if(!phases.has(event?.phase))continue;const record={phase:event.phase,message:text(event.message),at:text(event.at,40)};for(const key of ['fix','action','model'])if(text(event[key])){record[key]=text(event[key],key==='model'?80:400);this.current[key]=record[key];}if(['cache','provider'].includes(event.source))record.source=event.source;this.current.events.push(record);}
  if(['succeeded','paused','failed'].includes(value.status)){this.current.status=value.status;this.current.phase=phases.has(value.phase)?value.phase:value.status;this.current.message=text(value.message);}else this.current.message='The worker restarted during recovery. Review the saved result before retrying.';
  return this.state();
 }
 begin({problem,runId,itemId,practice=false,canStop=false}={}){
  this.current={id:randomUUID(),...(runId?{runId}:{}),...(itemId?{itemId}:{}),practice:practice===true,canStop:canStop===true,status:'running',phase:'detected',problem:text(problem)||'Automation needs recovery.',events:[],startedAt:new Date().toISOString()};
  this.report({phase:'detected',message:this.current.problem});return this.state();
 }
 report(event={}){
  if(!this.current||!phases.has(event.phase))return this.state();
  const record={phase:event.phase,at:new Date().toISOString(),message:text(event.message)||({detected:'Problem detected.',calling:'Calling Gemini.',waiting:'Waiting for the free-tier request window.',proposed:'Gemini proposed a fix.',executing:'Trying the verified fix.',verifying:'Checking whether the problem is resolved.',succeeded:'Recovery succeeded.',paused:'Recovery paused for manual help.',failed:'Recovery did not succeed.'}[event.phase])};
  for(const key of ['fix','action','model']){const value=text(event[key],key==='model'?80:400);if(value){record[key]=value;this.current[key]=value;}}
  if(['cache','provider'].includes(event.source))record.source=event.source;
  this.current.phase=event.phase;this.current.status=['succeeded','paused','failed'].includes(event.phase)?event.phase:'running';this.current.message=record.message;this.current.updatedAt=record.at;this.current.events.push(record);this.current.events=this.current.events.slice(-24);this.onChange(this.state());return this.state();
 }
}
