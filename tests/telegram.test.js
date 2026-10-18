// Copyright (c) 2026 Mrinal. Offline Telegram safety regression tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaults, validateConfig } from '../server/config.js';
import { PLATFORMS, parseCaptions, validateDraft } from '../shared/platforms.js';
import { telegramChannelUrl, telegramWebUrl, DEFAULT_TELEGRAM_URL } from '../shared/telegram.js';
import { destinationReadiness } from '../shared/readiness.js';
import { Queue } from '../server/queue.js';
import { BrowserManager } from '../server/automation/browser.js';
import { publicationUrl } from '../server/automation/publication.js';

test('Telegram config migrates safely and accepts only exact public channel usernames', () => {
  assert.equal(telegramChannelUrl('https://t.me/GOClasses_CSE/'), DEFAULT_TELEGRAM_URL);
  assert.equal(telegramWebUrl(DEFAULT_TELEGRAM_URL), 'https://web.telegram.org/k/#@goclasses_cse');
  for (const url of ['http://t.me/goclasses_cse','https://t.me/+invite','https://t.me/joinchat/abc','https://t.me/goclasses_cse/123','https://t.me/c/123/1','https://t.me/goclasses_cse?start=hi','https://t.me.evil.test/goclasses_cse','https://secret@t.me/goclasses_cse','https://t.me/goclasses_cse#x']) assert.equal(telegramChannelUrl(url), null, url);
  const legacy = structuredClone(defaults); delete legacy.platforms.telegram;
  assert.equal(validateConfig(legacy).platforms.telegram.channelUrl, DEFAULT_TELEGRAM_URL);
  const bad = structuredClone(defaults); bad.platforms.telegram.channelUrl = 'https://t.me/goclasses_cse/123';
  assert.throws(() => validateConfig(bad), /Telegram/);
  assert.equal(publicationUrl('telegram','https://t.me/goclasses_cse/5017'), 'https://t.me/goclasses_cse/5017');
  assert.equal(publicationUrl('telegram', 'https://t.me/goclasses_cse/5017?x=1'), null);
});
test('Telegram imports its own text, supports albums and enforces text versus photo limits', () => {
  const legacy = PLATFORMS.filter(p => !p.optionalImport).map(p => '=====' + p.delimiter + '=====\nCaption').join('\n\n');
  assert.deepEqual(parseCaptions(legacy).errors, []); assert.equal(parseCaptions(legacy).captions.telegram, '');
  const parsed = parseCaptions(legacy + '\n\n=====TELEGRAM=====\nनमस्ते ✅\n\nhttps://www.goclasses.in/');
  assert.equal(parsed.captions.telegram, 'नमस्ते ✅\n\nhttps://www.goclasses.in/');
  const draft = { selected:['telegram'], captions: parsed.captions };
  assert.deepEqual(validateDraft(draft, []), []); assert.deepEqual(validateDraft(draft, Array(10).fill({})), []);
  assert(validateDraft(draft, Array(11).fill({})).some(e => /10 images/.test(e)));
  draft.captions.telegram = 'a'.repeat(1025);
  assert.deepEqual(validateDraft(draft, []), []);
  assert(validateDraft(draft, [{}]).some(e => /1,024.*with images/.test(e)));
  draft.captions.telegram = 'a'.repeat(4097); assert(validateDraft(draft, []).length);
  draft.captions.telegram = '✅';
  assert.equal(destinationReadiness(draft, [], defaults, { telegram:{status:'needs_login',message:'Sign in first'} }).telegram.ready, false);
});
const until = async fn => { const end = Date.now()+4000; while(!fn()) { if(Date.now()>end) throw Error('Queue timeout'); await new Promise(r=>setTimeout(r,10)); } };
test('Telegram session preflight pauses all LIVE destinations before any runner can publish', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-tg-preflight-')), calls = [];
  let ready = false; const queue = new Queue({page:async()=>({isClosed:()=>true})}, {dataDir,runner:async ctx=>{calls.push(ctx.id);return 'posted';},loginChecker:async ctx=>{assert.equal(ctx.id,'telegram');assert.equal(ctx.requireEmpty,true);return ready?{status:'verified'}:{status:'needs_login',message:'Sign into Telegram'};}});
  await queue.init();const run=await queue.start({mode:'LIVE',confirmation:'POST',config:defaults,media:[],draft:{selected:['x','telegram'],captions:{x:'Text',telegram:'Channel text'}}});
  await until(()=>run.status==='attention'&&!queue.processing);assert.deepEqual(calls,[]);assert.equal(queue.login.items.telegram.status,'needs_login');assert.equal(run.items[1].submitting,false);
  ready=true;await queue.control('continue');await until(()=>run.status==='completed'&&!queue.processing);assert.deepEqual(calls,['x','telegram']);
});
test('Telegram diagnostics never persist personal chat HTML or choose among duplicate tabs', async () => {
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-tg-privacy-'));const queue=new Queue({}, {dataDir});
  await queue.snapshot({id:'privacy'},{id:'telegram'}, {},'error',true);assert.deepEqual(await fs.readdir(dataDir),[]);
  const tab={url:()=> 'https://web.telegram.org/k/',isClosed:()=>false,bringToFront:async()=>{}};
  const manager=new BrowserManager();manager.context={pages:()=>[tab]};assert.equal(await manager.page('telegram'),tab);
  manager.context={pages:()=>[tab,{...tab}]};await assert.rejects(manager.page('telegram'),/More than one Telegram/);
});
