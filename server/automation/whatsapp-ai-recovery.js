// Copyright (c) 2026 Mrinal. Only app-owned TEST drafts may be discarded.
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {whatsappChannelUrl} from '../../shared/whatsapp.js';
import {readCaption} from './utils.js';
import {planNavigation} from './ai-plan-wait.js';
const canonical=value=>String(value??'').replace(/\r\n/g,'\n').trim();
const pane=page=>page.getByTestId('conversation-panel-wrapper');
const media=page=>page.getByTestId('media-caption-input-container');
const composer=page=>pane(page).getByTestId('conversation-compose-box-input');
const preview=page=>media(page).locator('xpath=ancestor::div[@tabindex="-1"][1]');
const abort=signal=>signal?.throwIfAborted();
const sources=new Set(['current_test','prior_failed_test','controlled_demo']);
const validOrigin=page=>{try{return new URL(page.url()).origin==='https://web.whatsapp.com';}catch{return false;}};
async function imageEvidence(page,hasImage){
 if(!hasImage)return {count:0};
 const images=preview(page).getByTestId('media-editor-canvas').locator('img');
 if(await images.count()!==1||await preview(page).getByRole('tab',{name:/^Open photo, /}).count()!==1)return null;
 const data=await images.evaluateAll(images=>{const image=images[0];if(!image?.complete||!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)return null;const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);return {width:c.width,height:c.height,pixels:c.toDataURL('image/png')};}).catch(()=>null);
 if(!data)return null;
 return {count:1,width:data.width,height:data.height,hash:createHash('sha256').update(data.pixels).digest('hex')};
}
function sameImage(a,b){return !!a&&!!b&&a.count===b.count&&(a.count===0||a.width===b.width&&a.height===b.height&&a.hash===b.hash);}
export async function expectedWhatsAppImageProof(page,file){
 const bytes=await fs.readFile(file);if(bytes.length>50*1024*1024)return null;
 const data=await page.evaluate(async base64=>{const image=new Image();image.src='data:application/octet-stream;base64,'+base64;await image.decode();if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)return null;const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);return {width:c.width,height:c.height,pixels:c.toDataURL('image/png')};},bytes.toString('base64')).catch(()=>null);
 return data?{count:1,width:data.width,height:data.height,hash:createHash('sha256').update(data.pixels).digest('hex')}:null;
}
/** Caller must already have verified the unique public channel URL before creating its TEST draft. */
export async function captureWhatsAppOwnedDraft({page,config,caption,hasImage,ownership={},verifyContext=async()=>{}}){
 const expected=config?.platforms?.whatsapp;
 if(!validOrigin(page)||ownership.mode!=='TEST'||!sources.has(ownership.source)||ownership.submitted||!expected?.channelName||whatsappChannelUrl(ownership.channelUrl)!==whatsappChannelUrl(expected.channelUrl)||ownership.channelName!==expected.channelName)return null;
 await verifyContext();
 const editor=hasImage?media(page):composer(page),heading=pane(page).getByTestId('conversation-info-header-chat-title');
 if(await pane(page).count()!==1||await heading.count()!==1||canonical(await heading.innerText())!==expected.channelName||await editor.count()!==1||!await editor.isVisible()||canonical(await readCaption(editor))!==canonical(caption))return null;
 const imageProof=await imageEvidence(page,hasImage);if(!imageProof||ownership.source==='prior_failed_test'&&!ownership.expectedImageProof||ownership.expectedImageProof&&!sameImage(imageProof,ownership.expectedImageProof))return null;
 const pageToken='__studioWhatsAppOwnedDraft_'+randomUUID().replaceAll('-','');
 const proof={mode:'TEST',source:ownership.source,runId:String(ownership.runId||''),itemId:'whatsapp',channelName:expected.channelName,channelUrl:whatsappChannelUrl(expected.channelUrl),caption:canonical(caption),hasImage:Boolean(hasImage),imageProof,pageToken};
 await page.evaluate(({proof})=>{const pane=document.querySelector('[data-testid="conversation-panel-wrapper"]'),title=pane.querySelector('[data-testid="conversation-info-header-chat-title"]'),editor=document.querySelector(proof.hasImage?'[data-testid="media-caption-input-container"]':'[data-testid="conversation-compose-box-input"]');const state={pane,title,editor,proof,dirty:false,editing:false};state.input=event=>{if(event.isTrusted&&!state.editing&&(editor.contains(event.target)||event.target===editor||pane.querySelector('[data-testid="conversation-compose-box-input"]')?.contains(event.target)))state.dirty=true;};state.click=event=>{const target=event.target instanceof Element?event.target:event.target?.parentElement,button=target?.closest('button,[role="button"]'),label=button?.getAttribute('aria-label')||button?.textContent?.trim()||'';if(/^(Chats|Calls|Status|Channels|Communities|You)$/.test(label)||!pane.contains(target)&&target?.closest('[data-testid="cell-frame-container"],[role="row"]'))state.dirty=true;};state.observer=new MutationObserver(()=>state.dirty=true);state.observer.observe(title,{childList:true,subtree:true,characterData:true});document.addEventListener('beforeinput',state.input,true);document.addEventListener('input',state.input,true);document.addEventListener('click',state.click,true);window[proof.pageToken]=state;},{proof});
 return proof;
}
export async function releaseWhatsAppOwnedDraft(page,ownership){
 if(!ownership?.pageToken||!/^__studioWhatsAppOwnedDraft_[a-f0-9]{32}$/.test(ownership.pageToken))return;
 await page.evaluate(key=>{const state=window[key];if(!state)return;state.observer?.disconnect();document.removeEventListener('beforeinput',state.input,true);document.removeEventListener('input',state.input,true);document.removeEventListener('click',state.click,true);delete window[key];},ownership.pageToken).catch(()=>{});
}
async function validateOwnership({page,config,ownership,verifyContext,afterDiscard=false}){
 const expected=config?.platforms?.whatsapp;
 if(!validOrigin(page)||!ownership||ownership.mode!=='TEST'||!sources.has(ownership.source)||ownership.itemId!=='whatsapp'||ownership.submitted||ownership.channelName!==expected?.channelName||ownership.channelUrl!==whatsappChannelUrl(expected?.channelUrl)||!/^__studioWhatsAppOwnedDraft_[a-f0-9]{32}$/.test(ownership.pageToken||''))return false;
 await verifyContext();
 const valid=await page.evaluate(({ownership,afterDiscard})=>{const s=window[ownership.pageToken];return !!s&&!s.dirty&&s.proof.pageToken===ownership.pageToken&&JSON.stringify(s.proof)===JSON.stringify(ownership)&&s.pane.isConnected&&s.title.isConnected&&s.pane===document.querySelector('[data-testid="conversation-panel-wrapper"]')&&s.title.textContent.trim()===ownership.channelName&&(afterDiscard||s.editor.isConnected&&s.editor===document.querySelector(ownership.hasImage?'[data-testid="media-caption-input-container"]':'[data-testid="conversation-compose-box-input"]'));},{ownership,afterDiscard}).catch(()=>false);
 if(!valid)return false;
 const editor=afterDiscard?composer(page):ownership.hasImage?media(page):composer(page);
 if(await editor.count()!==1||(!afterDiscard&&!await editor.isVisible()))return false;
 const current=canonical(await readCaption(editor));
 if(afterDiscard)return !current||current===ownership.caption;
 if(current!==ownership.caption)return false;
 return sameImage(await imageEvidence(page,ownership.hasImage),ownership.imageProof);
}
/** Only a nested leaf confirmation owned by this TEST draft is exposed to Gemini. */
export async function collectWhatsAppDiscardControl(page){
 return page.evaluate(()=>{const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.closest('[hidden],[inert],[aria-hidden="true"]');};const dialogs=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]')].filter(visible).filter(e=>!(e.getAttribute('aria-modal')!=='true'&&e.children.length===1&&e.firstElementChild?.getAttribute('data-testid')==='conversation-subheader'));const leaves=dialogs.filter(e=>!dialogs.some(other=>other!==e&&e.contains(other)));if(leaves.length!==1)return null;const dialog=leaves[0],copy=dialog.cloneNode(true);copy.querySelectorAll('button,[role=\"button\"]').forEach(b=>b.remove());if(copy.textContent.replace(/\s+/g,' ').trim()!=='Discard selection?')return null;const buttons=[...dialog.querySelectorAll('button,[role="button"]')].filter(visible),discard=buttons.filter(b=>(b.getAttribute('aria-label')||b.textContent).trim()==='Discard'),cancel=buttons.filter(b=>(b.getAttribute('aria-label')||b.textContent).trim()==='Cancel');if(buttons.length!==2||discard.length!==1||cancel.length!==1||discard[0].disabled||discard[0].getAttribute('aria-disabled')==='true')return null;return {id:'c1',label:'Discard',role:'button',enabled:true,scrollable:false};});
}
async function clickObservedDiscard(page){
 const handle=await page.evaluateHandle(()=>{const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.closest('[hidden],[inert],[aria-hidden="true"]');};const dialogs=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]')].filter(visible).filter(e=>!(e.getAttribute('aria-modal')!=='true'&&e.children.length===1&&e.firstElementChild?.getAttribute('data-testid')==='conversation-subheader')),leaves=dialogs.filter(e=>!dialogs.some(other=>other!==e&&e.contains(other)));if(leaves.length!==1)return null;const buttons=[...leaves[0].querySelectorAll('button,[role="button"]')].filter(visible).filter(b=>(b.getAttribute('aria-label')||b.textContent).trim()==='Discard');return buttons.length===1?buttons[0]:null;});
 try{const button=handle.asElement();if(!button)throw new Error('The discard control changed.');await button.click({timeout:3000});}finally{await handle.dispose();}
}
export async function recoverWhatsAppOwnedDraft({page,config,ownership,signal,ai,step=async()=>{},reportRecovery=async()=>{},verifyContext=async()=>{},editContext=operation=>operation(),problem='WhatsApp could not close its rehearsal media draft.'}={}){
 const trace=[];let actions=0;const emit=async event=>{const safe={platform:'whatsapp',stage:'discard_owned_draft',...event};trace.push(safe);await reportRecovery(safe);if(safe.message)await step(safe.message);};
 const finish=async(completed,reason)=>{const detail={ownership_unconfirmed:'The TEST draft ownership could not be confirmed.',no_owned_discard_dialog:'No unambiguous owned Discard confirmation is available.',model_unavailable:'Gemini is unavailable or its response could not be safely used.',model_uncertain:'Gemini could not choose a safe fix.',draft_changed:'The channel or draft changed during recovery.',discard_unconfirmed:'The Discard action could not be confirmed.',text_cleanup_unconfirmed:'The remaining draft text could not be safely cleared.'}[reason]||'The recovery could not be confirmed.';if(!completed)await emit({phase:'paused',problem,message:detail+' Review the remaining draft. Nothing was sent.',reason});return {completed,reason,actions,trace};};
 abort(signal);
 if(!page||typeof ai?.plan!=='function'||!await validateOwnership({page,config,ownership,verifyContext}))return finish(false,'ownership_unconfirmed');
 const control=await collectWhatsAppDiscardControl(page);if(!control)return finish(false,'no_owned_discard_dialog');
 await emit({phase:'detected',problem,message:'WhatsApp rehearsal cleanup is blocked by a discard confirmation.'});
 abort(signal);
 let planned;try{planned=await planNavigation(ai,{platform:'whatsapp',stage:'discard_owned_draft',controls:[control],capabilities:{discardOwnedDraft:true},signal,onEvent:event=>emit({...event,problem})},{deadline:Date.now()+60000,step});}catch{abort(signal);return finish(false,'model_unavailable');}
 abort(signal);const action=planned?.action;
 if(!action||action.type!=='click'||action.controlId!=='c1'||Object.keys(action).sort().join(',')!=='controlId,type')return finish(false,action?.type==='stop'?'model_uncertain':'model_unavailable');
 const fix=typeof planned.fix==='string'&&planned.fix.trim()?planned.fix.trim().slice(0,400):'Discard only the unchanged app-owned TEST media selection, then clear its copied-back rehearsal caption.';
 if(!trace.some(event=>event.phase==='proposed'))await emit({phase:'proposed',problem,fix,message:fix,model:planned.model});abort(signal);
 if(!await validateOwnership({page,config,ownership,verifyContext})||!await collectWhatsAppDiscardControl(page))return finish(false,'draft_changed');
 await emit({phase:'executing',problem,fix,action:'Click Discard',message:'Trying Gemini’s fix: discarding the owned TEST selection.'});abort(signal);
 if(!await validateOwnership({page,config,ownership,verifyContext})||!await collectWhatsAppDiscardControl(page))return finish(false,'draft_changed');
 actions++;await clickObservedDiscard(page);
 await emit({phase:'verifying',problem,fix,action:'Check channel and clear only matching rehearsal text',message:'Checking that the media selection closed and the verified channel stayed unchanged.'});abort(signal);
 try{await media(page).waitFor({state:'hidden',timeout:3000});}catch{return finish(false,'discard_unconfirmed');}
 if(!await validateOwnership({page,config,ownership,verifyContext,afterDiscard:true}))return finish(false,'draft_changed');
 const editor=composer(page),current=canonical(await readCaption(editor));
 if(current){await page.evaluate(key=>{window[key].editing=true;},ownership.pageToken);try{await editContext(async()=>{abort(signal);await editor.click();await editor.press(process.platform==='darwin'?'Meta+A':'Control+A');await editor.press('Backspace');});}finally{await page.evaluate(key=>{if(window[key])window[key].editing=false;},ownership.pageToken).catch(()=>{});}}
 if(!await validateOwnership({page,config,ownership,verifyContext,afterDiscard:true})||canonical(await readCaption(editor)))return finish(false,'text_cleanup_unconfirmed');
 await releaseWhatsAppOwnedDraft(page,ownership);
 await emit({phase:'succeeded',problem,fix,message:'Gemini recovery succeeded. The app-owned TEST draft is cleared; nothing was sent.'});return {completed:true,reason:'owned_draft_cleared',actions,trace};
}
