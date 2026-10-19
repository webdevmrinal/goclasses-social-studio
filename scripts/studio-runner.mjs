#!/usr/bin/env node
// GO Classes Social Studio - Created by Mrinal. One-command Windows/macOS launcher.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {RepositoryUpdates,npmCommand} from './updates.mjs';
const root=process.env.STUDIO_HOME||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),exec=promisify(execFile);
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Install Node.js 22 or newer, then run npm start.');
try{process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
const storage=path.join(root,'.studio');await fs.mkdir(storage,{recursive:true});
const data=path.resolve(root,process.env.DATA_DIR||'data');
let child,current=root,revision='',updating=false,stopping=false,checkPromise=null,status={supported:true,phase:'idle',message:'Check for updates'};
const pointer=path.join(storage,'current.json');
try{const value=JSON.parse(await fs.readFile(pointer,'utf8'));const candidate=path.join(storage,'releases',value.revision);if(!/^[a-f0-9]{40,64}$/.test(value.revision))throw new Error('Invalid saved update.');await fs.access(path.join(candidate,'server','index.js'));current=candidate;}catch(error){if(error.code!=='ENOENT')console.log('Using the original checkout:',error.message);}
const sendState=()=>{if(child?.connected)child.send({type:'studio-update-state',state:{...status,revision}});};
const updates=new RepositoryUpdates({root,onProgress:message=>{status={...status,message};sendState();}});
async function dependencies(directory){
  const lock=await fs.readFile(path.join(directory,'package-lock.json')),digest=createHash('sha256').update(lock).digest('hex');
  const marker=path.join(directory,'node_modules','.studio-lock');
  if(await fs.readFile(marker,'utf8').catch(()=>'')!==digest){console.log('Preparing Social Studio dependencies...');await npmCommand(['ci','--omit=dev','--no-audit','--no-fund'],directory);await fs.mkdir(path.dirname(marker),{recursive:true});await fs.writeFile(marker,digest);}
}
async function launch(directory){
  await dependencies(directory);current=directory;revision=await updates.revision(directory).catch(()=>'');
  const env={...process.env,DATA_DIR:data,STUDIO_SUPERVISED:'1',STUDIO_HOME:root,STUDIO_REVISION:revision};
  const processChild=spawn(process.execPath,['server/index.js'],{cwd:directory,env,windowsHide:true,stdio:['inherit','inherit','inherit','ipc']});child=processChild;
  processChild.on('message',message=>handle(message,processChild));processChild.on('error',error=>console.error('Startup failed:',error.message));
  processChild.on('exit',code=>{if(!updating&&!stopping){console.error('Social Studio stopped. Run npm start to reopen it.');process.exitCode=code||0;}});
  sendState();return processChild;
}
async function healthy(expected){
  const end=Date.now()+45000;
  while(Date.now()<end){if(child.exitCode!==null)throw new Error('The new version exited during startup.');try{const r=await fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/session',{signal:AbortSignal.timeout(1500)}),j=await r.json();if(r.ok&&j.revision===expected)return;}catch{}await new Promise(r=>setTimeout(r,350));}
  throw new Error('The new version did not become ready.');
}
async function shutdownChild(){
  if(!child||child.exitCode!==null)return;const exiting=once(child,'exit');child.send({type:'studio-shutdown'});await Promise.race([exiting,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('The app could not close safely. No update was activated.')),20000);t.unref();})]);
}
async function apply(){
  const previous={directory:current,revision};updating=true;
  try{
    status={...status,phase:'installing',message:'Preparing update...'};sendState();const staged=await updates.stage(current);
    status={...status,phase:'restarting',message:'Restarting Social Studio...'};sendState();await shutdownChild();
    try{await launch(staged.directory);await healthy(staged.revision);await fs.writeFile(pointer,JSON.stringify({revision:staged.revision}));status={supported:true,phase:'idle',available:false,message:'Update installed'};sendState();}
    catch(error){if(child?.exitCode===null)await shutdownChild();await launch(previous.directory);status={supported:true,phase:'error',message:'The update could not start. Your previous version was restored.'};sendState();}
  }catch(error){status={...status,phase:'error',message:error.message};sendState();}
  finally{updating=false;}
}
async function checkUpdates(){
  if(checkPromise)return checkPromise;
  checkPromise=(async()=>{status={...status,phase:'checking'};sendState();try{const checked=await updates.check(current);status={...checked,phase:'idle'};sendState();return status;}catch(error){status={...status,phase:'error',message:error.message};sendState();throw error;}})().finally(()=>{checkPromise=null;});return checkPromise;
}
async function handle(message,source){
  if(message.type!=='studio-update-request')return;
  const reply=(result,error)=>{if(source.connected)source.send({type:'studio-update-reply',id:message.id,result,error});};
  try{
    if(updating)throw new Error('An update is already in progress.');
    if(message.action==='check')reply(await checkUpdates());
    else if(message.action==='apply'){if(checkPromise)await checkPromise;if(!status.available)throw new Error('Check for an available update first.');reply({ok:true});apply();}
    else throw new Error('Unknown update action.');
  }catch(error){status={...status,phase:'error',message:error.message};sendState();reply(null,error.message);}
}
await dependencies(current);
try{await exec(process.execPath,['--input-type=module','-e',"const {resolveBrowser}=await import('./server/automation/browser.js');await resolveBrowser();"],{cwd:current,windowsHide:true,timeout:15000});}catch{console.log('Installing the automation browser...');await exec(process.execPath,[path.join(current,'node_modules','playwright','cli.js'),'install','chromium'],{cwd:current,windowsHide:true,timeout:240000,maxBuffer:4*1024*1024});}
console.log('GO Classes Social Studio - Created by Mrinal. Keep this terminal open.');await launch(current);
setTimeout(()=>{if(!updating&&!stopping)checkUpdates().catch(()=>{});},5000).unref();
setInterval(()=>{if(!updating&&!stopping)checkUpdates().catch(()=>{});},10*60*1000).unref();
async function stop(){if(stopping)return;stopping=true;try{await shutdownChild();}finally{process.exit(0);}}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
process.on('message',message=>{if(message.type==='studio-stop')stop();});
