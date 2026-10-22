// Copyright (c) 2026 Mrinal. All rights reserved.
import { EventEmitter } from 'node:events';
import {NativeInterventions} from './native-interventions.js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite, readJson, DATA } from './config.js';
import { automate, checkLogin } from './automation/platforms.js';
import { assertNoChallenge, InterventionError, NetworkError } from './automation/utils.js';
import { replyBatch, validateManychatDraft, instagramPostUrl, manychatPublicationSource } from '../shared/manychat.js';
import { verifyMediaIntegrity } from './image-metadata.js';
import { mediaFor } from '../shared/media.js';
import { usesInstagramAndroid, instagramNeedsMusicEdit } from '../shared/instagram.js';
import { publicationUrl } from './automation/publication.js';

const busyStates = ['running', 'pausing', 'paused', 'stopping', 'attention', 'awaiting_manual', 'waiting_for_input'];
export class Queue extends EventEmitter {
  constructor(browser, { runner = automate, loginChecker = checkLogin, dataDir = DATA, deadline, instagramWorker } = {}) {
    super(); this.interventions=new NativeInterventions(this); this.instagramWorker=instagramWorker; this.browser = browser; this.runner = runner; this.loginChecker = loginChecker; this.dataDir = dataDir; this.deadline = deadline ?? 120000; this.nativeDeadline=deadline??300000; this.channelDeadline = deadline ?? 240000;
    this.runs = []; this.login = { running: false, items: {} }; this.persistChain = Promise.resolve(); this.processing = false;
  }
  get active() { return this.runs.find(run => busyStates.includes(run.status)); }
  async init() {
    this.runs = await readJson(path.join(this.dataDir, 'runs.json'), []);
    this.replyRotation = await readJson(path.join(this.dataDir, 'manychat-rotation.json'), { offset: 0 });
    if (!Number.isSafeInteger(this.replyRotation.offset) || this.replyRotation.offset < 0) this.replyRotation = { offset: 0 };
    for (const run of this.runs) {
      if (['completed', 'completed_with_errors'].includes(run.status)) run.status = run.items.some(i => ['failed', 'uncertain', 'needs_setup'].includes(i.status)) ? 'completed_with_errors' : 'completed';
      if (!busyStates.includes(run.status)) continue;
      run.status = 'interrupted'; run.confirmedLive = false;
      for (const item of run.items) {
        delete item.intervention;
        if (item.status === 'running' || item.status === 'awaiting_manual' || item.status === 'waiting_for_input') {
          item.status = item.submitting ? 'uncertain' : run.killRequested ? 'skipped' : 'failed';
          item.message = item.submitting ? 'Worker restarted after publication may have begun. Verify on the platform before resolving this result.' : 'Worker restarted. Safe to retry this failed preparation.';
        } else if(item.status==='attention'&&item.startedAt&&!item.submitting){
          item.status='failed';item.message+=' Worker restarted after this preparation stopped. Retry only this failed destination.';
        } else if (item.status === 'queued' || item.status === 'attention') { item.status = 'skipped'; item.message = 'Worker restarted. Start a new reviewed run for this destination.'; }
      }
    }
    await this.persist();
  }
  state() {
    return { update:this.updateState,androidProgress:this.instagramWorker?.progressState||null,runs: this.runs.map(({ confirmedLive, config, ...run }) => run), login: this.login, workerBusy: this.processing || Boolean(this.browser.manualProcess) || Boolean(this.instagramWorker?.busy), ...(this.settings ? { config: this.settings, manychatNextReplies: replyBatch(this.settings.platforms.manychat.replyMessages, this.replyRotation?.offset || 0) } : {}) };
  }
  persist() {
    const snapshot = structuredClone(this.runs);
    this.persistChain = this.persistChain.then(() => atomicWrite(path.join(this.dataDir, 'runs.json'), snapshot));
    return this.persistChain;
  }
  async change() { await this.persist(); this.emit('change', this.state()); }
  async start({ draft, config, mode = 'TEST', confirmation, media, retryOf = null, sourceInstagramPublication }) {
    if (this.maintenance || this.active || this.login.running || this.processing || this.browser.manualProcess || this.instagramWorker?.busy) throw new Error('A run or login check is already active. Close any manual sign-in window before continuing.');
    if (mode !== 'TEST' && mode !== 'LIVE') throw new Error('Invalid run mode.');
    if (mode === 'LIVE' && confirmation !== 'POST') throw new Error('Type POST to authorize this live run.');
    const ordered=draft.selected.filter(id=>!['instagramStory','manychat'].includes(id)&&!(id==='instagramMusic'&&draft.selected.includes('instagram')&&instagramNeedsMusicEdit(draft.instagram))).flatMap(id=>id==='instagram'?[id,...(instagramNeedsMusicEdit(draft.instagram)?['instagramMusic']:[]),...(draft.selected.includes('instagramStory')?['instagramStory']:[])]:[id]);
    if(draft.selected.includes('instagramStory')&&!draft.selected.includes('instagram'))ordered.push('instagramStory');
    if(draft.selected.includes('manychat'))ordered.push('manychat');
    const run = {
      id: randomUUID(), createdAt: new Date().toISOString(), mode, confirmedLive: mode === 'LIVE' && confirmation === 'POST',
      status: 'running', config: structuredClone(config), captions: structuredClone(draft.captions), media: structuredClone(media), retryOf,
      instagram: structuredClone(draft.instagram||{}),
      mediaByPlatform: Object.fromEntries(ordered.map(id => [id, ['instagramStory','instagramMusic'].includes(id)?[]:mediaFor(draft, media, id).map(m => m.id)])),
      items: ordered.map(id => ({ id, status: 'queued', message: 'Waiting in queue', screenshots: [], submitting: false }))
    };
    if (draft.selected.includes('manychat')) run.manychat = { ...validateManychatDraft(draft.manychat, draft.captions?.manychat), replies: replyBatch(config.platforms.manychat.replyMessages, this.replyRotation.offset) };
    if (mode === 'LIVE' && run.manychat && !run.manychat.postUrl && !draft.selected.includes('instagram') && !manychatPublicationSource(sourceInstagramPublication)) throw new Error('ManyChat: select Instagram in this run, or paste the exact Instagram post URL in Compose.');
    if(ordered.includes('instagramMusic')&&!ordered.includes('instagram')&&!instagramPostUrl(sourceInstagramPublication?.postUrl))throw new Error('Instagram music needs the exact confirmed feed post from this run.');
    if (sourceInstagramPublication) run.sourceInstagramPublication = structuredClone(sourceInstagramPublication);
    this.runs.unshift(run);
    // Keep all unresolved runs; never silently discard ambiguous publication evidence.
    if (this.runs.length > 30) this.runs = this.runs.filter((r, i) => i < 30 || r.items.some(item => item.status === 'uncertain'));
    await this.change();
    this.process(run).catch(error => this.emit('workerError', error));
    return run;
  }
  async control(action, expectedRunId) {
    const run = this.active;
    if (!run) throw new Error('There is no active run.');
    if(expectedRunId&&run.id!==expectedRunId)throw new Error('That activity is no longer active. No other run was stopped.');
    if (action === 'pause' && run.status === 'running') run.status = 'pausing';
    else if (action === 'resume' && run.status === 'paused') run.status = 'running';
    else if (action === 'continue' && run.status === 'attention') {
      const item = run.items.find(i => i.status === 'attention');
      if (item) {item.failureMessage ||= item.message;item.status = 'queued';}
      run.status = 'running';
    } else if (action === 'done' && run.status === 'awaiting_manual') {
      const item = run.items.find(i => i.status === 'awaiting_manual');
      item.status = 'posted'; item.finishedAt = new Date().toISOString(); item.message = 'ManyChat update confirmed by operator.';
      run.status = run.pauseAfterManual ? 'paused' : 'running';
      delete run.pauseAfterManual;
      try { if(!usesInstagramAndroid(run.instagram,item.id))await this.snapshot(run, item, await this.browser.page(item.id), 'operator-confirmed'); } catch { /* Operator confirmation remains authoritative for this manual step. */ }
    } else if (action === 'kill') {
      run.status='stopping';run.confirmedLive=false;run.killRequested=true;
      for(const item of run.items){if(['queued','attention'].includes(item.status)){item.status='skipped';item.message='Stopped before this destination started.';}if(item.status==='awaiting_manual'){item.status='uncertain';item.message='Stopped. Check the existing assisted update before retrying.';}}
      if(this.runController?.runId===run.id)this.runController.controller.abort(new InterventionError('Stopped by operator. No further publication actions are allowed.'));
    } else if (action === 'stop') {
      run.status = 'stopping';
      if(this.interventions.pending?.run===run)this.runController?.controller.abort(new InterventionError('Stopped by operator. No further publication actions are allowed.'));
      for (const item of run.items) {
        if (item.status === 'queued' || item.status === 'attention') { item.status = 'skipped'; item.message = 'Stopped by operator.'; }
        if (item.status === 'awaiting_manual') { item.status = 'uncertain'; item.message = 'Assisted update stopped. Check ManyChat to see whether changes were saved.'; }
      }
    } else throw new Error('That action is not available in the current state.');
    await this.change();
    if (run.status === 'running' || run.status === 'stopping') {
      if (this.processing) this.pendingKick = run;
      else this.process(run).catch(error => this.emit('workerError', error));
    }
  }
  async resolve(runId, id, resolution, proof) {
    if (!['posted', 'failed', 'skipped'].includes(resolution)) throw new Error('Invalid resolution.');
    const run = this.runs.find(r => r.id === runId);
    const item = run?.items.find(i => i.id === id && (i.status === 'uncertain' || i.status === 'posted' && resolution === 'posted' && proof));
    if (!item) throw new Error('Only an uncertain result can be resolved manually.');
    const alreadyPosted = item.status === 'posted';
    let publication;
    if(id==='instagramMusic'&&resolution==='posted'){
      const source=instagramPostUrl(run.items.find(i=>i.id==='instagram'&&i.status==='posted')?.publication?.postUrl||run.sourceInstagramPublication?.postUrl);
      if(!source||proof&&instagramPostUrl(proof.postUrl)!==source)throw new Error('Verify music only on this run’s exact published feed post.');
      publication={postUrl:source,music:item.preparation?.music,verifiedBy:'operator_confirmation',verifiedAt:new Date().toISOString()};
    }else if (proof && resolution === 'posted') {
      if (id === 'whatsapp') {
        const expected = run.config?.platforms.whatsapp;
        if (!expected || proof.channelUrl !== expected.channelUrl || proof.channelName !== expected.channelName || !/^[A-Za-z0-9_-]{8,80}$/.test(proof.updateId || '')) throw new Error('The WhatsApp verification record does not match this run.');
        publication = { updateId: proof.updateId, channelName: expected.channelName, channelUrl: expected.channelUrl };
      } else {
        const url = publicationUrl(id, proof.postUrl);
        if (!url || id === 'telegram' && !url.startsWith(run.config?.platforms.telegram?.channelUrl + '/')) throw new Error('Use a native publication permalink for this destination.');
        publication = { postUrl: url };
      }
      // A supplied Instagram link records the operator's verification. URL
      // validation alone does not inspect its author, caption or images.
      publication.verifiedBy = id === 'instagram' ? 'operator_confirmation' : 'read_only_recheck'; publication.verifiedAt = new Date().toISOString();
    }
    item.status = resolution; item.message = `Operator verified outcome: ${resolution === 'failed' ? 'not published; may retry' : resolution}.`;
    if (publication) { item.publication = publication; item.message = id === 'instagram' ? 'Published; operator confirmed this exact post link. No repost was performed.' : 'Published; verified against the existing platform record. No repost was performed.'; }
    if (resolution === 'posted' && !alreadyPosted) await this.advanceReplies(run, item);
    if (['completed', 'completed_with_errors'].includes(run.status)) run.status = run.items.some(i => ['failed', 'uncertain', 'needs_setup'].includes(i.status)) ? 'completed_with_errors' : 'completed';
    await this.change();
  }
  async snapshot(run, item, page, label, errorHtml = false, target = page) {
    if(target?.nativeImage){
      const dir=path.join(this.dataDir,'logs',run.id);await fs.mkdir(dir,{recursive:true});
      const filename=item.id+'-'+Date.now()+'-'+label+'.png';
      await fs.writeFile(path.join(dir,filename),target.nativeImage,{mode:0o600});item.screenshots.push({label,url:'/artifacts/'+run.id+'/'+filename});await this.change();return;
    }
    if (item.id === 'whatsapp') {
      // Never persist personal chat lists, full WhatsApp DOM, QR codes, or an
      // unknown recipient. Successful captures are limited to our own composer.
      if (errorHtml) return;
      const expected = (run.config || this.settings)?.platforms.whatsapp?.channelName;
      const heading = page.getByTestId('conversation-panel-wrapper').getByTestId('conversation-info-header-chat-title');
      if (!expected || await heading.count() !== 1 || (await heading.innerText()).trim() !== expected) return;
      if (target === page) target = page.getByTestId('conversation-header');
    }
    if (item.id === 'telegram') {
      // Never capture Telegram's private sidebar, login QR, unknown chats or full DOM.
      if (errorHtml) return;
      const expected = (run.config || this.settings)?.platforms.telegram?.channelName;
      const surface = page.locator('#column-center .chat.active'), heading = surface.locator('.topbar .user-title .peer-title');
      if (!expected || await heading.count() !== 1 || (await heading.innerText()).trim() !== expected) return;
      if (target === page) target = surface.locator('.topbar');
    }
    const dir = path.join(this.dataDir, 'logs', run.id);
    await fs.mkdir(dir, { recursive: true });
    const filename = `${item.id}-${Date.now()}-${label}.png`;
    if (target !== page) {
      // Fixed site headers outside the composer otherwise cover its caption
      // when Playwright captures an element taller than the browser viewport.
      await target.evaluate(composer => {
        for (const element of document.querySelectorAll('body *')) {
          if (!composer.contains(element) && !element.contains(composer) && ['fixed', 'sticky'].includes(getComputedStyle(element).position)) element.setAttribute('data-studio-capture-overlay', '');
        }
      });
    }
    try {
      await target.screenshot({ path: path.join(dir, filename), ...(target === page ? { fullPage: false } : { style: '[data-studio-capture-overlay]{visibility:hidden!important}' }), timeout: 10000 });
    } finally {
      if (target !== page) await page.locator('[data-studio-capture-overlay]').evaluateAll(elements => elements.forEach(element => element.removeAttribute('data-studio-capture-overlay'))).catch(() => {});
    }
    item.screenshots.push({ label, url: `/artifacts/${run.id}/${filename}` });
    if (errorHtml) await fs.writeFile(path.join(dir, filename.replace('.png', '.html')), await page.content(), { mode: 0o600 });
    await this.change();
  }
  async log(run, item, message) {
    const dir = path.join(this.dataDir, 'logs', run.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, 'actions.jsonl'), `${JSON.stringify({ time: new Date().toISOString(), platform: item.id, message })}\n`, { mode: 0o600 });
    item.message = message;
    await this.change();
  }
  async advanceReplies(run, item) {
    if (run.mode !== 'LIVE' || item.id !== 'manychat' || run.manychatRotationAdvanced) return;
    this.replyRotation.offset += 3;
    await atomicWrite(path.join(this.dataDir, 'manychat-rotation.json'), this.replyRotation);
    run.manychatRotationAdvanced = true;
  }
  testInstagramPublication(run){
    if(run.mode!=='TEST')return undefined;
    const feed=run.items?.find(item=>item.id==='instagram');
    if(feed&&!['posted','dry_run'].includes(feed.status))return undefined;
    const handle=run.config?.platforms?.instagram?.handle;
    for(const previous of this.runs){
      if(previous.id===run.id||!handle||previous.config?.platforms?.instagram?.handle!==handle)continue;
      const postUrl=instagramPostUrl(previous.items.find(item=>item.id==='instagram'&&item.status==='posted')?.publication?.postUrl);
      if(postUrl)return {postUrl};
    }
  }
  async process(run) {
    if (this.processing) return;
    this.processing = true;
    const runController=new AbortController();this.runController={runId:run.id,controller:runController};
    try {
      const nativeItem=run.items.find(item=>item.status==='queued'&&usesInstagramAndroid(run.instagram,item.id));
      if(nativeItem&&nativeItem.id!=='instagramMusic'&&this.instagramWorker&&run.status!=='stopping'){
        await this.log(run,nativeItem,'Checking the dedicated Android Instagram account before any destination runs...');
        try{await this.instagramWorker.checkAccount(run.config,{runId:run.items.find(item=>item.status==='queued')===nativeItem?run.id:undefined,signal:runController.signal,onProgress:message=>{runController.signal.throwIfAborted();return this.log(run,nativeItem,message);}});}catch(error){if(run.status!=='stopping'){nativeItem.status='attention';nativeItem.message=nativeItem.failureMessage||error.message;nativeItem.recoveryMessage=error.message;run.status='attention';await this.change();return;}}
      }
      for (const channelId of ['whatsapp', 'telegram']) {
        const channelItem = run.items.find(item => item.id === channelId && item.status === 'queued');
        if (!channelItem || run.status === 'stopping') continue;
        await this.log(run, channelItem, `Checking ${channelId === 'whatsapp' ? 'WhatsApp' : 'Telegram'} session, exact channel link and unsent drafts before any destination runsâ€¦`);
        let checked;
        try {
          const page = await this.browser.page(channelId);
          checked = await this.loginChecker({ page, id: channelId, config: run.config, requireEmpty: true, step: message => this.log(run, channelItem, message) });
        } catch (error) { checked = { status: 'needs_attention', message: error.message }; }
        this.login.items[channelId] = { ...checked, checkedAt: new Date().toISOString() };
        if (checked.status !== 'verified' && run.status !== 'stopping') {
          channelItem.status = 'attention'; channelItem.message = checked.message; run.status = 'attention'; await this.change(); return;
        }
        await this.change();
      }
      while (run.status === 'running' || run.status === 'stopping' || run.status === 'pausing') {
        if (run.status === 'pausing') { run.status = 'paused'; await this.change(); break; }
        const item = run.items.find(i => i.status === 'queued');
        if (!item || run.status === 'stopping') {
          run.status = run.status === 'stopping' ? 'stopped' : run.items.some(i => ['failed', 'uncertain', 'needs_setup'].includes(i.status)) ? 'completed_with_errors' : 'completed';
          run.finishedAt = new Date().toISOString(); run.confirmedLive = false;
          await this.change(); break;
        }
        delete item.recoveryMessage;
        item.status = 'running'; item.startedAt = new Date().toISOString(); delete item.finishedAt;
        await this.change();
        let page, timer, task;
        const native=usesInstagramAndroid(run.instagram,item.id),controller=new AbortController();
        const cancel=()=>controller.abort(runController.signal.reason);runController.signal.addEventListener('abort',cancel,{once:true});if(runController.signal.aborted)cancel();
        try {
          // A TEST may rehearse a successful feed against an existing post, but
          // a failed or uncertain feed must never select an unrelated old post.
          const feed=['instagramStory','instagramMusic'].includes(item.id)&&run.items.find(i=>i.id==='instagram');
          if(feed&&feed.status!=='posted'&&!(run.mode==='TEST'&&feed.status==='dry_run'))throw new InterventionError('This run\'s Instagram feed did not finish successfully. Verify or retry that feed before starting its Story. No earlier post was selected.');
          const musicItem=item.id==='instagramStory'&&run.items.find(i=>i.id==='instagramMusic');
          if(musicItem&&!['posted','dry_run'].includes(musicItem.status))throw new InterventionError('Verify or finish this post’s music step before sharing its Story. The feed was not posted again.');
          const destinationMedia = mediaFor({ mediaByPlatform: run.mediaByPlatform }, run.media, item.id);
          await verifyMediaIntegrity(destinationMedia, this.dataDir);
          if(!native)page = await this.browser.page(item.id);
          const deadline = native?this.nativeDeadline:['whatsapp', 'telegram'].includes(item.id) ? this.channelDeadline : this.deadline;
          let armDeadline;
          const timeout = new Promise((_, reject) => {
            armDeadline=()=>{clearTimeout(timer);timer=setTimeout(() => { const error=native?new InterventionError('Android preparation timed out. Its draft was preserved. Close the unfinished draft before retrying Android, or choose Web in Compose for a faster feed post.'):new Error(`Preparation exceeded ${Math.round(deadline / 1000)} seconds. Inspect the worker browser before continuing.`); controller.abort(error); reject(error); page?.close().catch(() => {}); }, deadline);};
            armDeadline();
          });
          task = this.runner({
            page, id: item.id, runId:run.id, continueInstagramStory:['instagram','instagramMusic'].includes(item.id)&&run.items[run.items.indexOf(item)+1]?.id==='instagramStory'&&run.items[run.items.indexOf(item)+1]?.status==='queued', config: run.config, caption: run.captions[item.id==='instagramMusic'?'instagram':item.id], files: destinationMedia.map(m => path.join(this.dataDir, 'uploads', m.filename)),
            mode: run.mode, confirmedLive: run.confirmedLive, signal:controller.signal, instagram:run.instagram, instagramWorker:this.instagramWorker,
            manychat: run.manychat, instagramCaption: run.captions.instagram,
            instagramPublication: run.items.some(i=>i.id==='instagram')?run.items.find(i=>i.id==='instagram'&&i.status==='posted')?.publication:run.sourceInstagramPublication,
            instagramMusicPublication:run.items.find(i=>i.id==='instagramMusic'&&i.status==='posted')?.publication,
            instagramTestPublication:this.testInstagramPublication(run),
            captureInstagramPost: run.items.some(i=>['instagramStory','instagramMusic'].includes(i.id)) || run.items.some(i=>i.id==='manychat')&&!run.manychat?.postUrl,
            step: message => { controller.signal.throwIfAborted(); return this.log(run, item, message); }, snapshot: (label, target = page) => { controller.signal.throwIfAborted(); return this.snapshot(run, item, page, label, false, target); },
            intervene: native ? (details,inspect)=>this.interventions.wait(run,item,controller.signal,details,inspect,{pause:()=>clearTimeout(timer),resume:armDeadline}) : undefined,
            recordPreparation: async details => { controller.signal.throwIfAborted(); item.preparation = details; await this.change(); },
            markSubmitting: async () => { controller.signal.throwIfAborted(); if(run.status==='stopping'||run.status==='waiting_for_input')throw new Error('Stopped before publication.'); item.submitting = true; await this.change(); }
          });
          const result = await Promise.race([task, timeout]);
          clearTimeout(timer);
          if (result?.manual) {
            if (result.libraryOnly) {
              item.status = 'needs_setup'; item.message = 'ManyChat library loaded. Select the exact automation URL in Connections before its message can be prepared. No automation was edited or saved.';
              await this.snapshot(run, item, page, 'manychat-needs-flow');
              await page.goto('about:blank');
            } else if (run.mode === 'TEST') {
              item.status = 'dry_run'; item.message = 'TEST: ManyChat flow opened and captured. No edits or saves performed.';
              await this.snapshot(run, item, page, 'manychat-test');
              await page.goto('about:blank');
            } else if (run.status === 'stopping') {
              item.status = 'skipped'; item.message = 'Stopped before assisted update.';
            } else {
              run.pauseAfterManual = run.status === 'pausing';
              item.status = 'awaiting_manual'; item.submitting = true; run.status = 'awaiting_manual';
              item.message = 'Open the intended flow, copy the message from this workspace, paste it into the correct message block, then save/publish in ManyChat. Confirm here only after saving.';
              await this.snapshot(run, item, page, 'manychat-awaiting-operator');
            }
          } else {
            item.status = typeof result === 'string' ? result : result.status;
            delete item.failureMessage;delete item.recoveryMessage;
            if (result?.publication) item.publication = result.publication;
            item.message = item.status === 'posted' ? item.id === 'manychat' ? 'Automation activated; Edit and Stop controls confirmed.' : item.id==='instagramMusic'?'Music saved and verified on the existing feed post.':'Published and confirmed by platform.' : item.id === 'manychat' ? 'TEST complete Â· automation prepared; Go live was not clicked.' : 'TEST complete Â· nothing published.';
            if (item.status === 'posted') await this.advanceReplies(run, item);
          }
          if (item.status !== 'awaiting_manual') item.finishedAt = new Date().toISOString();
        } catch (originalError) {
          clearTimeout(timer);
          let error = originalError;
          if(native&&controller.signal.aborted&&task){
            // The driver must disconnect before another destination or run can
            // reuse Android. No web fallback and no repeat of a final Share.
            await this.log(run,item,run.killRequested?'Stopping Android and preserving its unsent draft...':'Android timed out. Disconnecting the worker and preserving its unsent draft...');
            let cleanupTimer;
            const settled=await Promise.race([task.then(()=>true,()=>true),new Promise(resolve=>{cleanupTimer=setTimeout(()=>resolve(false),60000);})]);
            clearTimeout(cleanupTimer);
            if(!settled)error=new InterventionError('Android has not finished stopping. Keep the emulator draft open for review; restart the worker before another Android attempt. No automatic retry was started.');
          }
          if (!item.submitting && page && !page.isClosed()) {
            try { await assertNoChallenge(page); } catch (challenge) { error = challenge; }
          }
          item.status = item.submitting ? 'uncertain' : run.killRequested ? 'skipped' : 'failed';
          const message = error.message.replace(/\u001b\[[0-9;]*m/g, '');
          item.message = item.submitting ? `Publication may have occurred. Verify on the platform before retrying. ${message}` : message;
          item.finishedAt = new Date().toISOString();
          if (!item.submitting && run.status !== 'stopping' && (native || error instanceof InterventionError || error instanceof NetworkError)) {
            // A native driver error can leave an unfinished editor even when
            // its error type is generic. Stop before Story or another destination.
            if(native){
              item.failureMessage ||= originalError.message.replace(/\u001b\[[0-9;]*m/g, '');
              item.message = item.failureMessage;
              if(message!==item.message)item.recoveryMessage=message;
              else if(!(error instanceof InterventionError)&&!(error instanceof NetworkError))item.recoveryMessage='Check the Android app for an unfinished draft before choosing Continue. No automatic retry was started.';
            }else item.failureMessage=item.message;
            item.status = 'attention'; run.status = 'attention';
          }
          if (page && !page.isClosed()) { try { await this.snapshot(run, item, page, 'error', true); } catch { /* Browser may already be gone. */ } }
          await this.log(run, item, item.message);
        }
        runController.signal.removeEventListener('abort',cancel);
        await this.change();
      }
    } finally {
      // A pause, stop or failure at the destination boundary must not retain a native session.
      if(this.instagramWorker?.handoff||this.instagramWorker?.preflight)await this.instagramWorker.close().catch(error=>this.emit('workerError',error));
      if(this.runController?.runId===run.id)this.runController=null;
      this.processing = false; this.emit('change', this.state());
      const pending = this.pendingKick; this.pendingKick = null;
      if (pending && this.active === pending && ['running', 'stopping'].includes(pending.status)) this.process(pending).catch(error => this.emit('workerError', error));
    }
  }
  async checkLogins(config, selected, saveDetected = async () => {}, {instagram}={}) {
    if (this.maintenance || this.active || this.login.running || this.processing || this.browser.manualProcess || this.instagramWorker?.busy) throw new Error('Finish the current run or login check, and close any manual sign-in window first.');
    this.login = { running: true, items: { ...this.login.items } }; this.emit('change', this.state());
    try {
      for (const id of selected) {
        this.login.items[id] = { status: 'checking', message: 'Checking connection...' }; this.emit('change', this.state());
        let page;
        try {
          const native=id==='instagram'&&usesInstagramAndroid(instagram),step=async message=>{this.login.items[id].message=message;this.emit('change',this.state());};
          if(native){await step('Checking the Android Instagram account...');await this.instagramWorker.checkAccount(config,{onProgress:step});this.login.items[id]={status:'verified',message:'Android account verified.'};}
          else{page=await this.browser.page(id);this.login.items[id]=await this.loginChecker({page,id,config,step});}
          if(id==='instagram')this.login.items[id].transport=native?'android':'web';
          if (this.login.items[id].detectedSettings) await saveDetected(id, this.login.items[id].detectedSettings);
        } catch (error) { this.login.items[id] = { status: error instanceof NetworkError ? 'network_error' : error instanceof InterventionError ? id==='instagram'&&usesInstagramAndroid(instagram)?'needs_attention':'needs_login' : 'verification_failed', message: error.message,...(id==='instagram'?{transport:usesInstagramAndroid(instagram)?'android':'web'}:{}) }; }
        this.login.items[id].checkedAt = new Date().toISOString();
        if (page && !page.isClosed()) {
          try {
            const record = { id: `login-${randomUUID()}` }, item = { id, screenshots: [] };
            await this.snapshot(record, item, page, 'login-check');
            this.login.items[id].screenshot = item.screenshots[0].url;
          } catch { /* A diagnostic screenshot must not hide the login result. */ }
        }
        this.emit('change', this.state());
      }
    } finally { this.login.running = false; this.emit('change', this.state()); }
  }
}
