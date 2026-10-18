// Copyright (c) 2026 Mrinal. All rights reserved.
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import twitterText from 'twitter-text';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DATA, defaults, atomicWrite, readJson, validateConfig, setupErrors } from './config.js';
import { PLATFORMS, validateDraft } from '../shared/platforms.js';
import { createSecurity } from './security.js';
import { BrowserManager } from './automation/browser.js';
import { Queue } from './queue.js';
import { destinationUrl } from './automation/platforms.js';
import { validateManychatDraft } from '../shared/manychat.js';
import { inspectImage, cleanImage, verifyMediaIntegrity } from './image-metadata.js';
import { mediaFor, selectionErrors } from '../shared/media.js';
import { destinationReadiness } from '../shared/readiness.js';

export async function createApp({ browser = new BrowserManager(), dataDir = DATA, securityOptions, queueOptions = {} } = {}) {
  await fs.mkdir(path.join(dataDir, 'uploads'), { recursive: true });
  await fs.mkdir(path.join(dataDir, 'incoming'), { recursive: true });
  const app = express();
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'blob:', 'data:'], connectSrc: ["'self'"], upgradeInsecureRequests: null } }, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '200kb' }));
  const security = createSecurity(securityOptions ?? { password: process.env.APP_PASSWORD, origin: process.env.APP_ORIGIN, secureCookie: process.env.COOKIE_SECURE === 'true' });
  app.use((req, res, next) => {
    if (!security.enabled && !['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) return res.status(403).json({ error: 'Set APP_PASSWORD before sharing this worker.' });
    next();
  });
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, security.checkOrigin);
  app.get('/api/session', (req, res) => res.json({ authenticated: security.authenticated(req), protected: security.enabled, author: 'Mrinal' }));
  app.post('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false }), security.login);
  app.use('/api', security.requireAuth);
  app.post('/api/logout', security.logout);
  app.use('/media', security.requireAuth, express.static(path.join(dataDir, 'uploads'), { dotfiles: 'deny', index: false, setHeaders: res => res.set('Cache-Control', 'private, no-store') }));
  app.use('/artifacts', security.requireAuth, (req, res, next) => {
    if (!/\.png$/.test(req.path)) return res.status(404).end();
    res.set('Cache-Control', 'private, no-store'); next();
  }, express.static(path.join(dataDir, 'logs'), { dotfiles: 'deny', index: false }));

  let config = validateConfig(await readJson(path.join(dataDir, 'config.json'), defaults));
  let media = await readJson(path.join(dataDir, 'media.json'), []);
  let mediaWrite = Promise.resolve();
  const queue = new Queue(browser, { dataDir, ...queueOptions });
  queue.settings = config;
  await queue.init();
  queue.on('workerError', error => console.error('Worker error:', error));
  const xLength = text => twitterText.parseTweet(text).weightedLength;
  app.get('/api/bootstrap', (req, res) => res.json({ config, media, ...queue.state(), author: 'Mrinal', protected: security.enabled }));
  app.get('/api/status', (req, res) => res.json(queue.state()));
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = state => res.write(`data: ${JSON.stringify(state)}\n\n`);
    send(queue.state()); queue.on('change', send);
    const heartbeat = setInterval(() => {
      if (!security.authenticated(req)) { res.write('event: expired\ndata: {}\n\n'); res.end(); }
      else res.write(': keep-alive\n\n');
    }, 20000);
    req.on('close', () => { clearInterval(heartbeat); queue.off('change', send); });
  });
  app.put('/api/config', async (req, res) => {
    if (queue.active || queue.login.running || queue.processing || browser.manualProcess) return res.status(409).json({ error: 'Finish the current run or login check before changing account settings.' });
    const updated = validateConfig(req.body);
    await atomicWrite(path.join(dataDir, 'config.json'), updated);
    for (const id of Object.keys(updated.platforms)) {
      if (JSON.stringify(config.platforms[id]) !== JSON.stringify(updated.platforms[id])) delete queue.login.items[id];
    }
    config = updated; queue.settings = config; queue.emit('change', queue.state()); res.json(config);
  });
  const upload = multer({ dest: path.join(dataDir, 'incoming'), limits: { fileSize: 20 * 1024 * 1024, files: 10, fields: 0, parts: 10 }, fileFilter: (req, file, cb) => cb(['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? null : new Error('Choose JPG, PNG, or WEBP images.'), true) });
  app.post('/api/upload', (req, res, next) => upload.array('images', 10)(req, res, error => { if (error) next(error); else next(); }), async (req, res) => {
    const created = [];
    try {
      if (!req.files?.length) throw new Error('Choose at least one image.');
      for (const file of req.files) {
        const buffer = await fs.readFile(file.path), checked = await inspectImage(buffer), { metadata } = checked;
        const id = randomUUID(), filename = `${id}.${metadata.format === 'jpeg' ? 'jpg' : metadata.format}`;
        await fs.writeFile(path.join(dataDir, 'uploads', filename), buffer);
        created.push({ id, filename, name: path.basename(file.originalname), size: buffer.length, width: metadata.width, height: metadata.height, originalSize: file.size, url: `/media/${filename}`, format: metadata.format, preservedOriginal: true, fileHash: checked.fileHash, metadata: checked.report });
      }
      media.push(...created);
      const mediaSnapshot = structuredClone(media);
      mediaWrite = mediaWrite.then(() => atomicWrite(path.join(dataDir, 'media.json'), mediaSnapshot));
      await mediaWrite;
      res.status(201).json({ media: created });
    } catch (error) {
      for (const m of created) await fs.rm(path.join(dataDir, 'uploads', m.filename), { force: true });
      throw error;
    } finally { for (const file of req.files || []) await fs.rm(file.path, { force: true }); }
  });
  app.get('/api/media/:id/metadata', async (req, res) => {
    const item = media.find(m => m.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Image not found.' });
    const checked = await inspectImage(await fs.readFile(path.join(dataDir, 'uploads', item.filename)));
    if (item.fileHash && checked.fileHash !== item.fileHash) throw new Error('The image changed after upload. Upload the original again.');
    item.metadata = checked.report;
    res.json({ media: item });
  });
  app.post('/api/media/:id/clean', async (req, res) => {
    const original = media.find(m => m.id === req.params.id);
    if (!original) return res.status(404).json({ error: 'Image not found.' });
    const buffer = await fs.readFile(path.join(dataDir, 'uploads', original.filename));
    if (original.fileHash && original.fileHash !== (await inspectImage(buffer)).fileHash) throw new Error('The image changed after upload. Upload the original again.');
    const cleaned = await cleanImage(buffer), id = randomUUID(), filename = `${id}.${cleaned.metadata.format === 'jpeg' ? 'jpg' : cleaned.metadata.format}`;
    await fs.writeFile(path.join(dataDir, 'uploads', filename), cleaned.buffer);
    const item = { ...original, id, filename, url: `/media/${filename}`, sourceId: original.id, format: cleaned.metadata.format, size: cleaned.buffer.length, fileHash: cleaned.fileHash, metadata: cleaned.report, sourceMetadata: cleaned.sourceReport, verification: cleaned.verification };
    media.push(item); const snapshot = structuredClone(media); mediaWrite = mediaWrite.then(() => atomicWrite(path.join(dataDir, 'media.json'), snapshot)); await mediaWrite;
    res.status(201).json({ media: item });
  });
  const libraryFor = draft => {
    if (!Array.isArray(draft?.mediaIds) || draft.mediaIds.length > 10 || new Set(draft.mediaIds).size !== draft.mediaIds.length) throw new Error('Choose up to 10 unique images.');
    const selectedMedia = draft.mediaIds.map(id => media.find(m => m.id === id));
    if (selectedMedia.some(m => !m)) throw new Error('An image is no longer available. Upload it again.');
    const structureErrors = selectionErrors(draft);
    if (Object.keys(draft.mediaByPlatform || {}).some(id => !PLATFORMS.some(p => p.id === id))) structureErrors.push('Unknown destination image selection.');
    if (structureErrors.length) throw new Error(structureErrors.join('\n'));
    return selectedMedia;
  };
  const checkDraft = async draft => {
    const selectedMedia = libraryFor(draft);
    const errors = validateDraft(draft, selectedMedia, xLength);
    if (draft.selected?.includes('manychat')) validateManychatDraft(draft.manychat, draft.captions?.manychat);
    if (errors.length) throw new Error(errors.join('\n'));
    const usedIds = new Set(draft.selected.flatMap(id => mediaFor(draft, selectedMedia, id).map(m => m.id)));
    const usedMedia = selectedMedia.filter(m => usedIds.has(m.id));
    await verifyMediaIntegrity(usedMedia, dataDir);
    return usedMedia;
  };
  app.post('/api/readiness', (req, res) => {
    const selectedMedia = libraryFor(req.body);
    res.json({ destinations: destinationReadiness(req.body, selectedMedia, config, queue.login.items, xLength, queue.runs) });
  });
  app.post('/api/validate', async (req, res) => {
    await checkDraft(req.body);
    res.json({ valid: true, setupErrors: setupErrors(config, req.body.selected), xLength: xLength(req.body.captions.x || '') });
  });
  app.post('/api/runs', async (req, res) => {
    const { draft, mode, confirmation } = req.body;
    const selectedMedia = await checkDraft(draft);
    const errors = setupErrors(config, draft.selected);
    const readiness = destinationReadiness(draft, selectedMedia, config, queue.login.items, xLength, queue.runs);
    for (const id of draft.selected) errors.push(...readiness[id].errors);
    if (errors.length) return res.status(400).json({ error: errors.join('\n') });
    const run = await queue.start({ draft, config, mode, confirmation, media: selectedMedia });
    res.status(201).json({ id: run.id });
  });
  app.post('/api/runs/:id/retry', async (req, res) => {
    const original = queue.runs.find(run => run.id === req.params.id);
    if (!original) return res.status(404).json({ error: 'Run not found.' });
    const failed = original.items.filter(item => item.status === 'failed').map(item => item.id);
    if (req.body.platform !== undefined && !failed.includes(req.body.platform)) return res.status(400).json({ error: 'Only a failed destination can be retried. Verify uncertain outcomes first.' });
    const selected = req.body.platform ? [req.body.platform] : failed;
    if (!selected.length) return res.status(400).json({ error: 'There are no failed destinations to retry. Verify uncertain results on the platform first.' });
    const errors = setupErrors(config, selected);
    if (errors.length) return res.status(400).json({ error: errors.join('\n') });
    const instagramItem = original.items.find(item => item.id === 'instagram' && item.status === 'posted');
    const sourceInstagramPublication = instagramItem?.publication || original.sourceInstagramPublication;
    const retryDraft = { selected, captions: original.captions, manychat: original.manychat, mediaIds: original.media.map(m => m.id), mediaByPlatform: original.mediaByPlatform };
    const draftErrors = validateDraft(retryDraft, original.media, xLength);
    if (draftErrors.length) return res.status(400).json({ error: draftErrors.join('\n') });
    const run = await queue.start({ draft: retryDraft, config, mode: req.body.mode || 'TEST', confirmation: req.body.confirmation, media: original.media, retryOf: original.id, sourceInstagramPublication });
    res.status(201).json({ id: run.id });
  });
  app.post('/api/control', async (req, res) => { await queue.control(req.body.action); res.json({ ok: true }); });
  app.post('/api/runs/:id/resolve', async (req, res) => { await queue.resolve(req.params.id, req.body.platform, req.body.resolution, req.body.publication); res.json({ ok: true }); });
  app.post('/api/logins', (req, res) => {
    const selected = req.body.selected;
    if (!Array.isArray(selected) || !selected.length || selected.length > PLATFORMS.length || new Set(selected).size !== selected.length || selected.some(id => !PLATFORMS.some(p => p.id === id))) return res.status(400).json({ error: 'Select valid destinations to check.' });
    if (queue.active || queue.login.running || queue.processing || browser.manualProcess) return res.status(409).json({ error: 'Finish the current run or login check first.' });
    queue.checkLogins(config, selected, async (id, detected) => {
      const updated = structuredClone(config);
      const field = id.startsWith('youtube') ? 'channelId' : id === 'x' ? 'handle' : null;
      if (!field || updated.platforms[id][field] || typeof detected[field] !== 'string') return;
      updated.platforms[id][field] = detected[field];
      const valid = validateConfig(updated);
      await atomicWrite(path.join(dataDir, 'config.json'), valid);
      config = valid; queue.settings = config;
    }).catch(error => console.error(error)); res.status(202).json({ ok: true });
  });
  app.post('/api/manual-login', async (req, res) => {
    if (queue.active || queue.login.running || queue.processing || browser.manualProcess) return res.status(409).json({ error: 'Finish the current run or login check first.' });
    const id = req.body.platform;
    if (!PLATFORMS.some(p => p.id === id)) return res.status(400).json({ error: 'Choose a valid destination.' });
    queue.login.running = true; queue.emit('change', queue.state());
    try {
      const label = await browser.manualLogin(destinationUrl(id, config));
      queue.login.items[id] = { status: 'manual_login', message: `Sign in using ${label}, then close that separate browser window completely. Return here and click Open & check to connect the saved session.` };
      res.json({ ok: true, browser: label });
    } finally { queue.login.running = false; queue.emit('change', queue.state()); }
  });
  app.use('/vendor/webawesome', express.static(path.join(ROOT, 'node_modules/@awesome.me/webawesome/dist-cdn'), { dotfiles: 'deny', index: false }));
  app.use('/shared', express.static(path.join(ROOT, 'shared')));
  app.use(express.static(path.join(ROOT, 'client'), { etag: true }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((error, req, res, next) => {
    console.error(error.message);
    if (res.headersSent) return next(error);
    res.status(error instanceof multer.MulterError ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 20 MB or smaller.' : error.message || 'The request could not be completed.' });
  });
  return { app, queue, browser };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  if ((host !== '127.0.0.1' && host !== 'localhost' || process.env.APP_ORIGIN) && (process.env.APP_PASSWORD || '').length < 16) throw new Error('Shared access requires APP_PASSWORD with at least 16 characters. Set it in .env first.');
  const { app, queue, browser } = await createApp();
  const server = app.listen(port, host, () => console.log(`\nGO Classes Social Studio · Created by Mrinal\nhttp://${host}:${port}\nTEST mode is always the default.\n`));
  let closing = false;
  const shutdown = async () => {
    if (closing) return; closing = true;
    console.log('Saving run state and closing the worker browser…');
    server.close();
    // Keep the persisted in-flight state intact: init() will require an operator review.
    await queue.persist(); await browser.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
