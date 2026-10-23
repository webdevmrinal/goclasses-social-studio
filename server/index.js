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
import { mediaFor, selectionErrors, metadataNeedsReview, metadataConsentValid } from '../shared/media.js';
import {discoverPhones} from './android-devices.js';
import {PhoneTools} from './phone-tools.js';
import {captionReviewAccepted} from '../shared/caption-review.js';
import { InstagramAndroidWorker } from './automation/instagram-android.js';
import { instagramOptions, usesInstagramAndroid, instagramMusicEnabled } from '../shared/instagram.js';
import { destinationReadiness } from '../shared/readiness.js';
import { UpdateBridge } from './updates.js';

export async function createApp({ browser = new BrowserManager(), dataDir = DATA, securityOptions, queueOptions = {}, updateBridge = new UpdateBridge(), phoneTools = new PhoneTools({home:process.env.STUDIO_HOME||ROOT}) } = {}) {
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
  app.get('/api/session', (req, res) => res.json({ authenticated: security.authenticated(req), protected: security.enabled, author: 'Mrinal', revision:process.env.STUDIO_REVISION||'' }));
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
  const instagramWorker=new InstagramAndroidWorker({dataDir});await instagramWorker.init();
  const queue = new Queue(browser, { dataDir, instagramWorker, ...queueOptions });
  queue.settings = config;
  await phoneTools.configure(config.androidDevice);
  phoneTools.canRefresh=()=>!queue.active&&!queue.processing&&!queue.login.running&&!instagramWorker.busy;
  phoneTools.on('change',()=>queue.emit('change',queue.state()));
  const studioState=()=>{const state=queue.state();return {...state,workerBusy:state.workerBusy||phoneTools.scanning||phoneTools.pairing===true,phone:phoneTools.state()};};
  await queue.init();
  queue.updateState=updateBridge.state;
  updateBridge.on('change',state=>{queue.updateState=state;queue.maintenance=['installing','restarting'].includes(state.phase);queue.emit('change',queue.state());});
  app.use('/api',(req,res,next)=>queue.maintenance&&!['GET','HEAD','OPTIONS'].includes(req.method)&&!req.path.startsWith('/updates')?res.status(409).json({error:'An app update is being prepared. Wait for it to finish.'}):next());
  app.get('/api/updates',(req,res)=>res.json(updateBridge.state));
  app.post('/api/updates/check',async(req,res)=>res.json(await updateBridge.request('check')));
  app.post('/api/updates/apply',async(req,res)=>{
    if(queue.active||queue.processing||queue.login.running||browser.manualProcess||instagramWorker.busy||queue.instagramWorker?.busy||phoneTools.scanning||phoneTools.pairing||phoneTools.screen.opening||queue.maintenance)return res.status(409).json({error:'Finish or stop the current run, login check or music picker before updating.'});
    if(!updateBridge.state.available)return res.status(400).json({error:'Check for an available update first.'});
    queue.maintenance=true;try{await updateBridge.request('apply');res.status(202).json({ok:true});}catch(error){queue.maintenance=false;throw error;}
  });
  instagramWorker.onProgress=()=>queue.emit('change',queue.state());
  queue.on('workerError', error => console.error('Worker error:', error));
  const xLength = text => twitterText.parseTweet(text).weightedLength;
  app.get('/api/bootstrap', (req, res) => res.json({ config, media, ...studioState(), author: 'Mrinal', protected: security.enabled,revision:process.env.STUDIO_REVISION||'',capabilities:{instagramAndroid:process.platform==='win32'} }));
  app.get('/api/android/devices',async(req,res)=>res.json({devices:await discoverPhones()}));
  const requirePhoneIdle=()=>{if(queue.processing||queue.login.running||instagramWorker.busy||phoneTools.scanning||phoneTools.pairing)throw Object.assign(Error('Finish the current activity before scanning or pairing phones.'),{status:409});};
  app.post('/api/android/scan',async(req,res)=>{requirePhoneIdle();await phoneTools.scan(config.androidDevice);res.json(phoneTools.state());});
  app.post('/api/android/pair',async(req,res)=>{requirePhoneIdle();await phoneTools.pair(req.body.address,req.body.code,config.androidDevice);res.json(phoneTools.state());});
  app.post('/api/android/screen',async(req,res)=>{res.json(await phoneTools.show(config.androidDevice));});
  app.post('/api/android/screen/close',async(req,res)=>{await phoneTools.screen.close();res.json(phoneTools.state());});
  app.use('/api',(req,res,next)=>{if((phoneTools.scanning||phoneTools.pairing)&&req.method!=='GET'&&/^\/(runs|config|logins|instagram\/music)/.test(req.path))return res.status(409).json({error:'Wait for the phone connection check to finish.'});next();});
  app.get('/api/status', (req, res) => res.json(studioState()));
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = state => res.write(`data: ${JSON.stringify({...state,workerBusy:state.workerBusy||phoneTools.scanning||phoneTools.pairing===true,phone:phoneTools.state()})}\n\n`);
    send(queue.state()); queue.on('change', send);
    const heartbeat = setInterval(() => {
      if (!security.authenticated(req)) { res.write('event: expired\ndata: {}\n\n'); res.end(); }
      else res.write(': keep-alive\n\n');
    }, 20000);
    req.on('close', () => { clearInterval(heartbeat); queue.off('change', send); });
  });
  app.put('/api/config', async (req, res) => {
    if (queue.active || queue.login.running || queue.processing || browser.manualProcess || instagramWorker.busy || phoneTools.screen.opening) return res.status(409).json({ error: 'Finish the current run or login check before changing account settings.' });
    const updated = validateConfig(req.body);
    await atomicWrite(path.join(dataDir, 'config.json'), updated);
    for (const id of Object.keys(updated.platforms)) {
      if (JSON.stringify(config.platforms[id]) !== JSON.stringify(updated.platforms[id])) delete queue.login.items[id];
    }
    if(JSON.stringify(config.androidDevice)!==JSON.stringify(updated.androidDevice)){delete queue.login.items.instagramNative;if(queue.login.items.instagram?.transport==='android')delete queue.login.items.instagram;}
    config = updated; queue.settings = config; await phoneTools.configure(config.androidDevice); if(config.androidDevice.type==='phone')await phoneTools.refresh(); queue.emit('change', queue.state()); res.json(config);
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
    if(draft.selected.some(id=>['instagram','instagramStory','instagramMusic'].includes(id))){
      const options=instagramOptions({...draft.instagram,story:{...draft.instagram?.story,enabled:draft.selected.includes('instagramStory')}});
      if(process.platform!=='win32'&&(draft.selected.some(id=>usesInstagramAndroid(options,id))||draft.selected.includes('instagram')&&options.music.enabled))throw new Error('Android posting and Story sharing need the configured Windows worker. Choose Web for feed posting on this Mac.');
      if(options.music.enabled&&options.music.source==='picker')options.music.selection=instagramWorker.selection(options.music.selection,config.platforms.instagram.handle);
      draft.instagram=options;
    }
    if (draft.selected?.includes('manychat')) validateManychatDraft(draft.manychat, draft.captions?.manychat);
    if (errors.length) throw new Error(errors.join('\n'));
    const usedIds = new Set(draft.selected.flatMap(id => mediaFor(draft, selectedMedia, id).map(m => m.id)));
    const usedMedia = selectedMedia.filter(m => usedIds.has(m.id));
    await verifyMediaIntegrity(usedMedia, dataDir);
    return usedMedia;
  };
  app.post('/api/readiness', (req, res) => {
    const selectedMedia = libraryFor(req.body);
    const destinations=destinationReadiness(req.body,selectedMedia,config,queue.login.items,xLength,queue.runs);
    for(const id of ['instagram','instagramStory']){
      if(process.platform!=='win32'&&(id==='instagramStory'&&req.body.selected?.includes(id)||id==='instagram'&&req.body.selected?.includes(id)&&(usesInstagramAndroid(req.body.instagram,id)||req.body.instagram?.music?.enabled))){destinations[id].ready=false;destinations[id].errors.push('Android posting and Story sharing require the configured Windows worker.');}
      if(!instagramMusicEnabled(req.body.instagram,id)||!req.body.selected?.includes(id))continue;
      try{if(!['manual','details'].includes(req.body.instagram?.music?.source))instagramWorker.selection(req.body.instagram?.music?.selection,config.platforms.instagram.handle);}
      catch(error){destinations[id].ready=false;destinations[id].errors.push(error.message);}
    }
    for(const item of Object.values(destinations))item.errors=[...new Set(item.errors)];
    res.json({destinations});
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
    if(mode==='LIVE'&&!metadataConsentValid(metadataNeedsReview(draft,selectedMedia),req.body.metadataConsent))return res.status(409).json({error:'Review the embedded origin metadata before publishing. Clean the selected images or explicitly keep the originals.'});
    if(mode==='LIVE'&&!captionReviewAccepted(draft,req.body.captionConsent))return res.status(409).json({error:'Review the caption facts before publishing. Check conflicting numbers, dates and possible numeric typos.'});
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
    const retryDraft = { selected, captions: original.captions, manychat: original.manychat, mediaIds: original.media.map(m => m.id), mediaByPlatform: original.mediaByPlatform, instagram:structuredClone(original.instagram||{}) };
    if(selected.includes('instagramStory')&&!selected.includes('instagram')&&sourceInstagramPublication?.postUrl)retryDraft.instagram.story.sourcePostUrl=sourceInstagramPublication.postUrl;
    const draftErrors = validateDraft(retryDraft, original.media, xLength);
    if (draftErrors.length) return res.status(400).json({ error: draftErrors.join('\n') });
    if(req.body.mode==='LIVE'&&!metadataConsentValid(metadataNeedsReview(retryDraft,original.media),req.body.metadataConsent))return res.status(409).json({error:'Review the embedded origin metadata before this live retry. Clean in Compose or explicitly keep the originals.'});
    if(req.body.mode==='LIVE'&&!captionReviewAccepted(retryDraft,req.body.captionConsent))return res.status(409).json({error:'Review the saved caption facts before this live retry.'});
    const run = await queue.start({ draft: retryDraft, config, mode: req.body.mode || 'TEST', confirmation: req.body.confirmation, media: original.media, retryOf: original.id, sourceInstagramPublication });
    res.status(201).json({ id: run.id });
  });
  const requireIdle=()=>{if(queue.maintenance||queue.active||queue.processing||queue.login.running||browser.manualProcess)throw new Error('Finish the current run or login check first.');};
  app.post('/api/instagram/music/open',async(req,res)=>{
    requireIdle();if(instagramWorker.busy)throw new Error('Close the existing music picker first.');
    const images=libraryFor({mediaIds:req.body.mediaIds});
    if(!images.length)throw new Error('Upload and select the Instagram images before choosing music.');
    await verifyMediaIntegrity(images,dataDir);requireIdle();if(instagramWorker.busy)throw new Error('Close the existing music picker first.');
    try{const result=await instagramWorker.startPicker(config,images.map(image=>path.join(dataDir,'uploads',image.filename)));res.json(result);}
    finally{queue.emit('change',queue.state());}
  });
  app.post('/api/instagram/music/search',async(req,res)=>{requireIdle();res.json(await instagramWorker.query(req.body.query));});
  app.post('/api/instagram/music/more',async(req,res)=>{requireIdle();res.json(await instagramWorker.more());});
  app.post('/api/instagram/music/pause',async(req,res)=>{requireIdle();res.json(await instagramWorker.pause());});
  app.post('/api/instagram/music/preview',async(req,res)=>{requireIdle();res.json(await instagramWorker.preview(req.body.key));});
  app.post('/api/instagram/music/select',async(req,res)=>{requireIdle();try{res.json(await instagramWorker.choose(req.body.key));}finally{queue.emit('change',queue.state());}});
  app.post('/api/instagram/music/close',async(req,res)=>{requireIdle();try{await instagramWorker.cancelPicker();res.json({ok:true});}finally{queue.emit('change',queue.state());}});
  app.post('/api/runs/:id/kill',async(req,res)=>{await queue.control('kill',req.params.id);res.json({ok:true});});
  app.post('/api/android/intervention', async (req,res)=>{res.json(await queue.interventions.act(req.body));});
  app.post('/api/control', async (req, res) => { await queue.control(req.body.action); res.json({ ok: true }); });
  app.post('/api/runs/:id/resolve', async (req, res) => { await queue.resolve(req.params.id, req.body.platform, req.body.resolution, req.body.publication); res.json({ ok: true }); });
  app.post('/api/logins', (req, res) => {
    const selected = req.body.selected;
    let instagram;try{instagram=instagramOptions(req.body.instagram);}catch(error){return res.status(400).json({error:error.message});}
    if (!Array.isArray(selected) || !selected.length || selected.length > PLATFORMS.length || new Set(selected).size !== selected.length || selected.some(id => !PLATFORMS.some(p => p.id === id))) return res.status(400).json({ error: 'Select valid destinations to check.' });
    if (queue.active || queue.login.running || queue.processing || browser.manualProcess || instagramWorker.busy) return res.status(409).json({ error: 'Finish the current run or login check first.' });
    queue.checkLogins(config, selected, async (id, detected) => {
      const updated = structuredClone(config);
      const field = id.startsWith('youtube') ? 'channelId' : id === 'x' ? 'handle' : null;
      if (!field || updated.platforms[id][field] || typeof detected[field] !== 'string') return;
      updated.platforms[id][field] = detected[field];
      const valid = validateConfig(updated);
      await atomicWrite(path.join(dataDir, 'config.json'), valid);
      config = valid; queue.settings = config;
    },{instagram}).catch(error => console.error(error)); res.status(202).json({ ok: true });
  });
  app.post('/api/manual-login', async (req, res) => {
    if (queue.active || queue.login.running || queue.processing || browser.manualProcess || instagramWorker.busy) return res.status(409).json({ error: 'Finish the current run or login check first.' });
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
    res.status(error.status===409?409:error instanceof multer.MulterError ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 20 MB or smaller.' : error.message || 'The request could not be completed.' });
  });
  return { app, queue, phoneTools, browser };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  if ((host !== '127.0.0.1' && host !== 'localhost' || process.env.APP_ORIGIN) && (process.env.APP_PASSWORD || '').length < 16) throw new Error('Shared access requires APP_PASSWORD with at least 16 characters. Set it in .env first.');
  const { app, queue, browser, phoneTools } = await createApp();
  const server = app.listen(port, host, () => console.log(`\nGO Classes Social Studio Â· Created by Mrinal\nhttp://${host}:${port}\nTEST mode is always the default.\n`));
  let closing = false;
  const shutdown = async () => {
    if (closing) return; closing = true;
    console.log('Saving run state and closing the worker browserâ€¦');
    server.close();
    // Keep the persisted in-flight state intact: init() will require an operator review.
    await queue.persist(); await phoneTools.close(); await browser.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  process.on('message',message=>{if(message.type==='studio-shutdown'&&!queue.active&&!queue.processing&&!queue.login.running&&!browser.manualProcess&&!queue.instagramWorker?.busy)shutdown();});
}
