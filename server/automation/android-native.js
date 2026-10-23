// Copyright (c) 2026 Mrinal. All rights reserved.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import {androidDevice,EMULATOR_SERIAL,EMULATOR_AVD} from '../../shared/android-device.js';
import { ANDROID_DRIVER_SETTINGS } from '../../shared/android-performance.js';
import { InterventionError } from './utils.js';
const exec = promisify(execFile);
export const ANDROID_SERIAL = EMULATOR_SERIAL;
export const ANDROID_AVD = EMULATOR_AVD;
export const ANDROID_URL = 'http://127.0.0.1:4731';
const decode = value => value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, key) => key[0] === '#' ? String.fromCodePoint(parseInt(key.slice(key[1]?.toLowerCase() === 'x' ? 2 : 1), key[1]?.toLowerCase() === 'x' ? 16 : 10)) : ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key]));
export function nativeNodes(xml) {
  return [...xml.matchAll(/<([\w.$]+)\s+([^>]*?)(?:\/>|>)/g)].map(match => ({
    tag: match[1], ...Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], decode(a[2])]))
  })).filter(n => n['resource-id'] || n.class);
}
export const nativeId = name => 'com.instagram.android:id/' + name;
export function nativeBounds(node) {
  const m = node?.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!m) throw new Error('Native control bounds were not available.');
  return { x:+m[1], y:+m[2], width:+m[3]-m[1], height:+m[4]-m[2] };
}
export const xpathLiteral = value => !value.includes('"') ? '"' + value + '"' : !value.includes("'") ? "'" + value + "'" : 'concat(' + value.split('"').map(part => '"' + part + '"').join(", '\"', ") + ')';
// Retry only an explicit pre-session instrumentation failure. A lost/ambiguous
// response may have created a session, so it must never be retried automatically.
export async function connectAndroidDriver(create,reset,recovery='Run android:start and try again.'){
  for(let attempt=0;attempt<2;attempt++){
    const {ok,result}=await create();
    if(ok&&result.value?.sessionId)return result.value.sessionId;
    const message=result.value?.message||'';
    if(attempt===0&&!result.value?.sessionId&&/instrumentation process cannot be initialized within \d+ms timeout/i.test(message)){await reset();continue;}
    throw new InterventionError('The selected Android driver could not connect. '+recovery);
  }
}
const PHOTO_PROVIDER='com.google.android.providers.media.module';
export function isPhotoAccessPicker(nodes){
  const visible=nodes.filter(n=>n.displayed==='true'&&n.package===PHOTO_PROVIDER);
  return visible.some(n=>n['resource-id']===PHOTO_PROVIDER+':id/privacy_text'&&n.text==='Select photos and videos you allow this app to access')&&visible.some(n=>n['resource-id']===PHOTO_PROVIDER+':id/button_add');
}
export function instagramOwnsPhotoPicker(activities){
  const task=activities.match(/topDisplayFocusedRootTask=Task\{[^\r\n]*?#(\d+)\b[^\r\n]*?A=\d+:com\.instagram\.android\}/)?.[1];
  const picker=activities.match(/topResumedActivity=ActivityRecord\{[^\r\n]*?com\.google\.android\.providers\.media\.module\/com\.android\.providers\.media\.photopicker\.PhotoPickerUserSelectActivity t(\d+)\}/)?.[1];
  return Boolean(task&&picker===task);
}
export async function cancelInstagramPhotoAccess(s){
  const nodes=await s.screen();if(!isPhotoAccessPicker(nodes))return false;
  if(!instagramOwnsPhotoPicker(await s.adb(['shell','dumpsys','activity','activities'])))throw new InterventionError('The photo-access dialog could not be verified as belonging to Instagram. Close it on the selected Android device, then retry. Its selections were preserved.');
  const cancel=nodes.filter(n=>n.displayed==='true'&&n.package===PHOTO_PROVIDER&&n.tag==='android.widget.ImageButton'&&n['content-desc']==='Cancel');
  if(cancel.length!==1)throw new InterventionError('Close the Android photo-access dialog, then retry. No photo permissions were changed.');
  // Cancel pending edits only. Never press Allow on a stale dialog, broaden
  // permission, change its selected photos or dismiss the underlying post.
  await s.click('xpath','//android.widget.ImageButton[@package="'+PHOTO_PROVIDER+'" and @content-desc="Cancel"]');
  await s.until(next=>!isPhotoAccessPicker(next)&&next.some(n=>n.displayed==='true'&&n.package==='com.instagram.android'),'Android photo access is still closing. Close that dialog in the emulator and retry.',15000);
  return true;
}
export async function dismissInstagramRatingPrompt(s,nodes){
  const current=nodes||await s.screen(),visible=current.filter(n=>n.displayed==='true'&&n.package==='com.instagram.android');
  if(!visible.some(n=>/^com\.instagram\.android:id\/appirater_/.test(n['resource-id']||'')))return false;
  const title=visible.filter(n=>n['resource-id']===nativeId('appirater_title_area'));
  const cancel=visible.filter(n=>n['resource-id']===nativeId('appirater_cancel_button'));
  if(title.length!==1||title[0].text!=='Rate Instagram'||cancel.length!==1||cancel[0].text!=='No, thanks')throw new InterventionError('The Instagram rating dialog could not be verified. Close it yourself in the emulator; its screen and draft were preserved.');
  if(visible.some(n=>/layout_edit_media_info_layout|edit_media_caption|caption_input_text_view|story_share_controls_action_bar|new_post_title|media_thumbnail_tray_button|gallery_folder_menu_tv|music_browser_container|music_search_clips_landing_page_container|audio_browser_track_|music_editor_controls_container|link_sticker_list_web_url_edit_text|direct_external_share_container_view/.test(n['resource-id']||'')||n.password==='true'))throw new InterventionError('Instagram has an unsent draft behind its rating dialog. Close it yourself in the emulator; the draft was preserved.');
  if(s.ratingPromptDismissed)throw new InterventionError('The Instagram rating dialog appeared again. Close it yourself in the emulator; its screen and draft were preserved.');
  s.signal?.throwIfAborted();
  // Mark before the one allowed click: an ambiguous response must not replay it.
  s.ratingPromptDismissed=true;
  await s.click('xpath','//*[@package="com.instagram.android" and @resource-id="'+nativeId('appirater_cancel_button')+'" and @text="No, thanks" and @displayed="true"]');
  await s.until(next=>!next.some(n=>n.displayed==='true'&&n.package==='com.instagram.android'&&/^com\.instagram\.android:id\/appirater_/.test(n['resource-id']||'')),'The Instagram rating dialog did not close. Close it yourself in the emulator; its screen and draft were preserved.',15000);
  return true;
}
export const ANDROID_UNRESPONSIVE='Instagram is not responding in Android. Its draft was preserved. Wait for it in the emulator, or choose Web in Compose for a faster feed post. Nothing was retried automatically.';
export const ANDROID_SYSTEM_UNRESPONSIVE='Android System UI is not responding. Its screen and draft were preserved. Wait in the emulator before another Android attempt, or use Web for the feed.';
// Only a server-reported root-accessibility timeout can be retried, and only on
// these read-only endpoints. A transport failure could hide a completed action.
const ROOT_ACCESSIBILITY_TIMEOUT=/Timed out after \d+ms waiting for the root AccessibilityNodeInfo in the active window\b/i;
const ANDROID_READ_UNAVAILABLE='Android could not read the current screen after accessibility timeouts. Its unsent draft was preserved. Wait in the emulator, then try again.';
function inspectionTimeout(){
  const error=new InterventionError('Android could not read the current screen before its time limit. Its unsent draft was preserved. Wait in the emulator, then try again.');
  error.code='ANDROID_READ_TIMEOUT';
  return error;
}

const readOnlyInspection=(endpoint,method)=>(method==='GET'&&(endpoint==='/source'||/^\/element\/[^/?#]+\/attribute\/[^/?#]+$/.test(endpoint)))||(method==='POST'&&endpoint==='/elements');
async function inspectionPause(signal,ms,deadline){
  signal?.throwIfAborted();
  const remaining=deadline-Date.now();
  if(remaining>0)await delay(Math.min(ms,remaining),undefined,{signal});
  signal?.throwIfAborted();
}
function controlLocator(using,value){
  // Never include XPath text, accessibility labels, captions, passwords or codes.
  const resource=using==='id'?value:using==='xpath'?value.match(/@resource-id\s*=\s*["']((?:com\.instagram\.android|android):id\/[a-z][a-z0-9_]{0,79})["']/)?.[1]:'';
  if(/^(?:com\.instagram\.android|android):id\/[a-z][a-z0-9_]{0,79}$/.test(resource||''))return 'resource-id '+resource;
  if(using==='id')return 'Android resource selector';
  if(using==='xpath')return 'XPath selector (text and labels omitted)';
  return 'Android control selector (text and labels omitted)';
}

export function androidAnrOwner(nodes){
  const visible=nodes.filter(n=>n.displayed==='true'&&n.package==='android');
  if(!visible.some(n=>n['resource-id']==='android:id/aerr_wait'&&n.text==='Wait')||!visible.some(n=>n['resource-id']==='android:id/aerr_close'&&n.text==='Close app'))return null;
  const title=visible.find(n=>n['resource-id']==='android:id/alertTitle')?.text||'';
  if(/^Instagram (?:isn['\u2019]t|is not) responding$/i.test(title))return 'instagram';
  if(/^System UI (?:isn['\u2019]t|is not) responding$/i.test(title))return 'systemUi';
  return null;
}
export function instagramAnr(nodes){return androidAnrOwner(nodes)==='instagram';}
export class AndroidSession {
  constructor({signal,device}={}) {
    this.signal=signal;this.device=androidDevice(device);this.serial=this.device.serial;
    if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) throw new InterventionError('Instagram music and Stories require the configured Windows Android worker.');
    this.root = path.join(process.env.LOCALAPPDATA, 'GoClassesSocialStudio', 'android-worker');
    this.adbPath = path.join(this.root, 'sdk', 'platform-tools', 'adb.exe');
  }
  async adb(args, timeout=20000) {
    this.signal?.throwIfAborted();
    const result = await exec(this.adbPath, ['-s', this.serial, ...args], { windowsHide:true, timeout, maxBuffer:4*1024*1024, signal:this.signal });
    this.signal?.throwIfAborted();return result.stdout.trim();
  }
  async open({ start = false } = {}) {
    // Warm workers skip the launcher, repeated PowerShell ownership queries and tuning.
    let ready=false;try{const response=await fetch(ANDROID_URL+'/status',{signal:AbortSignal.timeout(1200)});ready=response.ok&&(await response.json()).value?.ready===true;}catch{}
    if(this.device.type==='phone'){
      if(await this.adb(['get-state']).catch(()=>'')!=='device')throw new InterventionError('Connect and unlock the selected USB phone, then allow USB debugging. No other device was selected.');
      if(await this.adb(['shell','getprop','ro.kernel.qemu'])==='1')throw new InterventionError('The selected phone is an emulator. Select the intended USB phone.');
      if(!ready)await exec(process.execPath,[path.resolve('scripts/android-worker.mjs'),'server-start'],{windowsHide:true,timeout:70000,maxBuffer:1024*1024,signal:this.signal});
    }else{
    const existing=ready?await this.adb(['emu','avd','name']).catch(()=>''):'';
    if(start&&(!ready||!existing.split(/\r?\n/).map(value=>value.trim()).includes(ANDROID_AVD)))await exec(process.execPath, [path.resolve('scripts/android-worker.mjs'), 'start'], { windowsHide:true, timeout:150000, maxBuffer:1024*1024, signal:this.signal });
    const name = (existing||await this.adb(['emu','avd','name'])).split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&x!=='OK').join('');
    if (name !== ANDROID_AVD || await this.adb(['shell','getprop','sys.boot_completed']) !== '1') throw new InterventionError('Start the dedicated Instagram Android emulator and finish signing in.');
    }
    const packages = await this.adb(['shell','pm','list','packages']);
    const installedServer = packages.split(/\s+/).includes('package:io.appium.uiautomator2.server') && packages.includes('package:io.appium.uiautomator2.server.test');
    const deviceServer = installedServer ? await this.adb(['shell','dumpsys','package','io.appium.uiautomator2.server']) : '';
    const serverPackage = JSON.parse(await fs.readFile(path.join(this.root,'automation','node_modules','appium-uiautomator2-driver','node_modules','appium-uiautomator2-server','package.json'),'utf8'));
    const reusableServer = deviceServer.match(/versionName=([^\s]+)/)?.[1] === serverPackage.version;
    this.id=await connectAndroidDriver(async()=>{
    const response = await fetch(ANDROID_URL+'/session', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({capabilities:{alwaysMatch:{
      platformName:'Android','appium:automationName':'UiAutomator2','appium:udid':this.serial,'appium:deviceName':this.device.type==='phone'?this.serial:ANDROID_AVD,
      'appium:appPackage':'com.instagram.android','appium:autoLaunch':false,'appium:noReset':true,'appium:fullReset':false,
      'appium:skipUnlock':true,'appium:skipDeviceInitialization':packages.includes('package:io.appium.settings'),
      'appium:skipServerInstallation':reusableServer,'appium:uiautomator2ServerLaunchTimeout':60000,'appium:adbExecTimeout':60000,'appium:skipLogcatCapture':true,'appium:printPageSourceOnFindFailure':false,'appium:newCommandTimeout':900
    }}}), signal:AbortSignal.timeout(120000) });
    return {ok:response.ok,result:await response.json()};
    },async()=>{
      // Reset only our automation instrumentation, preserving Instagram data,
      // its signed-in account and every unsent editor. No publication is retried.
      for(const packageName of ['io.appium.uiautomator2.server','io.appium.uiautomator2.server.test'])await this.adb(['shell','am','force-stop',packageName]);
    },this.device.type==='phone'?'Reconnect and unlock the selected USB phone, allow debugging, then retry.':'Run android:start and try again.');
    this.signal?.throwIfAborted();
    this.ratingPromptDismissed=false;
    await this.request('/appium/settings','POST',{settings:ANDROID_DRIVER_SETTINGS});
    return this;
  }
  async request(endpoint, method='GET', body, {deadline=Infinity}={}) {
    if (!this.id) throw new Error('No Android inspection session.');
    const readOnly=readOnlyInspection(endpoint,method),end=Math.min(Date.now()+45000,deadline);
    let recovering=false;
    for(let attempt=0;attempt<3;attempt++){
      if(this.signal?.aborted && method!=='DELETE')throw new InterventionError('Android operation stopped. Its unsent draft was preserved.');
      const remaining=end-Date.now();
      if(remaining<=0)throw readOnly?inspectionTimeout():new InterventionError('Android inspection reached its time limit. Its unsent draft was preserved.');
      const timeoutSignal=AbortSignal.timeout(Math.ceil(remaining));
      let response,out;
      try{
        response=await fetch(ANDROID_URL+'/session/'+this.id+endpoint,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:this.signal&&method!=='DELETE'?AbortSignal.any([this.signal,timeoutSignal]):timeoutSignal});
        out=await response.json();
      }catch(error){
        if(method!=='DELETE')this.signal?.throwIfAborted();
        if(readOnly&&timeoutSignal.aborted)throw inspectionTimeout();
        throw error;
      }
      if(method!=='DELETE')this.signal?.throwIfAborted();
      if(response.ok&&!out.value?.error)return out.value;
      const message=out.value?.message||out.value?.error||response.status;
      if(!readOnly||!ROOT_ACCESSIBILITY_TIMEOUT.test(String(message)))throw new Error('Android: '+message);
      if(Date.now()>=end)throw inspectionTimeout();
      if(attempt===2)throw new InterventionError(ANDROID_READ_UNAVAILABLE);
      if(!recovering){
        recovering=true;
        await (this.onReadRecovery||this.onUnresponsive)?.('Android is briefly unable to expose its current screen. Rechecking the screen only; your draft is preserved...');
      }
      await inspectionPause(this.signal,250*(attempt+1),end);
    }
  }
  async close() {
    if (!this.id) return;
    try { await this.request('','DELETE'); } finally { this.id=null; }
  }
  async screen({deadline=Infinity}={}) {
    let nodes=nativeNodes(await this.request('/source','GET',undefined,{deadline}));
    const anr=androidAnrOwner(nodes);
    if(nodes.some(n=>n.displayed==='true'&&n['resource-id']==='android:id/aerr_wait')&&!anr)throw new InterventionError('Android has an unrecognized app-not-responding dialog. Close it yourself before continuing. Its draft was preserved.');
    if(anr){
      const message=anr==='instagram'?ANDROID_UNRESPONSIVE:ANDROID_SYSTEM_UNRESPONSIVE;
      if(this.anrWaited)throw new InterventionError(message);
      this.anrWaited=true;
      await this.onUnresponsive?.((anr==='instagram'?'Instagram':'Android System UI')+' stopped responding. Giving it one chance to recover; your draft is preserved...');
      // Only the verified system Wait control. Never Close app, relaunch,
      // discard a draft, or repeat Share after an unresponsive-app dialog.
      await this.click('id','android:id/aerr_wait');
      const end=Math.min(Date.now()+20000,deadline);
      while(Date.now()<end){await inspectionPause(this.signal,500,end);if(Date.now()>=end)break;nodes=nativeNodes(await this.request('/source','GET',undefined,{deadline:end}));if(!androidAnrOwner(nodes))break;}
      if(androidAnrOwner(nodes))throw new InterventionError(message);
      if(nodes.some(n=>n.displayed==='true'&&n['resource-id']==='android:id/aerr_wait'))throw new InterventionError('Android has another unrecognized system dialog. Its screen and draft were preserved.');
    }
    if(nodes.some(n=>n.password==='true' && n.displayed==='true')) throw new InterventionError('Finish Instagram sign-in yourself in the emulator. Passwords and codes are never read or filled.');
    return nodes;
  }
  async until(predicate, message='Instagram is still loading.', timeout=45000) {
    const end=Date.now()+timeout;
    while(Date.now()<end) {
      let nodes;
      try{nodes=await this.screen({deadline:end});}
      catch(e){
        this.signal?.throwIfAborted();
        if(e instanceof InterventionError&&e.code==='ANDROID_READ_TIMEOUT'&&Date.now()>=end)throw new InterventionError(message);
        if(!/Unable to find the active topmost window associated with (?:com\.instagram\.android|com\.google\.android\.permissioncontroller|com\.google\.android\.providers\.media\.module) package/.test(e.message))throw e;
        await inspectionPause(this.signal,300,end);continue;
      }
      if(Date.now()>=end)break;
      const value=await predicate(nodes);if(value)return value;
      await inspectionPause(this.signal,250,end);
    }
    throw new InterventionError(message);
  }
  async find(using,value,{deadline=Infinity}={}) {
    const locator=controlLocator(using,value);
    // Appium prefixes unqualified IDs; native Compose widgets also use plain IDs.
    if(using==='id' && !value.includes(':')) { using='xpath'; value='//*[@resource-id='+xpathLiteral(value)+']'; }
    let nodes=await this.request('/elements','POST',{using,value},{deadline});
    const end=Math.min(Date.now()+4000,deadline);
    while(!nodes.length&&Date.now()<end){
      await inspectionPause(this.signal,250,end);if(Date.now()>=end)break;
      nodes=await this.request('/elements','POST',{using,value},{deadline:end});
    }
    if(nodes.length!==1)throw new InterventionError('Instagram '+(nodes.length?'matched '+nodes.length+' controls':'found no controls')+' for '+locator+'. '+(nodes.length?'The selector is ambiguous.':'The requested control is unavailable.')+' Its unsent draft was preserved.');
    return nodes[0]['element-6066-11e4-a52e-4f735466cecf'];
  }
  async click(using,value) {
    if(/(?:^|[/:_])(?:share|publish|send)(?:[/:_]|$)/i.test(value)) throw new Error('Final Android publication control is blocked during preparation.');
    const id=await this.find(using,value);
    const labels=await Promise.all(['text','content-desc'].map(attr=>this.request('/element/'+id+'/attribute/'+attr)));
    if(labels.some(label=>/^(share|post|send|publish|go live|your story|your stories|close friends)$/i.test(label||'')))throw new Error('Final Android publication control is blocked during preparation.');
    await this.request('/element/'+id+'/click','POST',{});
  }
  async clickId(name) { return this.click('id',nativeId(name)); }
  async text(using,value,text) {
    const id=await this.find(using,value);
    if(await this.request('/element/'+id+'/attribute/password')==='true')throw new Error('Password fields are never filled.');
    await this.request('/element/'+id+'/clear','POST',{});
    await this.request('/element/'+id+'/value','POST',{text,value:[...text]});
  }
  async replaceText(using,value,text){
    if(text.endsWith('\\n'))throw new InterventionError('The caption ends with a literal backslash-n. Use a real line break before posting.');
    const id=await this.find(using,value);
    if(await this.request('/element/'+id+'/attribute/password')==='true')throw new Error('Password fields are never filled.');
    await this.request('/execute/sync','POST',{script:'mobile: replaceElementValue',args:[{elementId:id,text}]});
  }
  async screenshot() { return Buffer.from(await this.request('/screenshot'),'base64'); }
  async activate() {
    await this.request('/appium/device/activate_app','POST',{appId:'com.instagram.android'});
    // Activation can return while a low-memory emulator still shows its launcher.
    await this.until(async nodes=>{
      if(isPhotoAccessPicker(nodes)){await cancelInstagramPhotoAccess(this);return false;}
      return nodes.some(n=>n.displayed==='true'&&n.package==='com.instagram.android');
    },'Instagram did not finish opening on Android. Open it on the selected Android device and try again.',90000);
  }
  async account(expected) {
    await this.activate();
    // Public post/share navigation can be dismissed, but never an unsent editor.
    for(let i=0;i<12;i++){
      const current=(await this.screen()).filter(n=>n.displayed==='true');
      if(await dismissInstagramRatingPrompt(this,current))continue;
      if(current.some(n=>n['resource-id']===nativeId('reel_viewer_root'))&&current.some(n=>n['resource-id']===nativeId('reel_viewer_title')&&n.text===expected)&&current.some(n=>n['resource-id']===nativeId('self_toolbar_menu_button'))){await this.request('/back','POST',{});await delay(300);continue;}
      if(current.some(n=>n['resource-id']===nativeId('direct_external_share_container_view')||n['resource-id']===nativeId('direct_private_share_container_view'))){
        if(current.some(n=>/EditText$/.test(n.class||'')&&n.text&&!/^Search(?:\.\.\.|\u2026)?$/i.test(n.text)))throw new InterventionError('Close the Instagram sharing menu and preserve its unsent message before continuing.');
        await this.request('/back','POST',{});await delay(400);continue;
      }
      if(current.some(n=>n['resource-id']===nativeId('new_post_title')||n['resource-id']===nativeId('gallery_folder_menu_tv')))throw new InterventionError('Instagram has an unfinished New post screen. Close it on the selected Android device, then retry. Your draft was preserved.');
      if(current.some(n=>/caption_input_text_view|story_share_controls_action_bar|new_post_title|media_thumbnail_tray_button|gallery_folder_menu_tv|music_browser_container|music_search_clips_landing_page_container|audio_browser_track_|music_editor_controls_container|link_sticker_list_web_url_edit_text/.test(n['resource-id']||'')))throw new InterventionError('Close the unsent Instagram Android draft before continuing.');
      if(!current.some(n=>n['resource-id']===nativeId('profile_tab'))&&(current.some(n=>n['resource-id']===nativeId('row_feed_profile_header'))||current.some(n=>n['resource-id']===nativeId('row_feed_button_share'))||current.some(n=>n['resource-id']===nativeId('profile_tab_layout')))){
        // Close only an observed public viewer/profile, never an unsent editor.
        await this.request('/back','POST',{});await delay(300);continue;
      }
      break;
    }
    const ownProfile=nodes=>nodes.some(n=>n.displayed==='true'&&n['resource-id']===nativeId('action_bar_title')&&n.text===expected)&&nodes.some(n=>n.displayed==='true'&&n['resource-id']===nativeId('profile_header_create_button'));
    const nodes=await this.until(async nodes=>{
      if(await dismissInstagramRatingPrompt(this,nodes))return false;
      return (ownProfile(nodes)||nodes.some(n=>n.displayed==='true'&&n['resource-id']===nativeId('profile_tab')))&&nodes;
    },'Finish Instagram sign-in or close its unsent Android draft before preparing a post.');
    if(nodes.some(n=>n.displayed==='true'&&/new_post_title|media_thumbnail_tray_button|gallery_folder_menu_tv|caption_input_text_view|music_editor_controls_container/.test(n['resource-id']||'')))throw new InterventionError('Instagram has an unsent Android draft. Close it yourself before preparing another post.');
    if(!ownProfile(nodes))await this.clickId('profile_tab');
    await this.until(async nodes=>{
      if(await dismissInstagramRatingPrompt(this,nodes))return false;
      return nodes.some(n=>n['resource-id']===nativeId('action_bar_title')&&n.text===expected);
    },'The Android Instagram account does not match @'+expected+'.');
    this.accountHandle=expected;
  }
  async gesture(actions) { return this.request('/actions','POST',{actions:[{type:'pointer',id:'studio-finger',parameters:{pointerType:'touch'},actions}]}); }
  async drag(from,to) {
    await this.gesture([{type:'pointerMove',duration:0,x:Math.round(from.x),y:Math.round(from.y)},{type:'pointerDown',button:0},{type:'pause',duration:350},{type:'pointerMove',duration:700,x:Math.round(to.x),y:Math.round(to.y)},{type:'pointerUp',button:0}]);
  }
}
