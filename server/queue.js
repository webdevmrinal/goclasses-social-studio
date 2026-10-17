// Copyright (c) 2026 Mrinal. All rights reserved.
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite, readJson, DATA } from './config.js';
import { automate, checkLogin } from './automation/platforms.js';
import { assertNoChallenge, InterventionError, NetworkError } from './automation/utils.js';
import { replyBatch, validateManychatDraft } from '../shared/manychat.js';
import { verifyMediaIntegrity } from './image-metadata.js';

const busyStates = ['running', 'pausing', 'paused', 'stopping', 'attention', 'awaiting_manual'];
export class Queue extends EventEmitter {
  constructor(browser, { runner = automate, loginChecker = checkLogin, dataDir = DATA, deadline } = {}) {
    super(); this.browser = browser; this.runner = runner; this.loginChecker = loginChecker; this.dataDir = dataDir; this.deadline = deadline ?? 120000; this.whatsappDeadline = deadline ?? 240000;
    this.runs = []; this.login = { running: false, items: {} }; this.persistChain = Promise.resolve(); this.processing = false;
  }
  get active() { return this.runs.find(run => busyStates.includes(run.status)); }
  async init() {
    this.runs = await readJson(path.join(this.dataDir, 'runs.json'), []);
    this.replyRotation = await readJson(path.join(this.dataDir, 'manychat-rotation.json'), { offset: 0 });
    if (!Number.isSafeInteger(this.replyRotation.offset) || this.replyRotation.offset < 0) this.replyRotation = { offset: 0 };
    for (const run of this.runs) {
      if (!busyStates.includes(run.status)) continue;
      run.status = 'interrupted'; run.confirmedLive = false;
      for (const item of run.items) {
        if (item.status === 'running' || item.status === 'awaiting_manual') {
          item.status = item.submitting ? 'uncertain' : 'failed';
          item.message = item.submitting ? 'Worker restarted after publication may have begun. Verify on the platform before resolving this result.' : 'Worker restarted. Safe to retry this failed preparation.';
        } else if (item.status === 'queued' || item.status === 'attention') { item.status = 'skipped'; item.message = 'Worker restarted. Start a new reviewed run for this destination.'; }
      }
    }
    await this.persist();
  }
  state() {
    return { runs: this.runs.map(({ confirmedLive, config, ...run }) => run), login: this.login, workerBusy: this.processing || Boolean(this.browser.manualProcess), ...(this.settings ? { config: this.settings, manychatNextReplies: replyBatch(this.settings.platforms.manychat.replyMessages, this.replyRotation?.offset || 0) } : {}) };
  }
  persist() {
    const snapshot = structuredClone(this.runs);
    this.persistChain = this.persistChain.then(() => atomicWrite(path.join(this.dataDir, 'runs.json'), snapshot));
    return this.persistChain;
  }
  async change() { await this.persist(); this.emit('change', this.state()); }
  async start({ draft, config, mode = 'TEST', confirmation, media, retryOf = null, sourceInstagramPublication }) {
    if (this.active || this.login.running || this.processing || this.browser.manualProcess) throw new Error('A run or login check is already active. Close any manual sign-in window before continuing.');
    if (mode !== 'TEST' && mode !== 'LIVE') throw new Error('Invalid run mode.');
    if (mode === 'LIVE' && confirmation !== 'POST') throw new Error('Type POST to authorize this live run.');
    const run = {
      id: randomUUID(), createdAt: new Date().toISOString(), mode, confirmedLive: mode === 'LIVE' && confirmation === 'POST',
      status: 'running', config: structuredClone(config), captions: structuredClone(draft.captions), media: structuredClone(media), retryOf,
      items: [...draft.selected.filter(id => id !== 'manychat'), ...draft.selected.filter(id => id === 'manychat')].map(id => ({ id, status: 'queued', message: 'Waiting in queue', screenshots: [], submitting: false }))
    };
    if (draft.selected.includes('manychat')) run.manychat = { ...validateManychatDraft(draft.manychat, draft.captions?.manychat), replies: replyBatch(config.platforms.manychat.replyMessages, this.replyRotation.offset) };
    if (mode === 'LIVE' && run.manychat && !run.manychat.postUrl && !draft.selected.includes('instagram') && !sourceInstagramPublication?.candidates?.length) throw new Error('ManyChat: select Instagram in this run, or paste the exact Instagram post URL in Compose.');
    if (sourceInstagramPublication) run.sourceInstagramPublication = structuredClone(sourceInstagramPublication);
    this.runs.unshift(run);
    // Keep all unresolved runs; never silently discard ambiguous publication evidence.
    if (this.runs.length > 30) this.runs = this.runs.filter((r, i) => i < 30 || r.items.some(item => item.status === 'uncertain'));
    await this.change();
    this.process(run).catch(error => this.emit('workerError', error));
    return run;
  }
  async control(action) {
    const run = this.active;
    if (!run) throw new Error('There is no active run.');
    if (action === 'pause' && run.status === 'running') run.status = 'pausing';
    else if (action === 'resume' && run.status === 'paused') run.status = 'running';
    else if (action === 'continue' && run.status === 'attention') {
      const item = run.items.find(i => i.status === 'attention');
      if (item) item.status = 'queued';
      run.status = 'running';
    } else if (action === 'done' && run.status === 'awaiting_manual') {
      const item = run.items.find(i => i.status === 'awaiting_manual');
      item.status = 'posted'; item.finishedAt = new Date().toISOString(); item.message = 'ManyChat update confirmed by operator.';
      run.status = run.pauseAfterManual ? 'paused' : 'running';
      delete run.pauseAfterManual;
      try { await this.snapshot(run, item, await this.browser.page(item.id), 'operator-confirmed'); } catch { /* Operator confirmation remains authoritative for this manual step. */ }
    } else if (action === 'stop') {
      run.status = 'stopping';
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
  async resolve(runId, id, resolution) {
    if (!['posted', 'failed', 'skipped'].includes(resolution)) throw new Error('Invalid resolution.');
    const run = this.runs.find(r => r.id === runId);
    const item = run?.items.find(i => i.id === id && i.status === 'uncertain');
    if (!item) throw new Error('Only an uncertain result can be resolved manually.');
    item.status = resolution; item.message = `Operator verified outcome: ${resolution === 'failed' ? 'not published; may retry' : resolution}.`;
    if (resolution === 'posted') await this.advanceReplies(run, item);
    await this.change();
  }
  async snapshot(run, item, page, label, errorHtml = false, target = page) {
    if (item.id === 'whatsapp') {
      // Never persist personal chat lists, full WhatsApp DOM, QR codes, or an
      // unknown recipient. Successful captures are limited to our own composer.
      if (errorHtml) return;
      const expected = (run.config || this.settings)?.platforms.whatsapp?.channelName;
      const heading = page.getByTestId('conversation-panel-wrapper').getByTestId('conversation-info-header-chat-title');
      if (!expected || await heading.count() !== 1 || (await heading.innerText()).trim() !== expected) return;
      if (target === page) target = page.getByTestId('conversation-header');
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
  async process(run) {
    if (this.processing) return;
    this.processing = true;
    try {
      const whatsapp = run.items.find(item => item.id === 'whatsapp' && item.status === 'queued');
      if (whatsapp && run.status !== 'stopping') {
        await this.log(run, whatsapp, 'Checking WhatsApp session, exact channel link and unsent drafts before any destination runs…');
        let checked;
        try {
          const page = await this.browser.page('whatsapp');
          checked = await this.loginChecker({ page, id: 'whatsapp', config: run.config, requireEmpty: true, step: message => this.log(run, whatsapp, message) });
        } catch (error) { checked = { status: 'needs_attention', message: error.message }; }
        this.login.items.whatsapp = { ...checked, checkedAt: new Date().toISOString() };
        if (checked.status !== 'verified' && run.status !== 'stopping') {
          whatsapp.status = 'attention'; whatsapp.message = checked.message; run.status = 'attention'; await this.change(); return;
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
        item.status = 'running'; item.startedAt = new Date().toISOString(); delete item.finishedAt;
        await this.change();
        let page, timer;
        try {
          await verifyMediaIntegrity(run.media, this.dataDir);
          page = await this.browser.page(item.id);
          const deadline = item.id === 'whatsapp' ? this.whatsappDeadline : this.deadline;
          const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => { reject(new Error(`Preparation exceeded ${Math.round(deadline / 1000)} seconds. Inspect the worker browser before continuing.`)); page.close().catch(() => {}); }, deadline);
          });
          const result = await Promise.race([this.runner({
            page, id: item.id, config: run.config, caption: run.captions[item.id], files: run.media.map(m => path.join(this.dataDir, 'uploads', m.filename)),
            mode: run.mode, confirmedLive: run.confirmedLive,
            manychat: run.manychat, instagramCaption: run.captions.instagram,
            instagramPublication: run.items.find(i => i.id === 'instagram' && i.status === 'posted')?.publication || run.sourceInstagramPublication,
            captureInstagramPost: run.items.some(i => i.id === 'manychat') && !run.manychat?.postUrl,
            step: message => this.log(run, item, message), snapshot: (label, target = page) => this.snapshot(run, item, page, label, false, target),
            recordPreparation: async details => { item.preparation = details; await this.change(); },
            markSubmitting: async () => { item.submitting = true; await this.change(); }
          }), timeout]);
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
            if (result?.publication) item.publication = result.publication;
            item.message = item.status === 'posted' ? item.id === 'manychat' ? 'Automation activated; Edit and Stop controls confirmed.' : 'Published and confirmed by platform.' : item.id === 'manychat' ? 'TEST complete · automation prepared; Go live was not clicked.' : 'TEST complete · nothing published.';
            if (item.status === 'posted') await this.advanceReplies(run, item);
          }
          if (item.status !== 'awaiting_manual') item.finishedAt = new Date().toISOString();
        } catch (originalError) {
          clearTimeout(timer);
          let error = originalError;
          if (!item.submitting && page && !page.isClosed()) {
            try { await assertNoChallenge(page); } catch (challenge) { error = challenge; }
          }
          item.status = item.submitting ? 'uncertain' : 'failed';
          const message = error.message.replace(/\u001b\[[0-9;]*m/g, '');
          item.message = item.submitting ? `Publication may have occurred. Verify on the platform before retrying. ${message}` : message;
          item.finishedAt = new Date().toISOString();
          if (!item.submitting && run.status !== 'stopping' && (error instanceof InterventionError || error instanceof NetworkError)) {
            item.status = 'attention'; run.status = 'attention';
          }
          if (page && !page.isClosed()) { try { await this.snapshot(run, item, page, 'error', true); } catch { /* Browser may already be gone. */ } }
          await this.log(run, item, item.message);
        }
        await this.change();
      }
    } finally {
      this.processing = false; this.emit('change', this.state());
      const pending = this.pendingKick; this.pendingKick = null;
      if (pending && this.active === pending && ['running', 'stopping'].includes(pending.status)) this.process(pending).catch(error => this.emit('workerError', error));
    }
  }
  async checkLogins(config, selected, saveDetected = async () => {}) {
    if (this.active || this.login.running || this.processing || this.browser.manualProcess) throw new Error('Finish the current run or login check, and close any manual sign-in window first.');
    this.login = { running: true, items: { ...this.login.items } }; this.emit('change', this.state());
    try {
      for (const id of selected) {
        this.login.items[id] = { status: 'checking', message: 'Opening the worker browser…' }; this.emit('change', this.state());
        let page;
        try {
          page = await this.browser.page(id);
          this.login.items[id] = await this.loginChecker({ page, id, config, step: async message => { this.login.items[id].message = message; this.emit('change', this.state()); } });
          if (this.login.items[id].detectedSettings) await saveDetected(id, this.login.items[id].detectedSettings);
        } catch (error) { this.login.items[id] = { status: error instanceof NetworkError ? 'network_error' : error instanceof InterventionError ? 'needs_login' : 'verification_failed', message: error.message }; }
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
