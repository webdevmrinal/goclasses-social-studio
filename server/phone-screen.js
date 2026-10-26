// Copyright (c) 2026 Mrinal. Lightweight, explicitly requested local phone screen.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';import {EventEmitter} from 'node:events';
import {adbPath} from './android-devices.js';
const exec=promisify(execFile),VERSION='5.0.1',ZIP_HASH='b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5';
export class PhoneScreen extends EventEmitter{
 constructor({home,prepare,launch,adb=adbPath}={}){super();this.home=home;this.adb=adb;this.prepare=prepare||(()=>this.install());this.launch=launch||((file,args,options)=>spawn(file,args,options));this.child=null;this.opening=null;this.generation=0;this.status={running:false,phase:'idle',message:'Screen closed'};}
 state(){return {...this.status};}
 update(value){Object.assign(this.status,value);this.emit('change');}
 async install(){
  if(process.platform!=='win32')throw Error('The phone screen viewer currently needs Windows.');
  const root=path.join(this.home,'.studio','tools','scrcpy'),zip=path.join(root,'scrcpy-win64-v'+VERSION+'.zip'),binary=path.join(root,'scrcpy-win64-v'+VERSION,'scrcpy.exe');await fs.mkdir(root,{recursive:true});
  let bytes=await fs.readFile(zip).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if(!bytes){this.update({phase:'installing',message:'Preparing screen viewer (first use)…'});const response=await fetch('https://github.com/Genymobile/scrcpy/releases/download/v'+VERSION+'/scrcpy-win64-v'+VERSION+'.zip',{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('Screen viewer download failed. Try Show screen again.');bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>30*1024*1024)throw Error('Unexpected screen viewer download.');}
  if(createHash('sha256').update(bytes).digest('hex')!==ZIP_HASH)throw Error('Screen viewer verification failed. Nothing was started.');
  await fs.writeFile(zip,bytes);
  try{await fs.access(binary);}catch{this.update({phase:'installing',message:'Preparing screen viewer…'});await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:STUDIO_SCRCPY_ZIP -DestinationPath $env:STUDIO_SCRCPY_DEST -Force'],{windowsHide:true,timeout:30000,env:{...process.env,STUDIO_SCRCPY_ZIP:zip,STUDIO_SCRCPY_DEST:root}});}
  return binary;
 }
 async open(serial,{keepScreenOff=false}={}){
  if(this.status.running&&this.status.serial===serial)return this.state();if(this.opening)return this.opening;
  this.opening=this.start(serial,{keepScreenOff}).finally(()=>{this.opening=null;});return this.opening;
 }
 async start(serial,{keepScreenOff=false}={}){
  await this.close();const generation=this.generation;this.update({phase:'opening',message:'Opening phone screen…',serial});
  try{const binary=await this.prepare();if(generation!==this.generation)throw Error('Screen opening cancelled.');this.update({phase:'opening',message:'Connecting the phone screen…'});
   const child=this.launch(binary,['--serial='+serial,...(keepScreenOff?['--no-power-on']:[]),'--max-size=1024','--max-fps=30','--video-bit-rate=2M','--video-codec=h264','--audio-bit-rate=64K','--no-clipboard-autosync','--window-height=800','--window-title=Social-Studio-Phone'],{cwd:path.dirname(binary),windowsHide:true,env:{...process.env,ADB:this.adb()},stdio:['ignore','pipe','pipe']});this.child=child;
   await new Promise((resolve,reject)=>{let ready=false,log='';const timer=setTimeout(()=>{child.kill();reject(Error('The screen viewer did not become ready. Unlock the phone, scan again and retry.'));},20000);timer.unref?.();
    const fail=()=>{clearTimeout(timer);if(!ready)reject(Error('The phone screen could not open. Check its connection and try again.'));if(this.child===child){this.child=null;this.update({running:false,phase:ready?'idle':'error',message:ready?'Screen closed':'Screen connection failed'});}};
    child.once('error',fail);child.once('exit',fail);
    const output=chunk=>{log=(log+chunk.toString()).slice(-6000);if(!ready&&/Texture(?:\s|\(|:)/.test(log)){ready=true;clearTimeout(timer);this.update({running:true,phase:'open',message:'Screen open on this PC',serial});resolve();}};child.stdout?.on('data',output);child.stderr?.on('data',output);
   });return this.state();
  }catch(error){this.child?.kill();this.child=null;this.update({running:false,phase:generation===this.generation?'error':'idle',message:generation===this.generation?error.message:'Screen closed'});throw error;}
 }
 async close(){this.generation++;const child=this.child;this.child=null;if(child){const finished=new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,1200).unref?.();});child.kill();await finished;}this.update({running:false,phase:'idle',message:'Screen closed'});}
}
