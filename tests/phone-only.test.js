// Phone-only migration and fail-closed selection; no ADB, driver, or social calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter,once} from 'node:events';
import {androidDevice} from '../shared/android-device.js';
import {AndroidSession} from '../server/automation/android-native.js';
import {PhoneTools} from '../server/phone-tools.js';
import {defaults,validateConfig} from '../server/config.js';
import {createApp} from '../server/index.js';
test('unconfigured phone is an explicit empty selection and cannot start a native session',async()=>{
 assert.deepEqual(defaults.androidDevice,{type:'phone',serial:''});assert.deepEqual(androidDevice(),defaults.androidDevice);
 const s=new AndroidSession({device:androidDevice()});s.adb=()=>assert.fail('No unselected ADB command');await assert.rejects(s.open(),/Select.*phone|select.*phone/i);assert(!s.id);
 assert.throws(()=>validateConfig({...defaults,androidDevice:{type:'emulator'}}),/physical phone/);
});
test('screen and guard reject an unselected phone without starting commands',async()=>{
 const screen=new EventEmitter();screen.state=()=>({});screen.close=async()=>{};
 const tools=new PhoneTools({run:()=>assert.fail('No unselected ADB command'),screen});
 try{await tools.configure(androidDevice());await assert.rejects(tools.show(androidDevice()),/select a phone/);await assert.rejects(tools.protect(true,androidDevice()),/physical phone/);}finally{await tools.close();}
});
test('a saved virtual-device configuration migrates to no phone without altering account settings',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-phone-migration-')),saved={...structuredClone(defaults),androidDevice:{type:'emulator',serial:'emulator-5556'}};saved.platforms.manychat.flowUrl='https://app.manychat.com/fb5866348/cms';await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(saved));
 const phone=new EventEmitter();phone.configure=async value=>{assert.deepEqual(value,{type:'phone',serial:''});};phone.state=()=>({connected:false});phone.monitor=()=>assert.fail('No monitor for an unselected phone');phone.refresh=()=>assert.fail('No scan for an unselected phone');
 const {app}=await createApp({dataDir:dir,phoneTools:phone,browser:{page:()=>assert.fail('No social service')}}),server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/bootstrap'),body=await response.json();assert.equal(response.status,200);assert.deepEqual(body.config.androidDevice,{type:'phone',serial:''});assert.deepEqual(body.config.platforms,validateConfig({...saved,androidDevice:androidDevice()}).platforms);assert.equal(body.runs.length,0);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('studio-phone-migration-'));await fs.rm(dir,{recursive:true,force:true});}
});
test('the phone driver has no virtual-device launcher or display tuning entry point',async()=>{
 const pkg=JSON.parse(await fs.readFile('package.json','utf8'));assert(!Object.keys(pkg.scripts).some(key=>key.startsWith('android:')));
 for(const filename of ['scripts/android-worker.mjs','start-android-test.cmd'])await assert.rejects(fs.access(filename),{code:'ENOENT'});
 const driver=await fs.readFile('scripts/phone-worker.mjs','utf8');assert.doesNotMatch(driver,/avd|system-images|qemu|wm size|wm density|emulator\.exe/i);assert.match(driver,/--address.*127\\.0\\.0\\.1|127\.0\.0\.1/);
});
