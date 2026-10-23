// Copyright (c) 2026 Mrinal. Local ADB discovery and paired Wi-Fi reconnect; no app/UI actions.
import {execFile} from 'node:child_process';import path from 'node:path';
import {androidDevice,usbSerial,wifiAddress} from '../shared/android-device.js';
export function adbPath(){if(process.platform!=='win32'||!process.env.LOCALAPPDATA)throw new Error('The Android phone worker currently needs Windows.');return path.join(process.env.LOCALAPPDATA,'GoClassesSocialStudio/android-worker/sdk/platform-tools/adb.exe');}
export function runAdb(args,{input,timeout=5000,signal}={}){return new Promise((resolve,reject)=>{const child=execFile(adbPath(),args,{windowsHide:true,timeout,maxBuffer:1024*1024,signal},(error,stdout)=>error?reject(new Error(signal?.aborted?'Phone operation cancelled.':'ADB could not complete this phone connection. Check Wi-Fi and Wireless debugging.')):resolve(stdout.trim()));if(input!==undefined)child.stdin.end(input+'\n');});}
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
export async function resolveWifiPhone(value,{run=runAdb}={}){
 const device=androidDevice(value);if(device.transport!=='wifi')return device.serial;
 let available=false;try{available=await run(['-s',device.serial,'get-state'])==='device';}catch{}
 if(available){if(await run(['-s',device.serial,'shell','getprop','ro.serialno'])!==device.hardwareSerial)throw new Error('The Wi-Fi address belongs to another phone. Scan and select the intended phone again.');return device.serial;}
 const services=wifiServices(await run(['mdns','services']).catch(()=>''));
 // Connect only TLS services that advertise this previously selected hardware identity.
 const candidates=[...new Set(services.filter(s=>s.kind==='connect'&&s.name.startsWith('adb-'+device.hardwareSerial+'-')).map(s=>s.address))].slice(0,3);
 for(const address of candidates){try{await run(['connect',address]);if(await run(['-s',address,'get-state'])==='device'&&await run(['-s',address,'shell','getprop','ro.serialno'])===device.hardwareSerial)return address;}catch{}}
 throw new Error('The selected Wi-Fi phone is disconnected. Unlock it, enable Wireless debugging on the same Wi-Fi, then use Scan for phone. No other phone was selected.');
}
export async function pairPhone(address,code,{run=runAdb}={}){if(!wifiAddress(address)||typeof code!=='string'||!/^\d{6}$/.test(code))throw new Error('Enter the pairing IP:port and six-digit code shown by Wireless debugging.');const result=await run(['pair',address],{input:code,timeout:20000});if(!/successfully paired/i.test(result))throw new Error('Pairing did not complete. Open a fresh pairing code on the phone and try again.');return {ok:true};}
