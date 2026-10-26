// Copyright (c) 2026 Mrinal. Session-only physical screen shield; no Android app input.
import path from 'node:path';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {adbPath} from './android-devices.js';
import {usbSerial,wifiAddress} from '../shared/android-device.js';
const cancelled=()=>new Error('Touch guard opening cancelled.');
export class PhoneTouchGuard extends EventEmitter{
 constructor({prepare,launch,adb=adbPath,readyTimeout=20000,closeTimeout=2000}={}){
  super();this.prepare=prepare;this.launch=launch||((file,args,options)=>spawn(file,args,options));this.adb=adb;this.readyTimeout=readyTimeout;this.closeTimeout=closeTimeout;this.generation=0;this.child=null;this.opening=null;this.stopping=null;this.controller=null;this.status={enabled:false,phase:'idle',message:'Phone touch guard off'};
 }
 state(){return {...this.status};}
 update(value){Object.assign(this.status,value);this.emit('change');}
 enable(serial){
  if(!usbSerial(serial)&&!wifiAddress(serial))return Promise.reject(new Error('Select the verified physical phone before enabling its touch guard.'));
  if(this.status.enabled&&this.status.serial===serial&&this.child)return Promise.resolve(this.state());
  if(this.opening)return this.status.serial===serial?this.opening:Promise.reject(new Error('Wait for the current touch guard operation.'));
  const generation=++this.generation;const controller=new AbortController();this.controller=controller;
  const pending=this.start(serial,generation,controller.signal).finally(()=>{if(this.opening===pending)this.opening=null;if(this.controller===controller)this.controller=null;});this.opening=pending;return pending;
 }
 async start(serial,generation,signal){
  let ownChild;
  try{
   await this.stopCurrent();if(signal.aborted||generation!==this.generation)throw cancelled();
   this.update({enabled:false,phase:'opening',message:'Preparing the phone screen shield…',serial});
   if(typeof this.prepare!=='function')throw new Error('The verified screen viewer is unavailable.');
   let cancel;const interrupted=new Promise((_,reject)=>{cancel=()=>reject(cancelled());signal.addEventListener('abort',cancel,{once:true});});
   let binary;try{binary=await Promise.race([Promise.resolve().then(()=>this.prepare()),interrupted]);}finally{signal.removeEventListener('abort',cancel);}
   if(signal.aborted||generation!==this.generation)throw cancelled();
   const args=['--serial='+serial,'--no-window','--no-video','--no-audio','--no-clipboard-autosync','--no-power-on','--turn-screen-off','--keep-active','--keyboard=disabled','--mouse=disabled','--gamepad=disabled','--no-terminal-title'];
   ownChild=this.launch(binary,args,{cwd:path.dirname(binary),windowsHide:true,env:{...process.env,ADB:this.adb()},stdio:['ignore','pipe','pipe']});this.child=ownChild;
   await new Promise((resolve,reject)=>{
    let ready=false,settled=false,log='';
    const finishError=message=>{if(settled)return;settled=true;clearTimeout(timer);reject(new Error(message));};
    const timer=setTimeout(()=>finishError('The phone did not confirm its screen shield. Try again; the phone Power button restores its display.'),this.readyTimeout);
    ownChild.once('error',()=>{if(!ready){if(this.child===ownChild)this.child=null;finishError('The phone screen shield could not start.');}else if(this.child===ownChild)this.update({phase:'error',message:'Touch guard connection needs review. Use the phone Power button to restore its screen.'});});
    ownChild.once('exit',()=>{
     if(this.child===ownChild){this.child=null;if(generation===this.generation||!this.opening&&this.status.serial===serial)this.update({enabled:false,phase:ready?'idle':'error',message:ready?'Phone touch guard ended. The phone Power button restores its screen.':'Phone touch guard connection failed.'});}
     if(!ready)finishError('The phone screen shield disconnected before it became ready.');
    });
    const output=chunk=>{
     log=(log+chunk.toString()).slice(-6000);
     if(!ready&&/\bDevice display turned off\b/.test(log)&&!signal.aborted&&generation===this.generation&&this.child===ownChild){
      ready=true;settled=true;clearTimeout(timer);this.update({enabled:true,phase:'on',message:'Phone screen shield on. PC mirroring stays interactive.',serial});resolve();
     }
    };
    ownChild.stdout?.on('data',output);ownChild.stderr?.on('data',output);
    signal.addEventListener('abort',()=>finishError('Touch guard opening cancelled.'),{once:true});
   });
   if(signal.aborted||generation!==this.generation)throw cancelled();return this.state();
  }catch(error){
   if(ownChild&&this.child===ownChild)await this.stopCurrent().catch(()=>{});
   if(generation===this.generation){const mayStillRun=Boolean(this.child);this.update({enabled:mayStillRun,phase:'error',message:mayStillRun?'Touch guard could not close. Use the phone Power button to restore its screen.':error.message});}
   throw error;
  }
 }
 async stopCurrent(){
  if(this.stopping)return this.stopping;
  const child=this.child;if(!child)return;
  const pending=(async()=>{
   let listener,timer;const exited=new Promise(resolve=>{listener=()=>resolve(true);child.once('exit',listener);timer=setTimeout(()=>resolve(false),this.closeTimeout);});
   try{if(child.exitCode!==null&&child.exitCode!==undefined){if(this.child===child)this.child=null;return;}child.kill();if(!await exited)throw new Error('The phone screen shield did not close. Use the phone Power button to restore its screen.');if(this.child===child)this.child=null;}
   finally{clearTimeout(timer);child.off('exit',listener);}
  })().finally(()=>{if(this.stopping===pending)this.stopping=null;});this.stopping=pending;return pending;
 }
 async disable(){
  const generation=++this.generation;this.controller?.abort();this.controller=null;
  this.update({phase:this.child?'closing':'idle',message:this.child?'Restoring the phone screen…':'Phone touch guard off',...(!this.child?{enabled:false}:{})});
  try{await this.stopCurrent();if(generation===this.generation)this.update({enabled:false,phase:'idle',message:'Phone touch guard off. Use the phone Power button if its screen stays dark.'});return this.state();}
  catch(error){if(generation===this.generation)this.update({enabled:Boolean(this.child),phase:'error',message:error.message});throw error;}
 }
 async close(){return this.disable();}
}
