// Copyright (c) 2026 Mrinal. Isolated Gemini practice; no social page or publication controls.
import {randomUUID} from 'node:crypto';
import {planNavigation} from './ai-plan-wait.js';

const problem='Practice: nested confirmation blocks the owned TEST draft.';
const fallbackFix='Discard the verified unsent practice draft to reopen the preview.';
const control={id:'c1',label:'Discard',role:'button',enabled:true,scrollable:false};
const abort=signal=>signal?.throwIfAborted();
const blank=page=>page?.url()==='about:blank';
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Social Studio · Gemini recovery practice</title><style>
:root{font-family:system-ui,sans-serif;color:#edf3f8;background:#10161d;color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:40px}main{max-width:760px;margin:auto;border:1px solid #344255;border-radius:24px;padding:32px;background:#1a222e}h1{font-size:24px}p{color:#b5c2d2;line-height:1.6}.chip{display:inline-block;padding:6px 10px;border-radius:10px;background:#164a3d;color:#94e9c5;font-size:12px;font-weight:700}textarea{width:100%;min-height:100px;border:1px solid #485971;border-radius:12px;padding:14px;background:#111a23;color:inherit;font:inherit}button{font:inherit;border:1px solid #596b83;border-radius:12px;padding:12px 22px;color:inherit;background:#263951;cursor:pointer}button:disabled{opacity:.5}output{display:block;margin:24px 0;padding:16px;border:1px solid #43556d;border-radius:12px}#practice-fault{position:fixed;inset:0;background:#0009;display:grid;place-items:center}#practice-fault[hidden]{display:none!important}#practice-leaf{padding:28px;border-radius:20px;background:#f7f9fc;color:#142237;min-width:300px;box-shadow:0 16px 80px #0008}#practice-leaf h2{font-size:20px;margin-top:0}#practice-leaf button{display:block;width:100%;margin-top:12px;background:#fff;color:#142237;border-color:#aab8c8}#practice-discard{color:#bf2750!important}
</style></head><body><main id="studio-recovery-practice"><span class="chip">ISOLATED TEST</span><h1>Watch Gemini resolve a blocked draft</h1><p>This is a local practice page. It has no publishing controls or external connections. Only this disposable draft can be cleared.</p><label for="practice-draft">Disposable practice draft</label><textarea id="practice-draft"></textarea><output id="practice-result">Preparing the practice blocker…</output><button id="introduce-fault" type="button">Introduce blocker</button><p>Social accounts, uploaded images and real drafts stay untouched.</p></main><section id="practice-fault" hidden><div id="practice-outer" role="dialog" aria-modal="true"><div id="practice-leaf" role="dialog" aria-label="Discard selection?"><h2>Discard selection?</h2><button id="practice-discard" type="button">Discard</button><button id="practice-cancel" type="button">Cancel</button></div></div></section></body></html>`;

async function proof(page,nonce,sentinel,{afterDiscard=false,afterClear=false}={}){
 if(!blank(page))return false;
 return page.evaluate(({nonce,sentinel,afterDiscard,afterClear})=>{
  const s=window.__studioRecoveryPractice;
  if(!s||s.nonce!==nonce||s.dirty||s.root!==document.querySelector('#studio-recovery-practice')||s.root.dataset.nonce!==nonce||s.editor!==document.querySelector('#practice-draft')||!s.editor.isConnected||s.revision!==1||s.discard!==document.querySelector('#practice-discard')||s.fault!==document.querySelector('#practice-fault')||s.leaf!==document.querySelector('#practice-leaf'))return false;
  if(afterClear)return s.phase==='complete'&&s.discarded===1&&s.fault.hidden&&s.editor.value==='';
  if(afterDiscard)return s.phase==='discarded'&&s.discarded===1&&s.fault.hidden&&s.editor.value===sentinel;
  if(s.phase!=='blocked'||s.discarded!==0||s.fault.hidden||s.editor.value!==sentinel||s.discard.disabled||s.discard.getAttribute('aria-disabled')==='true')return false;
  const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(e=>!e.closest('[hidden]'));
  const leaves=dialogs.filter(e=>!dialogs.some(other=>other!==e&&e.contains(other)));
  const buttons=[...s.leaf.querySelectorAll('button')];
  return dialogs.length===2&&leaves.length===1&&leaves[0]===s.leaf&&s.leaf.querySelector('h2')?.textContent==='Discard selection?'&&buttons.length===2&&buttons[0]===s.discard&&buttons[0].textContent==='Discard'&&buttons[1]===s.cancel&&buttons[1].textContent==='Cancel';
 },{nonce,sentinel,afterDiscard,afterClear}).catch(()=>false);
}
async function withAbort(operation,signal){
 abort(signal);
 let stop;const stopped=new Promise((_,reject)=>{stop=()=>reject(signal.reason||new Error('Recovery practice stopped'));signal.addEventListener('abort',stop,{once:true});});
 try{return await Promise.race([Promise.resolve().then(operation),stopped]);}finally{signal.removeEventListener('abort',stop);}
}

export async function runRecoveryPractice({page,ai,signal,reportRecovery=async()=>{},step=async()=>{}}={}){
 const trace=[];let actions=0,strictModeObserved=false;
 const deadline=Date.now()+60000,timeout=AbortSignal.timeout(60000),activeSignal=signal?AbortSignal.any([signal,timeout]):timeout;
 const emit=async event=>{abort(activeSignal);const value={platform:'whatsapp',stage:'discard_owned_draft',problem,...event};trace.push(value);await reportRecovery(value);if(value.message)await step(value.message);abort(activeSignal);};
 const finish=async(completed,reason,message)=>{if(!completed)await emit({phase:'paused',reason,message:message||'Practice recovery paused. No real draft was changed.'});return {completed,reason,actions,trace,strictModeObserved,problem};};
 abort(activeSignal);
 if(!blank(page))return finish(false,'foreign_page','Practice requires its own blank page. No page was changed.');
 if(typeof ai?.plan!=='function')return finish(false,'model_unavailable','Enable Gemini automatic recovery to run this practice.');
 const nonce=randomUUID(),sentinel='STUDIO PRACTICE ONLY — disposable unsent draft '+nonce;
 await page.setContent(html,{waitUntil:'domcontentloaded',timeout:5000});abort(activeSignal);
 if(!blank(page))return finish(false,'foreign_page');
 await page.evaluate(({nonce,sentinel})=>{
  const root=document.querySelector('#studio-recovery-practice'),editor=document.querySelector('#practice-draft'),fault=document.querySelector('#practice-fault'),leaf=document.querySelector('#practice-leaf'),discard=document.querySelector('#practice-discard'),cancel=document.querySelector('#practice-cancel'),result=document.querySelector('#practice-result');
  const s={nonce,root,editor,fault,leaf,discard,cancel,result,phase:'ready',revision:0,discarded:0,dirty:false};window.__studioRecoveryPractice=s;root.dataset.nonce=nonce;editor.value=sentinel;
  editor.addEventListener('input',()=>s.dirty=true);
  document.querySelector('#introduce-fault').addEventListener('click',()=>{s.revision++;s.editor.value=sentinel;s.fault.hidden=false;s.phase='blocked';s.discarded=0;s.result.textContent='Problem introduced: a nested discard dialog blocks the preview.';});
  discard.addEventListener('click',()=>{if(s.phase!=='blocked')return;s.discarded++;s.phase='discarded';s.fault.hidden=true;s.result.textContent='Discard accepted. Checking the owned draft cleanup…';});
  cancel.addEventListener('click',()=>{s.phase='cancelled';s.fault.hidden=true;s.result.textContent='Practice cancelled; the disposable draft is preserved.';});
 },{nonce,sentinel});
 await page.locator('#introduce-fault').click({timeout:3000});abort(activeSignal);
 if(!await proof(page,nonce,sentinel))return finish(false,'fixture_changed');
 try{await page.getByRole('dialog').filter({hasText:'Discard selection?'}).waitFor({state:'visible',timeout:500});}
 catch(error){if(/strict mode violation/i.test(error.message))strictModeObserved=true;else throw error;}
 if(!strictModeObserved)return finish(false,'blocker_not_reproduced');
 await emit({phase:'detected',message:problem});
 let planned,proposed=false;
 const onEvent=async event=>{if(event.phase==='proposed')proposed=true;await emit(event);};
 try{
  planned=await withAbort(()=>planNavigation(ai,{platform:'whatsapp',stage:'discard_owned_draft',capabilities:{discardOwnedDraft:true},controls:[{...control}],signal:activeSignal,onEvent},{deadline,step}),activeSignal);
 }catch(error){
  if(signal?.aborted)throw signal.reason||error;
  if(timeout.aborted){await reportRecovery({platform:'whatsapp',stage:'discard_owned_draft',problem,phase:'paused',reason:'timed_out',message:'Practice recovery reached its time limit. No real draft was changed.'});return {completed:false,reason:'timed_out',actions,trace,strictModeObserved,problem};}
  return finish(false,'model_unavailable','Gemini could not finish the practice fix. No real draft was changed.');
 }
 abort(activeSignal);
 const action=planned?.action;
 if(!action||action.type!=='click'||action.controlId!=='c1'||Object.keys(action).sort().join(',')!=='controlId,type')return finish(false,action?.type==='stop'?'model_uncertain':'model_unavailable',ai.state?.().message||'Gemini paused this practice instead of choosing a safe fix.');
 const fix=typeof planned.fix==='string'&&planned.fix.trim()?planned.fix:fallbackFix;
 if(!proposed)await emit({phase:'proposed',fix,model:planned.model,action,message:fix});
 if(!await proof(page,nonce,sentinel))return finish(false,'fixture_changed','The practice draft changed while Gemini was checking it. No action was taken.');
 const handle=await page.evaluateHandle(()=>window.__studioRecoveryPractice.discard);
 try{
  const button=handle.asElement();if(!button)return finish(false,'fixture_changed');
  await emit({phase:'executing',fix,model:planned.model,action:'Click Discard',message:'Trying Gemini’s fix: click the exact practice Discard button.'});
  if(!await proof(page,nonce,sentinel))return finish(false,'fixture_changed');
  actions++;await button.click({timeout:3000});
 }finally{await handle.dispose();}
 await emit({phase:'verifying',fix,model:planned.model,message:'Checking the nested dialog closed and clearing only its matching practice text.'});
 if(!await proof(page,nonce,sentinel,{afterDiscard:true}))return finish(false,'discard_unconfirmed');
 await page.evaluate(({nonce,sentinel})=>{const s=window.__studioRecoveryPractice;if(s?.nonce!==nonce||s.phase!=='discarded'||s.editor.value!==sentinel)throw new Error('Practice draft changed');s.editor.value='';s.phase='complete';s.result.textContent='Recovered: the nested dialog is closed and the disposable draft is empty. Nothing was published.';},{nonce,sentinel});
 if(!await proof(page,nonce,sentinel,{afterClear:true}))return finish(false,'cleanup_unconfirmed');
 await emit({phase:'succeeded',fix,model:planned.model,message:'Gemini practice succeeded: the blocker and disposable draft are cleared. Nothing was published.'});
 return {completed:true,reason:'practice_draft_cleared',actions,trace,strictModeObserved,problem};
}
