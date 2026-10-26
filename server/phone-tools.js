// Copyright (c) 2026 Mrinal. Phone connection status is separate from publication state.
import {EventEmitter} from 'node:events';import {androidDevice,androidDeviceKey} from '../shared/android-device.js';
import {runAdb,connectedPhones,scanPhones,resolveWifiPhone,pairPhone} from './android-devices.js';import {PhoneScreen} from './phone-screen.js';import {PhoneTouchGuard} from './phone-touch-guard.js';
export class PhoneTools extends EventEmitter{
 constructor({home,run=runAdb,screen,touchGuard,canRefresh=()=>true}={}){super();this.run=run;this.screen=screen||new PhoneScreen({home});this.touchGuard=touchGuard||new PhoneTouchGuard({prepare:()=>this.screen.prepare()});this.touchGuard.on('change',()=>this.emit('change'));this.canRefresh=canRefresh;this.devices=[];this.selected=null;this.selectionGeneration=0;this.guardRequestGeneration=0;this.checkedAt=null;this.scanning=false;this.error='';this.screen.on('change',()=>this.emit('change'));}
 state(){const target=this.selected,d=this.devices.find(row=>row.state==='device'&&row.transport===(target?.transport==='wifi'?'wifi':'usb')&&(target?.transport==='wifi'?row.hardwareSerial===target.hardwareSerial:row.serial===target?.serial));return {devices:this.devices,connected:Boolean(d),checkedAt:this.checkedAt,scanning:this.scanning||this.pairing===true,error:this.error,selected:d?{...d}:null,mirror:this.screen.state(),touchGuard:this.touchGuard.state()};}
 async configure(value){const next=androidDevice(value);if(this.selected&&androidDeviceKey(this.selected)!==androidDeviceKey(next)){this.selectionGeneration++;this.guardRequestGeneration++;await this.touchGuard.disable();await this.screen.close();}this.selected=next;this.emit('change');}
 monitor(){if(this.timer)return;this.timer=setInterval(()=>{if(this.canRefresh()&&!this.scanning)this.refresh().catch(()=>{});},15000);this.timer.unref();}
 async refresh(){if(this.refreshing)return this.refreshing;this.refreshing=(async()=>{try{this.devices=await connectedPhones(this.run);this.error='';}catch{this.devices=[];this.error='Phone connection unavailable. Use Scan for phone.';}this.checkedAt=new Date().toISOString();this.emit('change');return this.state();})().finally(()=>{this.refreshing=null;});return this.refreshing;}
 async scan(value){if(this.scanning)throw Error('A phone scan is already running.');await this.configure(value);this.scanning=true;this.error='';this.emit('change');try{const result=await scanPhones({run:this.run});this.devices=result.devices;this.checkedAt=new Date().toISOString();this.monitor();return this.state();}catch(error){this.error='Could not scan. Check that Wireless debugging is enabled on the same Wi-Fi.';throw Error(this.error);}finally{this.scanning=false;this.emit('change');}}
 async pair(address,code,value){this.pairing=true;this.emit('change');try{await pairPhone(address,code,{run:this.run});return await this.scan(value);}finally{this.pairing=false;this.emit('change');}}
 async show(value){if(this.touchGuard.state().phase==='opening')throw Error('Wait for the phone guard to finish, then show its screen.');const d=androidDevice(value);if(d.type!=='phone')throw Error('Scan and select a phone first.');const serial=d.transport==='wifi'?await resolveWifiPhone(d,{run:this.run}):d.serial;if(await this.run(['-s',serial,'get-state'])!=='device')throw Error('The selected phone is disconnected. Use Scan for phone.');if(await this.run(['-s',serial,'shell','getprop','ro.kernel.qemu'])==='1')throw Error('Select the physical office phone, not an emulator.');await this.screen.open(serial,{keepScreenOff:this.touchGuard.state().enabled});this.monitor();return this.state();}
 async protect(enabled,value=this.selected){
  if(typeof enabled!=='boolean')throw Error('Choose whether the phone touch guard is on.');
  const request=++this.guardRequestGeneration;
  if(!enabled){await this.touchGuard.disable();return this.state();}
  if(this.screen.opening)throw Error('Wait for the screen viewer to open before enabling its touch guard.');
  const d=androidDevice(value);if(d.type!=='phone')throw Error('Select and connect a physical phone first.');
  const generation=this.selectionGeneration,key=androidDeviceKey(d),sameTarget=()=>request===this.guardRequestGeneration&&generation===this.selectionGeneration&&this.selected&&androidDeviceKey(this.selected)===key;
  if(!sameTarget())throw Error('The selected phone changed. Check Phone connection and try again.');
  const serial=d.transport==='wifi'?await resolveWifiPhone(d,{run:this.run}):d.serial;
  if(await this.run(['-s',serial,'get-state'])!=='device')throw Error('The selected phone is disconnected. Scan for phone first.');
  if(await this.run(['-s',serial,'shell','getprop','ro.kernel.qemu'])==='1')throw Error('Touch guard is for the selected physical phone.');
  if(d.transport!=='wifi'&&await this.run(['-s',serial,'shell','getprop','ro.serialno'])!==d.serial)throw Error('The physical phone identity changed. Select the intended phone again.');
  if(!sameTarget())throw Error('The selected phone changed during the connection check. Nothing was protected.');
  await this.touchGuard.enable(serial);if(!sameTarget())throw Error('The selected phone changed while its guard was opening. Review the current phone.');this.monitor();return this.state();
 }
 async close(){this.guardRequestGeneration++;clearInterval(this.timer);this.timer=null;await this.touchGuard.close();await this.screen.close();}
}
