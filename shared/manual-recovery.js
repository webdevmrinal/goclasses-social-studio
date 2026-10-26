// Copyright (c) 2026 Mrinal. Local recovery classification; raw errors never become cloud input.
const platforms=new Set(['app','instagram','instagramMusic','instagramStory','linkedin','x','youtubeDA','youtubeCS','manychat','whatsapp','telegram']);
const views=new Set(['connections','compose','preview','activity']);
const phases=new Set(['idle','queued','running','pausing','paused','stopping','attention','waiting_for_input','awaiting_manual','failed','uncertain','needs_setup','skipped','dry_run','posted','completed','stopped','interrupted']);
const issues=new Set(['none','phone_connection','connection','login','navigation','content','media','storage','publication','unknown']);
const submissions=new Set(['not_started','may_have_started','confirmed']);
export const MANUAL_RECOVERY_STEPS=Object.freeze({
 inspect_worker:'Open the worker window and inspect the current screen. Leave Send, Share and Save untouched.',
 check_connection:'Check this destination in Connections before continuing its preparation.',
 reconnect_selected_phone:'Unlock the selected phone, keep it on the same Wi-Fi, enable Wireless debugging, then use Scan for phone.',
 open_login:'Open the platform sign-in window from Connections and finish signing in yourself. Keep passwords and codes on that platform.',
 review_content:'Compare the destination caption with the reviewed draft and correct any mismatch in Compose before retrying.',
 review_media:'Review the images selected for this destination and their order in Compose.',
 inspect_published:'Open the platform and check whether the existing item was published. Record its outcome in Activity before any retry.',
 retry_failed_only:'After fixing the cause, retry only this failed destination in TEST mode first. Review its preview before a LIVE run.',
 return_checkpoint:'Return to the screen requested by the paused handoff, then use Check or Continue in Studio. Leave final Save and Share to the app.',
 check_storage:'Check the app data folder is available and writable. Restart Studio only when publishing is stopped.',
 reload_app:'Refresh Studio after the current operation has stopped. Keep its saved draft and completed work.',
 contact_operator:'Ask the operator to inspect the current screen. Preserve the draft and completed work.'
});
const active=new Set(['running','pausing','paused','stopping','attention','waiting_for_input','awaiting_manual']);
const problems=new Set(['failed','uncertain','attention','needs_setup','waiting_for_input']);
const native=new Set(['instagramMusic','instagramStory']);
function issueFor(item,connection,phone){
 if(item?.status==='uncertain'||item?.submitting&&item?.status!=='posted')return 'publication';
 const text=[item?.failureMessage,item?.message,item?.recoveryMessage,connection?.message].filter(v=>typeof v==='string').join('\n');
 if(/device (?:offline|not found|disconnected)|selected (?:Wi-Fi|USB|Android)?\s*phone.*(?:disconnect|unavailable)|wireless debugging|phone connection|adb.*(?:offline|not found)/i.test(text)||native.has(item?.id)&&phone?.connected===false&&problems.has(item?.status))return 'phone_connection';
 if(/\b(?:EPERM|EACCES|ENOSPC|ENOENT)\b|data folder|run.history|disk|storage|could not be saved/i.test(text))return 'storage';
 if(['needs_login','wrong_account','needs_access','manual_login'].includes(connection?.status)||/sign.?in|log.?in|session expir|wrong account|account.*(?:match|verif)|password|QR code/i.test(text))return 'login';
 if(/caption.*(?:match|differ|limit)|reviewed.*(?:caption|text)|character limit|hashtag|caption facts/i.test(text))return 'content';
 if(/image|photo|album|media.*(?:match|differ|select|integrity)|metadata|carousel/i.test(text))return 'media';
 if(/selector|locator|control.*(?:unavailable|ambiguous|not found)|interface|layout|screen|navigation|timed? out|timeout/i.test(text))return 'navigation';
 if(['network_error','loading_timeout'].includes(connection?.status)||/\b(?:ECONN|network|connection|offline|unreachable|HTTP 5\d\d|HTTP 429)/i.test(text))return 'connection';
 if(item&&problems.has(item.status)||connection&&connection.status&&!['verified','checking'].includes(connection.status))return 'unknown';
 return 'none';
}
export function eligibleManualRecoverySteps(context){
 if(!context||!platforms.has(context.platform)||!views.has(context.view)||!phases.has(context.phase)||!issues.has(context.issue)||!submissions.has(context.submission)||typeof context.phoneConnected!=='boolean')return [];
 let ids;
 if(context.submission==='may_have_started'||context.issue==='publication')ids=['inspect_published','inspect_worker','check_connection','contact_operator'];
 else if(context.submission==='confirmed')ids=['inspect_published','inspect_worker','contact_operator'];
 else ids={
  phone_connection:['reconnect_selected_phone','check_connection','inspect_worker','return_checkpoint','contact_operator'],
  connection:['check_connection','inspect_worker','reload_app','contact_operator'],
  login:['open_login','check_connection','inspect_worker','contact_operator'],
  navigation:['inspect_worker','return_checkpoint','check_connection','contact_operator'],
  content:['review_content','review_media','inspect_worker','contact_operator'],
  media:['review_media','review_content','inspect_worker','contact_operator'],
  storage:['check_storage','reload_app','contact_operator'],
  none:['inspect_worker','check_connection','review_content','review_media','contact_operator'],
  unknown:['inspect_worker','check_connection','return_checkpoint','reload_app','contact_operator']
 }[context.issue];
 if(context.submission==='not_started'&&context.phase==='failed')ids=[...ids,'retry_failed_only'];
 return ids.map(id=>({id,label:MANUAL_RECOVERY_STEPS[id]}));
}
export function normalizeManualRecoveryInput({context,steps}={}){
 if(!context||typeof context!=='object'||Array.isArray(context))return null;
 const clean=Object.fromEntries(['platform','view','phase','issue','submission','phoneConnected'].map(key=>[key,context[key]]));
 const allowed=eligibleManualRecoverySteps(clean);if(!allowed.length||!Array.isArray(steps)||!steps.length||steps.length>12)return null;
 const seen=new Set(),list=[];
 for(const step of steps){
  if(!step||typeof step!=='object'||Array.isArray(step)||!allowed.some(candidate=>candidate.id===step.id)||step.label!==MANUAL_RECOVERY_STEPS[step.id]||seen.has(step.id))return null;
  seen.add(step.id);list.push({id:step.id,label:MANUAL_RECOVERY_STEPS[step.id]});
 }
 return {context:clean,steps:list};
}
export function manualRecoveryOutput(body,input){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).join(',')!=='stepIds'||!Array.isArray(body.stepIds)||!body.stepIds.length||body.stepIds.length>3||new Set(body.stepIds).size!==body.stepIds.length)return null;
 if(body.stepIds.some(id=>typeof id!=='string'||!input.steps.some(step=>step.id===id)))return null;
 return body.stepIds.map(id=>MANUAL_RECOVERY_STEPS[id]);
}
export function buildManualRecoveryContext({runs=[],login={},phone={},recovery,view='activity',scope='latest',runId,itemId,platform}={}){
 if(!views.has(view)||!['latest','app','platform','item'].includes(scope)||platform!==undefined&&!platforms.has(platform))throw Error('Choose an available app view or destination for Gemini help.');
 let run,item;
 if(scope!=='app'){
  if(runId!==undefined){run=runs.find(value=>value.id===runId);if(!run)throw Error('That activity is no longer available.');}
  else if(platform&&platform!=='app')run=runs.find(value=>value.items?.some(i=>i.id===platform&&problems.has(i.status)))||runs.find(value=>value.items?.some(i=>i.id===platform));
  else run=runs.find(value=>active.has(value.status))||runs.find(value=>value.items?.some(i=>problems.has(i.status)));
  if(itemId!==undefined){item=run?.items?.find(value=>value.id===itemId);if(!item)throw Error('That destination is no longer available in this activity.');}
  else if(platform&&platform!=='app')item=run?.items?.find(value=>value.id===platform);
  else item=run?.items?.find(value=>problems.has(value.status))||run?.items?.find(value=>active.has(value.status))||run?.items?.find(value=>value.status==='queued');
 }
 const target=platforms.has(item?.id)?item.id:platform||'app';
 const connection=native.has(target)?login.instagramNative||login.instagram:login[target];
 const submission=item?.status==='posted'?'confirmed':item?.submitting||item?.status==='uncertain'?'may_have_started':'not_started';
 let issue=issueFor(item,connection,phone);
 // A global app request may use the latest sanitized error only for local
 // classification. It never copies that text, file path or command to the model.
 if(target==='app'&&issue==='none'&&recovery?.status!=='succeeded'&&typeof recovery?.problem==='string')issue=issueFor({message:recovery.problem,status:'failed'},undefined,phone);
 const phase=phases.has(item?.status)?item.status:phases.has(run?.status)?run.status:'idle';
 const context={platform:target,view,phase,issue,submission,phoneConnected:phone?.connected===true};
 const resolvedTarget={runId:run?.id||null,itemId:item?.id||null};
 return {context,steps:eligibleManualRecoverySteps(context),target:resolvedTarget,stamp:JSON.stringify([resolvedTarget.runId,resolvedTarget.itemId,context])};
}
