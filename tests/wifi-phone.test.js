// Copyright (c) 2026 Mrinal. Offline phone discovery, identity and viewer tests.
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
import {androidDevice,androidDeviceKey,wifiAddress} from '../shared/android-device.js';import {deviceConnections,wifiServices,resolveWifiPhone,recoverPhoneConnection,isAndroidTransportFailure,pairPhone,scanPhones} from '../server/android-devices.js';import {PhoneTools} from '../server/phone-tools.js';import {PhoneScreen} from '../server/phone-screen.js';
const wifi={type:'phone',serial:'192.168.1.6:43095',transport:'wifi',hardwareSerial:'OFFICE123'};
test('Wi-Fi targets require private numeric endpoints and a pinned physical identity',()=>{assert.deepEqual(androidDevice(wifi),wifi);assert.equal(androidDeviceKey(wifi),androidDeviceKey({...wifi,serial:'192.168.1.8:44444'}));for(const serial of ['8.8.8.8:5555','127.0.0.1:5555','192.168.1.6:65536','192.168.1.256:1','office.local:4444','192.168.1.6:123;calc'])assert(!wifiAddress(serial));for(const value of [{...wifi,hardwareSerial:''},{...wifi,hardwareSerial:'emulator-5556'},{type:'phone',serial:wifi.serial},{...wifi,serial:'8.8.8.8:123'}])assert.throws(()=>androidDevice(value));assert.equal(wifiAddress('172.16.1.2:5555'),true);assert.equal(wifiAddress('172.32.1.2:5555'),false);});
test('discovery separates USB and Wi-Fi, excludes emulators/public endpoints and parses only ADB TLS advertisements',()=>{const rows=deviceConnections('List of devices attached\nOFFICE123 device model:SM_A166P\n192.168.1.6:43095 device model:SM_A166P\nemulator-5556 device model:emulator\n8.8.8.8:123 device\nOTHER123 unauthorized');assert.equal(rows.length,3);assert.equal(rows[0].transport,'usb');assert.equal(rows[1].transport,'wifi');assert.equal(rows[2].state,'unauthorized');assert.deepEqual(wifiServices('adb-OFFICE123-xx\t_adb-tls-connect._tcp\t192.168.1.6:43095\nadb-OFFICE123-xx _adb-tls-pairing._tcp 192.168.1.6:12345\nwrong _http._tcp 192.168.1.1:80\nwrong _adb-tls-connect._tcp 8.8.8.8:123').map(s=>s.kind),['connect','pairing']);});
test('connected Wi-Fi address is checked against the physical identity before use',async()=>{const calls=[];const run=async args=>{calls.push(args);return args.at(-1)==='get-state'?'device':'OFFICE123';};assert.equal(await resolveWifiPhone(wifi,{run}),wifi.serial);assert.equal(calls.length,2);await assert.rejects(resolveWifiPhone(wifi,{run:async args=>args.at(-1)==='get-state'?'device':'SOMEONE_ELSE'}),/another phone/);});
test('stale Wi-Fi port reconnects only the same advertised and verified phone',async()=>{const calls=[];const run=async args=>{calls.push(args);if(args[0]==='mdns')return 'adb-OTHER123-xx _adb-tls-connect._tcp 192.168.1.7:44444\nadb-OFFICE123-new _adb-tls-connect._tcp 192.168.1.6:49999';if(args[0]==='connect')return 'connected';if(args[1]===wifi.serial)throw Error('offline');return args.at(-1)==='get-state'?'device':'OFFICE123';};assert.equal(await resolveWifiPhone(wifi,{run}),'192.168.1.6:49999');assert.deepEqual(calls.filter(a=>a[0]==='connect'),[['connect',wifi.serial],['connect','192.168.1.6:49999']]);assert(!calls.some(a=>a.includes('192.168.1.7:44444')));});
test('missing selected Wi-Fi phone never falls back to USB, another phone or an emulator',async()=>{const calls=[];await assert.rejects(resolveWifiPhone(wifi,{run:async args=>{calls.push(args);if(args[0]==='mdns')return 'adb-OTHER123-xx _adb-tls-connect._tcp 192.168.1.7:44444';throw Error('offline');}}),/No other phone was selected/);assert.deepEqual(calls,[['-s',wifi.serial,'get-state'],['connect',wifi.serial],['-s',wifi.serial,'get-state'],['mdns','services']]);});
test('pairing code is supplied through stdin, with no shell, and malformed input never runs ADB',async()=>{let call;assert.deepEqual(await pairPhone('192.168.1.6:12345','123456',{run:async(args,options)=>{call={args,options};return 'Successfully paired';}}),{ok:true});assert.deepEqual(call.args,['pair','192.168.1.6:12345']);assert.equal(call.options.input,'123456');await assert.rejects(pairPhone('8.8.8.8:12345','123456',{run:()=>assert.fail()}));await assert.rejects(pairPhone('192.168.1.6:12345','12345',{run:()=>assert.fail()}));});
test('Scan discovers paired Wi-Fi without launching apps or changing the selected phone',async()=>{const calls=[];const run=async args=>{calls.push(args);if(args[0]==='mdns')return 'adb-OFFICE123-xx _adb-tls-connect._tcp 192.168.1.6:43095';if(args[0]==='devices')return 'OFFICE123 device model:SM_A166P\n192.168.1.6:43095 device model:SM_A166P';if(args[0]==='connect')return 'connected';return 'OFFICE123';};const result=await scanPhones({run});assert.equal(result.devices.length,2);assert.equal(result.devices[1].hardwareSerial,'OFFICE123');assert(!calls.some(a=>a.includes('input')||a.includes('am')));});
test('phone status distinguishes connected and offline; viewing does not create a publication',async()=>{let online=true,shown;const screen=new EventEmitter();screen.state=()=>({running:false});screen.open=async serial=>{shown=serial;};screen.close=async()=>{};const tools=new PhoneTools({run:async args=>args[0]==='devices'?(online?'OFFICE123 device model:Samsung':''):args.at(-1)==='get-state'?'device':'0',screen});try{await tools.configure({type:'phone',serial:'OFFICE123'});await tools.refresh();assert.equal(tools.state().connected,true);await tools.show({type:'phone',serial:'OFFICE123'});assert.equal(shown,'OFFICE123');online=false;await tools.refresh();assert.equal(tools.state().connected,false);}finally{await tools.close();}});
test('viewer is lightweight, hidden-console, audible and waits for a rendered frame; repeated Show reuses it',async()=>{let launches=0,killed=0,options,args;const fake=new EventEmitter();fake.stdout=new PassThrough();fake.stderr=new PassThrough();fake.kill=()=>{killed++;queueMicrotask(()=>fake.emit('exit',0));};const viewer=new PhoneScreen({home:'.',adb:()=>'/fixture/adb',prepare:async()=>'/fixture/scrcpy.exe',launch:(_file,a,o)=>{launches++;args=a;options=o;queueMicrotask(()=>fake.stdout.write('INFO: Texture (D3D11VA): 480x1024'));return fake;}});await viewer.open(wifi.serial);assert.equal(viewer.state().running,true);assert(args.includes('--serial='+wifi.serial));assert(args.includes('--max-fps=30'));assert(args.includes('--max-size=1024'));assert(args.includes('--no-clipboard-autosync'));assert(!args.includes('--no-audio'));assert.equal(options.windowsHide,true);assert.equal(options.env.ADB,'/fixture/adb');await viewer.open(wifi.serial);assert.equal(launches,1);await viewer.close();assert.equal(killed,1);assert.equal(viewer.state().running,false);});

test('closing during viewer preparation prevents a late window from opening',async()=>{let finish,launches=0;const viewer=new PhoneScreen({home:'.',adb:()=>'/fixture/adb',prepare:()=>new Promise(r=>finish=r),launch:()=>{launches++;assert.fail('Cancelled viewer must not launch');}});const pending=viewer.open(wifi.serial);await new Promise(r=>setImmediate(r));await viewer.close();finish('/fixture/scrcpy.exe');await assert.rejects(pending,/cancelled/);assert.equal(launches,0);assert.equal(viewer.state().phase,'idle');});

test('transport classifier recognizes the reported ADB offline response without treating UI errors as phone failures',()=>{
 for(const message of ["Android: Error executing adbExec. Original error: Command 'adb.exe -s 192.168.1.4:45227 shell settings delete global hidden_api_policy' exited with code 1; Command output: adb.exe: device offline", "adb: device '192.168.1.6:43095' not found",'error: no devices/emulators found','ADB transport connection closed'])assert.equal(isAndroidTransportFailure(new Error(message)),true,message);
 for(const message of ['The Edit button was not found.','Instagram is not responding.','Timed out waiting for root AccessibilityNodeInfo','Android: settings delete hidden_api_policy failed','Gemini is busy.','fetch failed'])assert.equal(isAndroidTransportFailure(new Error(message)),false,message);
 assert.equal(isAndroidTransportFailure({code:'ANDROID_PHONE_DISCONNECTED'}),true);
 assert.equal(isAndroidTransportFailure({stderr:'adb.exe: device offline'}),true);
});

test('recovery resets only the selected offline Wi-Fi endpoint and verifies hardware before returning',async()=>{
 const calls=[],events=[];let online=false;
 const run=async(args,options)=>{calls.push(args);assert(options.signal instanceof AbortSignal);assert(options.timeout>0&&options.timeout<=5000);if(args[0]==='disconnect')return 'disconnected';if(args[0]==='connect'){online=true;return 'connected';}if(args.at(-1)==='get-state')return online?'device':'offline';if(args.at(-1)==='ro.serialno')return wifi.hardwareSerial;assert.fail('Unexpected operation '+args);};
 assert.equal(await recoverPhoneConnection(wifi,{run,onEvent:event=>events.push(event)}),wifi.serial);
 assert.deepEqual(calls.filter(args=>['connect','disconnect'].includes(args[0])),[['disconnect',wifi.serial],['connect',wifi.serial]]);
 assert.equal(events.at(-1).phase,'succeeded');assert(events.some(event=>event.phase==='detected'));
 assert(!calls.some(args=>args.includes('kill-server')||args.includes('start-server')||args.includes('input')||args.includes('am')||args.includes('pair')));
});

test('the saved paired address reconnects without any mDNS advertisement',async()=>{
 const calls=[];let online=false;
 const run=async args=>{calls.push(args);if(args[0]==='connect'){online=true;return 'connected';}if(args.at(-1)==='get-state'){if(!online)throw Error('adb: device not found');return 'device';}if(args.at(-1)==='ro.serialno')return wifi.hardwareSerial;assert.fail('No discovery or other device was needed');};
 assert.equal(await resolveWifiPhone(wifi,{run}),wifi.serial);
 assert.deepEqual(calls,[['-s',wifi.serial,'get-state'],['connect',wifi.serial],['-s',wifi.serial,'get-state'],['-s',wifi.serial,'shell','getprop','ro.serialno']]);
});

test('an already connected selected phone is identity checked without disconnect or reconnect',async()=>{
 const calls=[];assert.equal(await recoverPhoneConnection(wifi,{run:async args=>{calls.push(args);return args.at(-1)==='get-state'?'device':wifi.hardwareSerial;}}),wifi.serial);
 assert.deepEqual(calls,[['-s',wifi.serial,'get-state'],['-s',wifi.serial,'shell','getprop','ro.serialno']]);
});

test('a reused saved Wi-Fi address belonging to another phone is rejected before any connection mutation',async()=>{
 const calls=[];await assert.rejects(recoverPhoneConnection(wifi,{run:async args=>{calls.push(args);return args.at(-1)==='get-state'?'device':'SOMEONE_ELSE';}}),error=>error.code==='ANDROID_PHONE_IDENTITY_MISMATCH');
 assert.equal(calls.length,2);assert(!calls.some(args=>['connect','disconnect','mdns'].includes(args[0])));
});

test('changed-port discovery is pinned to the selected hardware and still rejects a false identity',async()=>{
 const calls=[];
 await assert.rejects(recoverPhoneConnection(wifi,{run:async args=>{calls.push(args);if(args[0]==='mdns')return 'adb-OTHER123-a _adb-tls-connect._tcp 192.168.1.7:44444\nadb-OFFICE123-a _adb-tls-connect._tcp 192.168.1.6:49999\nadb-OFFICE123-b _adb-tls-connect._tcp 192.168.1.6:49998';if(args[0]==='connect')return 'connected';if(args[1]===wifi.serial)throw Error('adb: device not found');return args.at(-1)==='get-state'?'device':'SOMEONE_ELSE';}}),error=>error.code==='ANDROID_PHONE_IDENTITY_MISMATCH');
 assert(!calls.some(args=>args.includes('192.168.1.7:44444')||args.includes('192.168.1.6:49998')));
 assert(!calls.some(args=>args[0]==='disconnect'));
});

test('an unauthorized phone pauses without pairing or clearing any connection',async()=>{
 for(const unauthorized of ['unauthorized',new Error('adb: device unauthorized. Please check the confirmation dialog on your device.')]){
  const calls=[];await assert.rejects(recoverPhoneConnection(wifi,{run:async args=>{calls.push(args);if(unauthorized instanceof Error)throw unauthorized;return unauthorized;}}),error=>error.code==='ANDROID_PHONE_UNAUTHORIZED');
  assert.deepEqual(calls,[['-s',wifi.serial,'get-state']]);
 }
});

test('USB recovery checks only the selected physical identity and never falls back to another transport',async()=>{
 const usb={type:'phone',serial:'OFFICE123'};let calls=[];
 assert.equal(await recoverPhoneConnection(usb,{run:async args=>{calls.push(args);return args.at(-1)==='get-state'?'device':'OFFICE123';}}),'OFFICE123');
 assert.equal(calls.length,2);calls=[];
 await assert.rejects(recoverPhoneConnection(usb,{run:async args=>{calls.push(args);return 'offline';}}),/selected USB phone/);
 assert.deepEqual(calls,[['-s','OFFICE123','get-state']]);
 await assert.rejects(recoverPhoneConnection({type:'emulator'},{run:()=>assert.fail()}),/selected physical phone/);
});

test('a pre-cancelled recovery never starts ADB or emits an execution event',async()=>{
 const controller=new AbortController();controller.abort(new Error('Stop requested'));
 await assert.rejects(recoverPhoneConnection(wifi,{signal:controller.signal,run:()=>assert.fail(),onEvent:()=>assert.fail()}),/Stop requested/);
});

test('stopping an in-flight connect cancels its command and never starts discovery',async()=>{
 const controller=new AbortController(),calls=[];let started,commandSignal;const pending=new Promise(resolve=>{started=resolve;});
 const operation=recoverPhoneConnection(wifi,{signal:controller.signal,run:async(args,options)=>{calls.push(args);if(args.at(-1)==='get-state')throw Error('adb: device not found');if(args[0]==='connect'){commandSignal=options.signal;started();return new Promise(()=>{});}assert.fail('No later command may run');}});
 await pending;controller.abort(new Error('Stop requested'));
 await assert.rejects(operation,/Stop requested/);assert.equal(commandSignal.aborted,true);assert.equal(calls.length,2);
});

test('the total deadline bounds an uncooperative ADB runner and aborts its signal',async()=>{
 let commandSignal;const started=Date.now();
 await assert.rejects(recoverPhoneConnection(wifi,{timeout:45,run:(_args,options)=>{commandSignal=options.signal;return new Promise(()=>{});}}),error=>error.code==='ANDROID_PHONE_CONNECTION_TIMEOUT');
 assert.equal(commandSignal.aborted,true);assert(Date.now()-started<1000);
 await assert.rejects(recoverPhoneConnection(wifi,{deadline:Date.now()-1,run:()=>assert.fail()}),error=>error.code==='ANDROID_PHONE_CONNECTION_TIMEOUT');
});

test('failed visible recovery recording prevents its following connection mutation',async()=>{
 const calls=[];
 await assert.rejects(recoverPhoneConnection(wifi,{run:async args=>{calls.push(args);return 'offline';},onEvent:event=>{if(event.phase==='executing')throw Error('Recovery record could not be saved');}}),/record could not be saved/);
 assert.deepEqual(calls,[['-s',wifi.serial,'get-state']]);
});

test('a stalled recovery-progress callback reaches the deadline without starting ADB',async()=>{
 await assert.rejects(recoverPhoneConnection(wifi,{timeout:40,run:()=>assert.fail('No unrecorded operation may start'),onEvent:()=>new Promise(()=>{})}),error=>error.code==='ANDROID_PHONE_CONNECTION_TIMEOUT');
});
