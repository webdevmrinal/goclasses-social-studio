// Copyright (c) 2026 Mrinal. All Telegram requests intercepted; no messages reach Telegram.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { defaults } from '../server/config.js';
import { prepareTelegram, checkTelegramLogin, telegramRecords, confirmTelegramPublication } from '../server/automation/telegram.js';
import { readCaption } from '../server/automation/utils.js';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-tg-fixture-'));
const files=await Promise.all(['#ddeeff','#bbddcc','#eeccaa'].map(async (background,i)=>{const file=path.join(dir,i+'.png');await sharp({create:{width:80+i*10,height:80,channels:3,background}}).png().toFile(file);return file;}));
const caption='GO Classes ✅\n\nनमस्ते • Test text\nhttps://www.goclasses.in/';
const config=structuredClone(defaults),expected=config.platforms.telegram,peerId='-1566225794';
function fixture(options={}) {
 return '<!doctype html><meta charset="utf-8"><style>[hidden]{display:none!important}body{font:14px sans-serif}#column-center{margin:20px 240px;width:600px}.topbar{height:60px}button{padding:10px}[contenteditable]{min-height:50px;white-space:pre-wrap}.popup{position:fixed;inset:60px 200px;background:white;border:1px solid black;padding:20px}.popup-item-media{display:inline-block}.popup img{width:80px;height:80px}.profile-container{position:fixed;right:0;top:0;background:white;width:200px}#bubble-contextmenu{position:fixed;top:20px;right:0;background:white}.reply-wrapper{height:0}</style>' +
 '<aside id="column-left">PRIVATE_CHAT_SENTINEL<div data-peer-id="123">Private conversation</div></aside><div id="auth-flow-root" hidden><h1>Log in by QR Code</h1></div><div id="page-chats"><div id="column-center"><div class="chat active"><div class="topbar"><div class="chat-info" role="button"><div class="user-title"><span class="peer-title" data-peer-id="'+peerId+'">'+(options.name||expected.channelName)+'</span></div></div></div><div class="history"><div class="bubble channel-post" data-peer-id="'+peerId+'" data-mid="4294972000" data-timestamp="100"><div class="message">Old post<span class="time"><span class="time-inner" title="Old post"></span></span></div></div></div><div class="chat-input-main"><div class="reply-wrapper"><span class="reply-icon"><span class="tgico"></span></span></div><div class="rows-wrapper-wrapper"><div role="textbox" contenteditable="'+(!options.readonly)+'" data-chat-input-editor="tiptap" data-peer-id="'+peerId+'" aria-labelledby="broadcast"><div data-chat-input-paragraph>'+ (options.draft||'<br class="ProseMirror-trailingBreak">') +'</div></div><span id="broadcast">'+(options.personal?'Message':'Broadcast')+'</span><button aria-label="Attach">Attach</button><button class="btn-send" aria-label="Send">Send</button><input id="upload" type="file" multiple hidden></div></div></div></div></div>' +
 '<div id="column-right"><div class="profile-container active" hidden><div class="sidebar-header"><span class="sidebar-header__title">'+(options.group?'Group Info':'Channel Info')+'</span><button aria-label="Close">Close</button></div><div class="profile-name"><span class="peer-title" data-peer-id="'+peerId+'">GO Classes</span></div><div class="row"><div class="row-title">'+(options.link||'t.me/goclasses_cse')+'</div><div class="row-subtitle"><span>Link</span></div></div></div></div><div class="btn-menu active" role="menu" hidden><button role="menuitem">Photo or Video</button></div>' +
 '<script>const options='+JSON.stringify(options)+';const $=s=>document.querySelector(s);window.stats={sends:0,chooser:0,sequence:[],contextMids:[]};const main=$(".chat-input-main [contenteditable]");window.text=e=>[...e.children].map(p=>p.textContent).join("\\n");function setText(e,value){e.replaceChildren(...value.split("\\n").map(t=>{const p=document.createElement("div");p.dataset.chatInputParagraph="";p.textContent=t;return p;}));}document.addEventListener("paste",e=>{if(!e.target.matches("[contenteditable]"))return;e.preventDefault();setText(e.target,e.clipboardData.getData("text/plain"));e.target.dispatchEvent(new InputEvent("input",{bubbles:true}));if(e.target===main&&text(main).includes("https")){$(".chat").classList.add("is-helper-active");}});main.addEventListener("input",()=>{if(!text(main))$(".chat").classList.remove("is-helper-active");});' +
 '$(".chat-info").onclick=()=>$(".profile-container").hidden=false;$(".profile-container button").onclick=()=>$(".profile-container").hidden=true;$(".chat-input-main [aria-label=Attach]").onclick=()=>$(".btn-menu").hidden=false;$(".btn-menu [role=menuitem]").onclick=()=>{$("#upload").click();stats.chooser++};$("#upload").onchange=async e=>{ $(".btn-menu").hidden=true;const popup=document.createElement("div");popup.className="popup popup-send-photo active";popup.innerHTML=`<div role="dialog"><button aria-label="Close">Close</button><div class="popup-photo"><div class="popup-item-album"></div></div><div role="textbox" contenteditable="true" data-chat-input-editor="tiptap"><div data-chat-input-paragraph><br class="ProseMirror-trailingBreak"></div></div><button class="simple-message-input-confirm" aria-label="Send">Send</button></div>`;for(const file of e.target.files){const div=document.createElement("div");div.className="popup-item-media";const img=new Image();img.src=URL.createObjectURL(file);if(options.reencode){await img.decode();const c=document.createElement("canvas");c.width=options.resize?Math.round(img.naturalWidth/2):img.naturalWidth;c.height=options.resize?Math.round(img.naturalHeight/2):img.naturalHeight;c.getContext("2d").drawImage(img,0,0,c.width,c.height);img.src=URL.createObjectURL(await new Promise(resolve=>c.toBlob(resolve,"image/jpeg",.9)));}div.append(img);popup.querySelector(".popup-item-album").append(div);}document.body.append(popup);popup.querySelector("[aria-label=Close]").onclick=()=>{if(options.copyCaption)setText(main,text(popup.querySelector("[contenteditable]")));popup.remove();};popup.querySelector("[aria-label=Send]").onclick=()=>send(popup);};' +
 'function send(popup){stats.sends++;stats.sequence.push("send");const box=popup?popup.querySelector("[contenteditable]"):main,value=text(box),count=popup?popup.querySelectorAll(".popup-item-media").length:0;popup?.remove();setText(main,"");$(".chat").classList.remove("is-helper-active");if(options.noAck)return;setTimeout(()=>{for(let i=0;i<(options.duplicate?2:1);i++){const bubble=document.createElement("div");bubble.className="bubble channel-post"+(count?" photo":"")+(options.pending?" is-sending":"");bubble.dataset.peerId="'+peerId+'";bubble.dataset.mid=options.provisionalAckDelay||options.provisionalOnly?String(4294972400+i-1)+".0001":String(4294972400+i);bubble.dataset.timestamp=Math.floor(Date.now()/1000);const body=document.createElement("div");body.className="message";body.textContent=value;body.innerHTML+=`<span class="time"><span class="time-inner" title="Native timestamp"></span></span>`;if(count>1)for(let n=0;n<count;n++){const media=document.createElement("div");media.className="album-item";media.dataset.mid=String(4294972400+n);bubble.append(media);}bubble.append(body);$(".history").append(bubble);if(options.provisionalAckDelay&&!options.provisionalOnly)setTimeout(()=>{bubble.dataset.mid=String(4294972400+i);stats.sequence.push("ack");},options.provisionalAckDelay);}},options.ackDelay||0);};$(".btn-send").onclick=()=>send(null);' +
 'document.addEventListener("contextmenu",e=>{const bubble=e.target.closest(".bubble");if(!bubble)return;e.preventDefault();$("#bubble-contextmenu")?.remove();const menu=document.createElement("div");menu.id="bubble-contextmenu";menu.className="btn-menu active";stats.contextMids.push(bubble.dataset.mid);const acknowledged=/^[1-9][0-9]*$/.test(bubble.dataset.mid);menu.innerHTML=acknowledged?`<div class="btn-menu-item" role="menuitem"><span class="tgico btn-menu-item-icon" aria-hidden="true">&#xE9BB;</span><span class="i18n btn-menu-item-text">Copy Message Link</span></div>`:`<div role="menuitem">Copy</div><div role="menuitem">Translate</div>`;if(acknowledged)menu.onclick=async()=>{await navigator.clipboard.writeText(options.badPermalink?"https://t.me/another_channel/5017":"https://t.me/goclasses_cse/5104");menu.remove();};document.body.append(menu);});' +
 'if(options.delay){$("#page-chats").hidden=true;setTimeout(()=>$("#page-chats").hidden=false,options.delay);}if(options.login){$("#page-chats").hidden=true;$("#auth-flow-root").hidden=false;}if(options.reply){$(".chat").classList.add("is-helper-active");$(".reply-icon .tgico").textContent="reply";}</script>';
}
const browser=await chromium.launch({headless:true});let pages=0;
async function pageFor(options) {
 const context=await browser.newContext(),page=await context.newPage();await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:fixture(options)}));await page.goto('https://web.telegram.org/k/#@goclasses_cse');pages++;return {page,context};
}
async function run(options={},overrides={}) {
 const {page,context}=await pageFor(options),snapshots=[];
 try {
  const result=await prepareTelegram({page,config,files:[],caption,mode:'TEST',step:async()=>{},snapshot:async(label,target)=>{snapshots.push(label);assert(target!==page);assert(!(await target.innerText()).includes('PRIVATE_CHAT_SENTINEL'));if(label==='ready-to-publish') {assert.equal(await page.evaluate(()=>stats.sends),0);await target.getByRole('button',{name:'Send',exact:true}).click();await target.locator('[contenteditable]').press('Enter');assert.equal(await page.evaluate(()=>stats.sends),0);}},markSubmitting:async()=>{throw Error('TEST cannot mark submission')},...overrides});
  return {result,stats:await page.evaluate(()=>stats),text:await readCaption(page.locator('.chat-input-main [contenteditable]')),popup:await page.locator('.popup.active').count(),snapshots};
 } finally {await context.close();}
}
try {
 for(const options of [{login:true},{link:'t.me/another_channel'},{name:'Wrong'},{group:true},{personal:true},{readonly:true},{reply:true}]) {
  const {page,context}=await pageFor(options);const checked=await checkTelegramLogin({page,config,readyTimeout:1000});
  assert.notEqual(checked.status,'verified',JSON.stringify(options));if(options.login)assert.equal(checked.status,'needs_login');assert.equal(await page.evaluate(()=>stats.sends),0);await context.close();
 }
 const delayed=await pageFor({delay:100});assert.equal((await checkTelegramLogin({page:delayed.page,config,readyTimeout:2000})).status,'verified');await delayed.context.close();
 for(const chosen of [[],files.slice(0,1),files]) {
  const tested=await run({copyCaption:true},{files:chosen});assert.equal(tested.result.status,'dry_run');assert.equal(tested.stats.sends,0);assert.equal(tested.text,'');assert.equal(tested.popup,0);
 }
 for(const chosen of [files.slice(0,1),files])for(const resize of [false,true]){const tested=await run({copyCaption:true,reencode:true,resize},{files:chosen});assert.equal(tested.result.status,'dry_run');assert.equal(tested.stats.sends,0);assert.equal(tested.popup,0);}
 await assert.rejects(run({draft:'Human draft'}),/unsent draft/);
 let changedPreserved=false;{
  const {page,context}=await pageFor({});
  await assert.rejects(prepareTelegram({page,config,files:[],caption,mode:'TEST',step:async()=>{},snapshot:async label=>{if(label==='ready-to-publish')await page.locator('.chat-input-main [contenteditable]').evaluate(el=>{el.textContent='Human changed this';el.dispatchEvent(new InputEvent('input',{bubbles:true}));});}}),/draft changed/);
  changedPreserved=await page.locator('.chat-input-main [contenteditable]').textContent()==='Human changed this';assert.equal(await page.evaluate(()=>stats.sends),0);await context.close();
 }assert(changedPreserved);
 {
  const {page,context}=await pageFor({});
  await assert.rejects(prepareTelegram({page,config,files,caption,mode:'TEST',step:async()=>{},snapshot:async label=>{if(label==='ready-to-publish')await page.locator('.popup-photo img').evaluateAll(imgs=>{const a=imgs[0].src;imgs[0].src=imgs[1].src;imgs[1].src=a;});}}),/image count, content or order/);
  assert.equal(await page.evaluate(()=>stats.sends),0);assert.equal(await page.locator('.popup.active').count(),1,'Human-changed media selection is preserved');await context.close();
 }
 for(const change of ['navigate','expire']) {
  const {page,context}=await pageFor({});
  await assert.rejects(prepareTelegram({page,config,files:[],caption,mode:'TEST',step:async()=>{},snapshot:async label=>{if(label==='ready-to-publish')await page.evaluate(change=>{if(change==='navigate'){document.querySelector('.topbar .peer-title').dataset.peerId='-99999';document.querySelector('.chat-input-main [contenteditable]').textContent='Human destination draft';}else document.querySelector('#auth-flow-root').hidden=false;},change);}}),/draft changed|Sign in/);
  assert.equal(await page.evaluate(()=>stats.sends),0);
  if(change==='navigate')assert.equal(await page.locator('.chat-input-main [contenteditable]').textContent(),'Human destination draft');
  await context.close();
 }
 for(const chosen of [[],files]) {
  const {page,context}=await pageFor({ackDelay:70});const result=await prepareTelegram({page,config,files:chosen,caption,mode:'LIVE',confirmedLive:true,confirmationTimeout:2500,step:async()=>{},snapshot:async()=>{},markSubmitting:()=>page.evaluate(()=>stats.sequence.push('intent'))});
  assert.equal(result.status,'posted');assert.equal(result.publication.postUrl,'https://t.me/goclasses_cse/5104');assert.equal(await page.evaluate(()=>stats.sends),1);assert.deepEqual(await page.evaluate(()=>stats.sequence),['intent','send']);await context.close();
 }
 {
  const {page,context}=await pageFor({});
  await page.locator('#column-center .chat.active .history').evaluate((history,peer)=>{
   for(const mid of ['0','-1','1e3','4294972399.0001','9007199254740993','4294972400']){
    const bubble=document.createElement('div');bubble.className='bubble channel-post photo';bubble.dataset.peerId=peer;bubble.dataset.mid=mid;bubble.dataset.timestamp=Math.floor(Date.now()/1000);
    bubble.innerHTML='<div class="message">Observed post<span class="time"><span class="time-inner" title="Native timestamp"></span></span></div>';history.append(bubble);
   }
  },peerId);
  const records=await telegramRecords(page,peerId);
  for(const mid of ['0','-1','1e3','4294972399.0001','9007199254740993'])assert.equal(records.find(record=>record.mid===mid).native,false,mid);
  assert.equal(records.find(record=>record.mid==='4294972400').native,true);assert.equal(await page.evaluate(()=>stats.sends),0);await context.close();
 }
 // Real Web K first renders a fractional optimistic ID with a timestamp and
 // no pending class. Its menu has no permalink until the server remaps the ID.
 {
  const {page,context}=await pageFor({provisionalAckDelay:1400});page.setDefaultTimeout(1000);
  const result=await prepareTelegram({page,config,files:files.slice(0,1),caption,mode:'LIVE',confirmedLive:true,confirmationTimeout:5000,step:async()=>{},snapshot:async()=>{},markSubmitting:()=>page.evaluate(()=>stats.sequence.push('intent'))});
  const stats=await page.evaluate(()=>window.stats);
  assert.equal(result.status,'posted');assert.equal(result.publication.nativeMessageId,'4294972400');
  assert.equal(result.publication.postUrl,'https://t.me/goclasses_cse/5104');
  assert.equal(stats.sends,1);assert.deepEqual(stats.sequence,['intent','send','ack']);
  assert.deepEqual(stats.contextMids,['4294972400'],'Never open Copy Message Link on a provisional post');await context.close();
 }
 {
  const {page,context}=await pageFor({provisionalOnly:true});page.setDefaultTimeout(1000);
  await assert.rejects(prepareTelegram({page,config,files:files.slice(0,1),caption,mode:'LIVE',confirmedLive:true,confirmationTimeout:1400,step:async()=>{},snapshot:async()=>{},markSubmitting:async()=>{}}),/did not confirm/);
  const records=await telegramRecords(page,peerId),pending=records.find(record=>record.mid.includes('.'));
  assert(pending);assert.equal(pending.pending,false);assert.equal(pending.native,false);
  const stats=await page.evaluate(()=>window.stats);assert.equal(stats.sends,1);assert.deepEqual(stats.contextMids,[]);await context.close();
 }
 for(const options of [{noAck:true},{pending:true},{duplicate:true},{badPermalink:true}]) {
  const {page,context}=await pageFor(options);
  await assert.rejects(prepareTelegram({page,config,files:[],caption,mode:'LIVE',confirmedLive:true,confirmationTimeout:1200,step:async()=>{},snapshot:async()=>{},markSubmitting:async()=>{}}),/confirm|different channel/);
  assert.equal(await page.evaluate(()=>stats.sends),1);await context.close();
 }
 console.log('Telegram fixtures passed: '+pages+' scenarios; delayed/expired login, wrong channel/group/personal/read-only targets, drafts/replies, text/single photo/album TEST send blocking and cleanup, human edit preservation, image-order checks, exactly one LIVE fixture Send with persisted intent, native permalink acknowledgement and uncertain outcomes. All network requests were intercepted.');
} finally {await browser.close();}
