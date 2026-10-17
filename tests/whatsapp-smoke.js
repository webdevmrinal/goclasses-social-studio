// Copyright (c) 2026 Mrinal. Local intercepted fixtures only. No WhatsApp requests or real sends.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaults } from '../server/config.js';
import { prepareWhatsApp, checkWhatsAppLogin, waitForWhatsAppReady } from '../server/automation/whatsapp.js';
import { readCaption } from '../server/automation/utils.js';
import { Queue } from '../server/queue.js';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-wa-ui-')), file = path.join(dir, 'fixture.png');
await sharp({ create: { width: 80, height: 80, channels: 3, background: '#168b63' } }).png().toFile(file);
const config = structuredClone(defaults), caption = 'Fixture ✅\n\nहिन्दी channel update • https://example.com/';
function fixture(options) {
  return `<!doctype html><meta charset="utf-8"><style>[hidden]{display:none!important}body{font:14px sans-serif}button{padding:8px}#main{margin-left:220px;width:600px}header,footer{min-height:60px}#drawer{width:0;height:0}#list{position:absolute;top:40px;left:0;width:200px}#link{position:absolute;right:0;top:0;background:white;padding:15px}#preview{position:absolute;inset:70px 40px;background:white;border:1px solid #aaa;padding:20px}#preview img{width:80px;height:80px}#discard{position:fixed;z-index:20;top:25px;right:25px;background:white;border:1px solid #ccc;padding:20px}[contenteditable]{min-height:30px;white-space:pre-wrap}</style>
  <div id="qr" data-testid="qrcode" hidden><canvas></canvas><h1>Log into WhatsApp</h1></div>
  <div id="app"><nav><button aria-label="Channels" onclick="document.querySelector('#list').hidden=false">Channels</button><button aria-label="Chats" onclick="window.stats.navigation++">Chats</button></nav><aside>PERSONAL_CHAT_SENTINEL</aside>
  <div id="drawer" data-testid="newsletter-tab-drawer"><div id="list" hidden><input role="textbox" aria-label="Search"><div data-testid="cell-frame-title"><span onclick="selectChannel()">${config.platforms.whatsapp.channelName}</span></div>${options.duplicate ? `<div data-testid="cell-frame-title"><span>${config.platforms.whatsapp.channelName}</span></div>` : ''}</div></div>
  <div id="main" data-testid="conversation-panel-wrapper"><header data-testid="conversation-header"><span data-testid="conversation-info-header-chat-title">${config.platforms.whatsapp.channelName}</span><button aria-label="Share" onclick="document.querySelector('#link').hidden=false">Share</button></header>
  <div data-id="old"><span data-testid="selectable-text">Old channel update</span><span data-testid="msg-meta"><span data-testid="view-count">4</span></span></div>
  <footer><div role="textbox" data-testid="conversation-compose-box-input" data-lexical-editor="true" aria-placeholder="${options.personal ? 'Type a message' : 'Type an update'}" contenteditable="${options.readonly ? 'false' : 'true'}"><p>${options.draft || '<br>'}</p></div><button aria-label="Attach" onclick="document.querySelector('#menu').hidden=false">Attach</button><button aria-label="Send" onclick="send(false)">Send</button></footer></div>
  <div data-testid="newsletter-link-drawer" style="width:0;height:0"><div id="link" hidden><span data-testid="newsletter-link-drawer-copyable-link">${options.link || config.platforms.whatsapp.channelUrl}</span><button aria-label="Close" onclick="this.parentElement.hidden=true">Close</button><button onclick="throw new Error('Must not forward channel links')">Send link via WhatsApp</button></div></div>
  <div id="menu" role="menu" hidden><button role="menuitem" aria-label="Photos & videos" onclick="choosePhoto()">Photos & videos</button></div>
  <div id="preview" tabindex="-1" hidden><button aria-label="Close" onclick="document.querySelector('#discard').hidden=false">Close</button><div data-testid="media-editor-canvas"><img id="image" alt=""></div><div data-testid="media-caption-input-container" data-lexical-editor="true" role="textbox" aria-label="Type an update" aria-placeholder="Type an update" contenteditable="true"><p><br></p></div><div role="tab" aria-label="Open photo, fixture.png, item 1 of 1"></div><button aria-label="Send 1 selected" onclick="send(true)">Send</button></div>
  <div id="discard" role="dialog" hidden>Discard selection?<button onclick="this.parentElement.hidden=true">Cancel</button><button onclick="discard()">Discard</button></div></div>
  <script>
  const options=${JSON.stringify(options)};window.stats={sent:0,selected:0,navigation:0,discarded:0};window.originalInputClick=HTMLInputElement.prototype.click;
  const composer=document.querySelector('[data-testid="conversation-compose-box-input"]'),media=document.querySelector('[data-testid="media-caption-input-container"]');
  function paragraphs(element,text){element.replaceChildren(...text.replace(/\\r\\n/g,'\\n').split('\\n').map(line=>{const p=document.createElement('p');if(line)p.textContent=line;else p.append(document.createElement('br'));return p}))}
  for(const editor of [composer,media]){editor.addEventListener('paste',event=>{event.preventDefault();paragraphs(editor,event.clipboardData.getData('text/plain'))});editor.addEventListener('keydown',event=>{if(event.key==='Enter')send(editor===media)})}
  function selectChannel(){window.stats.selected++;document.querySelector('[data-testid="conversation-info-header-chat-title"]').textContent=options.wrongName?'Another channel':${JSON.stringify(config.platforms.whatsapp.channelName)};if(options.channelDelay){composer.removeAttribute('aria-placeholder');setTimeout(()=>composer.setAttribute('aria-placeholder','Type an update'),options.channelDelay)}}
  function choosePhoto(){document.querySelector('#menu').hidden=true;if(options.noPicker)return;const input=document.createElement('input');input.type='file';input.accept='image/*,video/mp4';input.onchange=()=>{if(input.files.length!==1)throw new Error('One image only');document.querySelector('#image').src=URL.createObjectURL(input.files[0]);document.querySelector('#preview').hidden=false;if(options.optimistic){const pending=document.createElement('div');pending.dataset.id='new-1';pending.textContent='Pending media draft';document.querySelector('#main').append(pending)}};input.click()}
  function discard(){window.stats.discarded++;composer.innerHTML=media.innerHTML;media.innerHTML='<p><br></p>';document.querySelector('#discard').hidden=true;document.querySelector('#preview').hidden=true}
  function send(photo){window.stats.sent++;const content=photo?media:composer;const row=document.createElement('div');row.dataset.id='new-'+window.stats.sent;const text=document.createElement('span');text.dataset.testid=photo?'image-caption selectable-text':'selectable-text';text.innerHTML=content.innerHTML.replace('✅','<img alt="✅" data-testid="selectable-text">');row.append(text);if(photo){const image=document.createElement('img');image.dataset.testid='image-thumb';image.src=document.querySelector('#image').src;row.append(image)}const meta=document.createElement('span');meta.dataset.testid='msg-meta';const views=document.createElement('span');views.dataset.testid=options.pending?'msg-time':'view-count';views.textContent=options.pending?'pending':'0';if(!options.noViews)meta.append(views);if(!options.noAck){const ack=document.createElement('span');ack.setAttribute('aria-label',options.pending?'Sending':' Sent ');meta.append(ack)}row.append(meta);if(options.optimistic)document.querySelector('[data-id="new-1"]')?.remove();document.querySelector('#main').append(row);document.querySelector('#preview').hidden=true;composer.innerHTML='<p><br></p>';}
  if(options.delay){document.querySelector('#app').hidden=true;setTimeout(()=>document.querySelector('#app').hidden=false,options.delay)}
  if(options.loggedOut){document.querySelector('#app').hidden=true;document.querySelector('#qr').hidden=false}
  if(options.takeover){const b=document.createElement('button');b.textContent='Use here';document.body.append(b)}
  </script>`;
}
const browser = await chromium.launch({ headless: true });
async function pageFor(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === 'web.whatsapp.com' ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture(options) }) : route.abort());
  await page.goto('https://web.whatsapp.com/'); assert.deepEqual(errors, []); return page;
}
async function run(options = {}, overrides = {}, inspect = async () => {}) {
  const page = await pageFor(options); let submissions = 0; const shots = [];
  const ctx = { page, config, files: [file], caption, channelTimeout: 1000, mode: 'TEST', confirmedLive: false, step: async () => {}, snapshot: async (label, target) => { shots.push(label); assert.equal(await target.count(), 1); await inspect(label, page, ctx); }, markSubmitting: async () => { submissions++; }, ...overrides };
  try { const result = await prepareWhatsApp(ctx); return { result, submissions, shots, stats: await page.evaluate(() => window.stats), remaining: await readCaption(page.getByTestId('conversation-compose-box-input')), inputRestored: await page.evaluate(() => HTMLInputElement.prototype.click === window.originalInputClick), guardKeys: await page.evaluate(() => Object.keys(window).filter(key => key.startsWith('__mrinalChannel'))) }; }
  finally { await page.close(); }
}
try {
  const delayed = await pageFor(); await delayed.evaluate(() => { document.querySelector('#app').hidden = true; setTimeout(() => { document.querySelector('#app').hidden = false; }, 450); }); const start = Date.now(); await waitForWhatsAppReady(delayed); assert(Date.now() - start >= 400); await delayed.close();
  for (const [options, expected] of [[{ loggedOut: true }, 'needs_login'], [{ takeover: true }, 'needs_attention'], [{ personal: true }, 'needs_access'], [{ duplicate: true }, 'wrong_account'], [{ link: config.platforms.whatsapp.channelUrl + 'X' }, 'wrong_account'], [{ readonly: true }, 'needs_access']]) {
    const page = await pageFor(options); const result = await checkWhatsAppLogin({ page, config, step: async () => {}, readyTimeout: 100, channelTimeout: 100 }); assert.equal(result.status, expected); assert.equal((await page.evaluate(() => window.stats)).sent, 0); await page.close();
  }
  const draftPage = await pageFor({ draft: 'An existing human draft' });
  assert.equal((await checkWhatsAppLogin({ page: draftPage, config, requireEmpty: true })).status, 'needs_attention');
  assert.equal(await readCaption(draftPage.getByTestId('conversation-compose-box-input')), 'An existing human draft'); await draftPage.close();
  const image = await run({}, {}, async (label, page) => { if (label === 'ready-to-publish') { await page.getByRole('button', { name: 'Send 1 selected', exact: true }).click(); await page.getByTestId('media-caption-input-container').press('Enter'); assert.equal((await readCaption(page.getByTestId('media-caption-input-container'))).replace(/\r\n/g, '\n'), caption); } });
  assert.equal(image.result.status, 'dry_run'); assert.equal(image.submissions, 0); assert.equal(image.stats.sent, 0); assert.equal(image.stats.discarded, 1); assert.equal(image.remaining, ''); assert(image.inputRestored); assert.deepEqual(image.guardKeys, []);
  const text = await run({}, { files: [] }, async (label, page) => { if (label === 'ready-to-publish') { await page.getByRole('button', { name: 'Send', exact: true }).click(); await page.getByTestId('conversation-compose-box-input').press('Enter'); } });
  assert.equal(text.stats.sent, 0); assert.equal(text.remaining, '');
  const hydrated = await run({ channelDelay: 350 }, { files: [] }); assert.equal(hydrated.result.status, 'dry_run'); assert.equal(hydrated.stats.sent, 0);
  await assert.rejects(run({}, {}, async (label, page) => { if (label === 'image-prepared') await page.getByRole('button', { name: 'Chats', exact: true }).click(); }), /navigation|identity changed/i);
  await assert.rejects(run({}, { mode: 'LIVE', confirmedLive: true }, async (label, page) => {
    if (label === 'ready-to-publish') await page.getByTestId('media-caption-input-container').press('x');
  }), /navigation|identity changed/i);
  await assert.rejects(run({}, {}, async (label, page) => { if (label === 'image-prepared') await page.evaluate(() => { document.body.innerHTML = '<div data-testid="qrcode"><canvas></canvas></div>'; }); }), /logged out/i);
  await assert.rejects(run({ noPicker: true }), /expected channel photo input/);
  await assert.rejects(run({}, { mode: 'LIVE' }), /explicit confirmation/);
  const live = await run({}, { mode: 'LIVE', confirmedLive: true }); assert.equal(live.result.status, 'posted'); assert.equal(live.submissions, 1); assert.equal(live.stats.sent, 1);
  const optimistic = await run({ optimistic: true, noViews: true }, { mode: 'LIVE', confirmedLive: true }); assert.equal(optimistic.result.status, 'posted'); assert.equal(optimistic.stats.sent, 1); assert.equal(optimistic.result.publication.verifiedBy, 'sent_update');
  await assert.rejects(run({ pending: true }, { mode: 'LIVE', confirmedLive: true, confirmationTimeout: 150 }), /did not confirm/);
  await assert.rejects(run({ noAck: true }, { mode: 'LIVE', confirmedLive: true, confirmationTimeout: 150 }), /did not confirm/);
  const privacyPage = await pageFor(); const queue = new Queue({}, { dataDir: dir }); queue.settings = config;
  const record = { id: 'privacy-fixture', config }, item = { id: 'whatsapp', screenshots: [] };
  await queue.snapshot(record, item, privacyPage, 'account-verified'); await queue.snapshot(record, item, privacyPage, 'error', true);
  assert.equal(item.screenshots.length, 1); const captures = await fs.readdir(path.join(dir, 'logs', record.id)); assert(!captures.some(name => name.endsWith('.html')));
  const dimensions = await sharp(path.join(dir, 'logs', record.id, captures[0])).metadata(); assert(dimensions.width < 1000, 'Only channel header captured, not the personal chat sidebar'); await privacyPage.close();
  console.log('WhatsApp fixtures passed: delayed load, QR expiry, takeover refusal, exact channel URL, admin-only surface, human-draft preservation, TEST Send/Enter blocking, copied-back caption cleanup, navigation/session changes, one guarded LIVE fixture send, pending confirmation, and private screenshots.');
} finally { await browser.close(); }
