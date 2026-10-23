// Copyright (c) 2026 Mrinal. Local USB discovery, no app launches or screen reads.
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import path from 'node:path';
const exec=promisify(execFile);
export function usbPhones(text){return text.split(/\r?\n/).flatMap(line=>{const m=line.trim().match(/^([a-zA-Z0-9][a-zA-Z0-9._-]{2,127})\s+(device|offline|unauthorized)(?:\s|$)(.*)/);return m&&!m[1].startsWith('emulator-')?[{serial:m[1],state:m[2],model:(m[3].match(/(?:^|\s)model:([^\s]+)/)?.[1]||'Android phone').replaceAll('_',' ')}]:[];});}
export async function discoverPhones(){if(process.platform!=='win32'||!process.env.LOCALAPPDATA)throw new Error('The configured Android worker currently needs Windows.');const adb=path.join(process.env.LOCALAPPDATA,'GoClassesSocialStudio/android-worker/sdk/platform-tools/adb.exe');const {stdout}=await exec(adb,['devices','-l'],{windowsHide:true,timeout:10000,maxBuffer:1024*1024});return usbPhones(stdout);}
