// Copyright (c) 2026 Mrinal. Explicit Android targets; never fall back between devices.
export const EMULATOR_SERIAL='emulator-5556';
export const EMULATOR_AVD='GOC_Instagram_Music_Test';
export function androidDevice(value={}){
 const type=value?.type??'emulator',serial=value?.serial??'';
 if(!['phone','emulator'].includes(type)||typeof serial!=='string')throw new Error('Choose Phone or Emulator for native Instagram work.');
 if(type==='phone'&&(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/.test(serial)||serial.startsWith('emulator-')))throw new Error('Select the exact USB phone in Connections.');
 if(type==='emulator'&&serial&&serial!==EMULATOR_SERIAL)throw new Error('The dedicated emulator identity changed.');
 return {type,serial:type==='phone'?serial:EMULATOR_SERIAL};
}
export const androidDeviceKey=value=>{const d=androidDevice(value);return d.type+':'+d.serial;};
