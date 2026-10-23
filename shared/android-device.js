// Copyright (c) 2026 Mrinal. Explicit Android targets; never substitute a different device.
export const EMULATOR_SERIAL='emulator-5556';
export const EMULATOR_AVD='GOC_Instagram_Music_Test';
export const usbSerial=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/.test(value)&&!value.startsWith('emulator-')&&!value.includes('._adb-');
export function wifiAddress(value){
 if(typeof value!=='string')return false;
 const m=value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):([1-9]\d{0,4})$/);if(!m)return false;
 const [a,b,c,d,port]=m.slice(1).map(Number);if([a,b,c,d].some(n=>n>255)||port>65535)return false;
 return a===10||a===192&&b===168||a===172&&b>=16&&b<=31||a===169&&b===254;
}
export function androidDevice(value={}){
 const type=value?.type??'emulator',serial=value?.serial??'';
 if(!['phone','emulator'].includes(type)||typeof serial!=='string')throw new Error('Choose Phone or Emulator for native Instagram work.');
 if(type==='phone'){
  if(value.transport==='wifi'){
   if(!wifiAddress(serial)||!usbSerial(value.hardwareSerial))throw new Error('Scan and select the verified Wi-Fi phone in Connections.');
   return {type,serial,transport:'wifi',hardwareSerial:value.hardwareSerial};
  }
  if(value.transport&&value.transport!=='usb'||!usbSerial(serial))throw new Error('Select the exact USB phone or scan for a Wi-Fi phone in Connections.');
 }
 if(type==='emulator'&&serial&&serial!==EMULATOR_SERIAL)throw new Error('The dedicated emulator identity changed.');
 return {type,serial:type==='phone'?serial:EMULATOR_SERIAL};
}
export const androidDeviceKey=value=>{const d=androidDevice(value);return d.transport==='wifi'?'phone:wifi:'+d.hardwareSerial:d.type+':'+d.serial;};
