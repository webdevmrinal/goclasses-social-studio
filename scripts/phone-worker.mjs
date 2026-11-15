// Copyright (c) 2026 Mrinal. Physical-phone driver only; no Instagram actions.
import fs from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
const action=process.argv[2]||'status';
if(!['status','server-start','doctor'].includes(action))throw Error('Use phone:status, phone:driver, or phone:doctor.');
if(process.platform!=='win32'||!process.env.LOCALAPPDATA)throw Error('The configured physical-phone driver requires Windows. Browser publishing works on Windows and macOS.');
const root=path.join(process.env.LOCALAPPDATA,'GoClassesSocialStudio','android-worker'),sdk=path.join(root,'sdk'),automation=path.join(root,'automation'),adb=path.join(sdk,'platform-tools','adb.exe'),appium=path.join(automation,'node_modules','appium','build','lib','main.js'),appiumUrl='http://127.0.0.1:4731',runtimeFile=path.join(root,'runtime.json');
const exists=file=>fs.access(file).then(()=>true,()=>false),readJson=async file=>{try{return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));}catch(error){if(error.code==='ENOENT')return {};throw error;}};
const installation=await readJson(path.join(root,'installation.json')),javaHome=installation.javaHome||process.env.JAVA_HOME,env={...process.env,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,APPIUM_HOME:automation,...(javaHome?{JAVA_HOME:javaHome}:{})},exec=promisify(execFile);
const run=async(file,args,timeout=10000)=>{const r=await exec(file,args,{env,cwd:automation,windowsHide:true,timeout,maxBuffer:2*1024*1024});return [r.stdout,r.stderr].filter(Boolean).join('\n').trim();};
async function ready(){try{const r=await fetch(appiumUrl+'/status',{signal:AbortSignal.timeout(1200)});return r.ok&&(await r.json()).value?.ready===true;}catch{return false;}}
async function ownedAppium(pid){
 if(!Number.isSafeInteger(pid)||pid<1)return false;
 try{const text=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_Process -Filter "ProcessId='+pid+'" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress']);if(!text)return false;const p=JSON.parse(text);return p.ExecutablePath?.toLowerCase()===process.execPath.toLowerCase()&&p.CommandLine?.toLowerCase().includes(appium.toLowerCase())&&/--port\s+4731\b/.test(p.CommandLine)&&/--address\s+127\.0\.0\.1\b/.test(p.CommandLine);}catch{return false;}
}
async function requireTools(){for(const [name,file]of [['Android platform-tools',adb],['Appium',appium],['Java JDK',javaHome?path.join(javaHome,'bin','javac.exe'):'']])if(!file||!await exists(file))throw Error(name+' is missing. Complete the physical-phone driver setup first.');}
const portAvailable=()=>new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(4731,'127.0.0.1',()=>server.close(()=>resolve(true)));});
async function start(){
 await requireTools();await fs.mkdir(path.join(root,'logs'),{recursive:true});const runtime=await readJson(runtimeFile);
 if(!await ownedAppium(runtime.appiumPid)||!await ready()){
  if(!await portAvailable())throw Error('Port 4731 belongs to an unverified service. It was left unchanged.');
  const fd=openSync(path.join(root,'logs','phone-driver.log'),'a');try{const child=spawn(process.execPath,['--require',path.resolve('scripts/android-console.cjs'),appium,'--address','127.0.0.1','--port','4731','--use-drivers','uiautomator2','--log-level','warn','--log-no-colors','--log',path.join(root,'logs','appium.log')],{env,cwd:automation,detached:true,windowsHide:true,stdio:['ignore',fd,fd]});await once(child,'spawn');child.unref();runtime.appiumPid=child.pid;await fs.writeFile(runtimeFile,JSON.stringify({appiumPid:runtime.appiumPid},null,2)+'\n',{mode:0o600});}finally{closeSync(fd);}
 }
 const end=Date.now()+45000;while(Date.now()<end){if(await ownedAppium(runtime.appiumPid)&&await ready()){console.log('Physical-phone driver ready. No phone settings were changed.');return;}await delay(500);}throw Error('The phone driver did not become ready. No Instagram action was attempted.');
}
try{
 if(action==='status'){const runtime=await readJson(runtimeFile);console.log(JSON.stringify({root,tools:{adb:await exists(adb),appium:await exists(appium),java:Boolean(javaHome&&await exists(path.join(javaHome,'bin','javac.exe')))},driverOwned:await ownedAppium(runtime.appiumPid),driverReady:await ready(),appiumUrl,publishingEnabled:false},null,2));}
 else if(action==='server-start')await start();
 else{await requireTools();console.log(await run(process.execPath,[appium,'driver','doctor','uiautomator2'],60000));}
}catch(error){console.error(error.message);process.exitCode=1;}
