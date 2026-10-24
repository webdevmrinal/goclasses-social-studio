// Copyright (c) 2026 Mrinal. Local ADB discovery and paired Wi-Fi reconnect; no app/UI actions.
import {execFile} from 'node:child_process';import path from 'node:path';
import {androidDevice,usbSerial,wifiAddress} from '../shared/android-device.js';
export function adbPath(){if(process.platform!=='win32'||!process.env.LOCALAPPDATA)throw new Error('The Android phone worker currently needs Windows.');return path.join(process.env.LOCALAPPDATA,'GoClassesSocialStudio/android-worker/sdk/platform-tools/adb.exe');}
export function runAdb(args,{input,timeout=5000,signal}={}){return new Promise((resolve,reject)=>{const child=execFile(adbPath(),args,{windowsHide:true,timeout,maxBuffer:1024*1024,signal},(error,stdout,stderr)=>{
 if(!error){resolve(stdout.trim());return;}
 const failure=new Error(signal?.aborted?'Phone operation cancelled.':'ADB could not complete this phone connection. Check Wi-Fi and Wireless debugging.');
 if(isAndroidTransportFailure({...error,stdout,stderr}))failure.code='ANDROID_PHONE_DISCONNECTED';
 if(/\bdevice offline\b/i.test(stderr||error.message))failure.code='ANDROID_PHONE_OFFLINE';
 if(/\b(?:device unauthorized|failed to authenticate|authentication failed)\b/i.test(stderr||error.message))failure.code='ANDROID_PHONE_UNAUTHORIZED';
 reject(failure);
 });if(input!==undefined)child.stdin.end(input+'\n');});}
export function usbPhones(text){return text.split(/\r?\n/).flatMap(line=>{const m=line.trim().match(/^([a-zA-Z0-9][a-zA-Z0-9._-]{2,127})\s+(device|offline|unauthorized)(?:\s|$)(.*)/);return m&&!m[1].startsWith('emulator-')?[{serial:m[1],state:m[2],model:(m[3].match(/(?:^|\s)model:([^\s]+)/)?.[1]||'Android phone').replaceAll('_',' ')}]:[];});}
export function wifiServices(text){return text.split(/\r?\n/).flatMap(line=>{const m=line.trim().match(/^(\S+)\s+(_adb-tls-(?:connect|pairing)\._tcp)\s+(\S+)$/);return m&&wifiAddress(m[3])?[{name:m[1],kind:m[2].includes('pairing')?'pairing':'connect',address:m[3]}]:[];});}
export function deviceConnections(text){return text.split(/\r?\n/).flatMap(line=>{const m=line.trim().match(/^(\S+)\s+(device|offline|unauthorized)(?:\s|$)(.*)/);if(!m||m[1].startsWith('emulator-'))return [];const wireless=wifiAddress(m[1]);if(!wireless&&!usbSerial(m[1]))return [];return [{serial:m[1],state:m[2],model:(m[3].match(/(?:^|\s)model:([^\s]+)/)?.[1]||'Android phone').replaceAll('_',' '),transport:wireless?'wifi':'usb',hardwareSerial:wireless?'':m[1]}];});}
export async function connectedPhones(run=runAdb){
 const rows=deviceConnections(await run(['devices','-l']));
 return Promise.all(rows.slice(0,12).map(async row=>{if(row.transport!=='wifi'||row.state!=='device')return row;try{const identity=await run(['-s',row.serial,'shell','getprop','ro.serialno']);if(!usbSerial(identity))throw Error('No physical identity');return {...row,hardwareSerial:identity};}catch{return {...row,state:'unverified'};}}));
}
export async function scanPhones({run=runAdb,connect=true}={}){
 const services=wifiServices(await run(['mdns','services']).catch(()=>''));
 if(connect)await Promise.allSettled([...new Set(services.filter(s=>s.kind==='connect').map(s=>s.address))].slice(0,6).map(address=>run(['connect',address])));
 return {devices:await connectedPhones(run),pairingAvailable:services.some(s=>s.kind==='pairing')};
}
export async function discoverPhones(){return connectedPhones();}
// A connection recovery is transport-only: it never opens Instagram, submits a
// post, changes the selected hardware identity or restarts the global ADB server.
export function isAndroidTransportFailure(error){
 const code=typeof error==='object'&&error?error.code:'';
 if(['ANDROID_PHONE_DISCONNECTED','ANDROID_PHONE_OFFLINE','ANDROID_PHONE_CONNECTION_TIMEOUT'].includes(code))return true;
 const message=[error?.message,error?.stderr,error?.stdout,typeof error==='string'?error:''].filter(value=>typeof value==='string').join('\n');
 return /\b(?:adb(?:\.exe)?[:\s]+(?:error[:\s]+)?)?device (?:offline|not found|disconnected)\b|\bdevice ['"][^'"\r\n]{1,160}['"] not found\b|\bno devices?\/emulators? found\b|\b(?:adb(?:\.exe)?|transport)[^\r\n]{0,80}\b(?:connection (?:closed|reset)|transport (?:closed|error))\b/i.test(message);
}
function phoneConnectionError(message,code='ANDROID_PHONE_DISCONNECTED'){
 const error=new Error(message);error.code=code;return error;
}
function transportBudget({run,signal,timeout=20000,deadline=Infinity}){
 if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Phone recovery needs a positive time limit.');
 const end=Math.min(Date.now()+Math.min(timeout,30000),deadline);
 if(!(end>Date.now()))throw phoneConnectionError('The phone connection check reached its time limit. No app action was retried.','ANDROID_PHONE_CONNECTION_TIMEOUT');
 const budget=new AbortController(),combined=signal?AbortSignal.any([signal,budget.signal]):budget.signal;
 const timer=setTimeout(()=>budget.abort(),Math.max(1,end-Date.now()));
 const check=()=>{signal?.throwIfAborted();if(budget.signal.aborted||Date.now()>=end)throw phoneConnectionError('The phone connection check reached its time limit. No app action was retried.','ANDROID_PHONE_CONNECTION_TIMEOUT');};
 const wait=async operation=>{
  check();
  // Bound injected runners and progress callbacks that do not honor signal.
  let stop;
  const aborted=new Promise((_,reject)=>{stop=()=>{try{check();}catch(error){reject(error);}};combined.addEventListener('abort',stop,{once:true});});
  try{const value=await Promise.race([Promise.resolve().then(()=>{check();return operation();}),aborted]);check();return value;}
  catch(error){check();throw error;}
  finally{combined.removeEventListener('abort',stop);}
 };
 const command=async args=>String(await wait(()=>run(args,{signal:combined,timeout:Math.max(1,Math.min(5000,end-Date.now()))}))??'').trim();
 return {command,wait,check,close:()=>clearTimeout(timer)};
}
async function resolveSelectedPhone(value,{run=runAdb,signal,timeout=20000,deadline=Infinity,onEvent,reconnect=false}={}){
 const device=androidDevice(value);
 if(device.type!=='phone')throw new Error('Phone recovery requires the explicitly selected physical phone.');
 const budget=transportBudget({run,signal,timeout,deadline}),command=budget.command;
 const report=async(phase,message)=>{await budget.wait(()=>onEvent?.({phase,message}));};
 const expected=device.transport==='wifi'?device.hardwareSerial:device.serial;
 const probe=async serial=>{
  let state='';
  try{state=await command(['-s',serial,'get-state']);}catch(error){budget.check();if(error.code==='ANDROID_PHONE_UNAUTHORIZED'||/\b(?:device unauthorized|failed to authenticate|authentication failed)\b/i.test(error.message||''))throw phoneConnectionError('Allow debugging on the selected phone, then continue. No other device was selected.','ANDROID_PHONE_UNAUTHORIZED');return {ready:false,offline:error.code==='ANDROID_PHONE_OFFLINE'||/\bdevice offline\b/i.test(error.message||'')};}
  if(state==='unauthorized')throw phoneConnectionError('Allow debugging on the selected phone, then continue. No other device was selected.','ANDROID_PHONE_UNAUTHORIZED');
  if(state!=='device')return {ready:false,offline:state==='offline'};
  // A reused IP address or a misleading discovery advertisement cannot silently
  // substitute a coworker's phone, even after connect reports success.
  let identity;
  try{identity=await command(['-s',serial,'shell','getprop','ro.serialno']);}catch(error){budget.check();return {ready:false,offline:error.code==='ANDROID_PHONE_OFFLINE'||/\bdevice offline\b/i.test(error.message||'')};}
  if(identity!==expected)throw phoneConnectionError('The connection belongs to another phone. Scan and select the intended phone again. No app action was attempted.','ANDROID_PHONE_IDENTITY_MISMATCH');
  return {ready:true,offline:false};
 };
 try{
  await report('verifying','Checking the selected phone connection and physical identity.');
  const initial=await probe(device.serial);
  if(initial.ready){await report('succeeded','The selected phone is connected and its physical identity is verified.');return device.serial;}
  if(device.transport!=='wifi')throw phoneConnectionError('Connect and unlock the selected USB phone, then allow USB debugging. No other device was selected.');
  await report('detected','The selected Wi-Fi phone is disconnected. Reconnecting only its saved paired address.');
  if(reconnect&&initial.offline){
   await report('executing',"Resetting only the selected phone's stale Wi-Fi connection.");
   // HOST:PORT is always present: bare adb disconnect would affect every phone.
   try{await command(['disconnect',device.serial]);}catch{budget.check();}
  }
  await report('executing',"Reconnecting the selected phone's saved paired Wi-Fi address.");
  try{await command(['connect',device.serial]);}catch{budget.check();}
  if((await probe(device.serial)).ready){await report('succeeded','The selected phone reconnected and its physical identity is verified.');return device.serial;}
  await report('executing','Checking discovery for the same phone if its Wi-Fi port changed.');
  let services=[];try{services=wifiServices(await command(['mdns','services']));}catch{budget.check();}
  const candidates=[...new Set(services.filter(service=>service.kind==='connect'&&service.name.startsWith('adb-'+device.hardwareSerial+'-')&&service.address!==device.serial).map(service=>service.address))].slice(0,3);
  for(const serial of candidates){
   budget.check();await report('executing','Reconnecting a discovered address advertised by the same selected phone.');
   try{await command(['connect',serial]);}catch{budget.check();continue;}
   if((await probe(serial)).ready){await report('succeeded','The selected phone reconnected at its new Wi-Fi port and its physical identity is verified.');return serial;}
  }
  throw phoneConnectionError('The selected Wi-Fi phone is disconnected. Unlock it, enable Wireless debugging on the same Wi-Fi, then continue. No other phone was selected.');
 }catch(error){
  // Callback failures stop execution. They must never be swallowed and followed
  // by a connection mutation without a visible, durable recovery record.
  signal?.throwIfAborted();
  try{budget.check();}catch{throw error;}
  await budget.wait(()=>onEvent?.({phase:'paused',message:error?.message||'The selected phone could not reconnect. Its app and draft were preserved.'}));
  throw error;
 }finally{budget.close();}
}
export async function resolveWifiPhone(value,options={}){
 const device=androidDevice(value);if(device.transport!=='wifi')return device.serial;
 return resolveSelectedPhone(device,options);
}
export async function recoverPhoneConnection(value,options={}){
 return resolveSelectedPhone(value,{...options,reconnect:true});
}
export async function pairPhone(address,code,{run=runAdb}={}){if(!wifiAddress(address)||typeof code!=='string'||!/^\d{6}$/.test(code))throw new Error('Enter the pairing IP:port and six-digit code shown by Wireless debugging.');const result=await run(['pair',address],{input:code,timeout:20000});if(!/successfully paired/i.test(result))throw new Error('Pairing did not complete. Open a fresh pairing code on the phone and try again.');return {ok:true};}
