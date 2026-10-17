// Social Studio — Created by Mrinal. Copyright (c) 2026 Mrinal.
import { PLATFORMS, countCharacters, parseCaptions } from '/shared/platforms.js';
import { DEFAULT_REPLY_MESSAGES, replyBatch, manychatLinks, validateManychatDraft } from '/shared/manychat.js';
import { mediaFor, mediaIdsFor } from '/shared/media.js';
import { destinationReadiness } from '/shared/readiness.js';
import { lucidePaths } from './icons.js';

const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  compose: '<path d="m16 3 5 5-11 11-6 1 1-6Z"/><path d="m14 5 5 5M3 7V4a1 1 0 0 1 1-1h5M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  settings: '<path d="m9 3-.6 2.3-2 .9L4 5.7 2 9l1.7 1.8v2.4L2 15l2 3.3 2.4-.5 2 .9L9 21h6l.6-2.3 2-.9 2.4.5 2-3.3-1.7-1.8v-2.4L22 9l-2-3.3-2.4.5-2-.9L15 3Z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 16-5-5L5 21"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  play: '<path d="m8 4 12 8L8 20Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  refresh: '<path d="M20 7V3l-4 4a8 8 0 1 0 3 10M16 7h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  external: '<path d="M14 3h7v7m-1-6-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  linkedin: '<path d="M5 10v10M5 5v.1M10 20V10m0 4a5 5 0 0 1 9 0v6"/>',
  x: '<path d="M4 3h4l12 18h-4ZM20 3l-7 8M4 21l7-8"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3Z"/>',
  message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1-5.5A8.5 8.5 0 1 1 21 11.5Z"/><path d="m7 13 3-4 3 4 4-4"/>',
  whatsapp: '<path d="M20 11.5a8 8 0 0 1-12 7L3 20l1.5-5a8 8 0 1 1 15.5-3.5Z"/><path d="m8 7 2 3-1 1c1 2 2 3 4 3l1-1 3 2c-1 3-4 2-7 0S6 8 8 7Z"/>',
  logout: '<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4m6-14 5 5-5 5M8 12h12"/>'
};
const icon = (name, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls}">${lucidePaths[name] || paths[name] || paths.info}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const blankCaptions = () => Object.fromEntries(PLATFORMS.map(p => [p.id, '']));
let draft;
try { draft = JSON.parse(localStorage.getItem('mrinal.social-studio.draft')); } catch { /* Storage may be unavailable in private browsing. */ }
draft = { captions: blankCaptions(), selected: PLATFORMS.map(p => p.id), mediaIds: [], ...draft };
draft.captions = { ...blankCaptions(), ...draft.captions };
draft.manychat = { postUrl: '', links: [], ...draft.manychat };
if (!Array.isArray(draft.manychat.links)) draft.manychat.links = [];
if (typeof draft.manychat.postUrl !== 'string') draft.manychat.postUrl = '';
draft.manychat.linksMode ||= draft.manychat.links.length ? 'manual' : 'auto';
draft.selected = Array.isArray(draft.selected) ? draft.selected.filter(id => PLATFORMS.some(p => p.id === id)) : [];
draft.mediaIds = Array.isArray(draft.mediaIds) ? draft.mediaIds : [];
draft.mediaByPlatform = draft.mediaByPlatform && typeof draft.mediaByPlatform === 'object' && !Array.isArray(draft.mediaByPlatform) ? draft.mediaByPlatform : {};
let theme = 'system';
try { theme = localStorage.getItem('mrinal.social-studio.theme') || 'system'; } catch { /* Use system appearance. */ }
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() { document.documentElement.dataset.theme = theme === 'system' ? systemTheme.matches ? 'dark' : 'light' : theme; document.querySelector('meta[name="theme-color"]').content = document.documentElement.dataset.theme === 'dark' ? '#101318' : '#f7f8fa'; }
applyTheme(); systemTheme.addEventListener('change', applyTheme);
let state = { config: null, media: [], runs: [], login: { running: false, items: {} }, protected: false };
let view = 'settings';
let captionTab = 'instagram';
let mode = 'TEST'; // Never restore LIVE mode from storage or server state.
let connected = false;
let events, pollTimer, saveTimer, sending = false, uploading = false, reviewValid = false;
let pendingMedia = [], mediaPreviewIndex = 0;
let cleaningMedia = null, lastMediaOrder = null;
let remoteReadiness = null, reviewDraft = null, reviewBlocked = [], readinessTimer, readinessVersion = 0;
const platformPreviewIndex = {};
const runExpansion = new Map();
const selectedMedia = () => draft.mediaIds.map(id => state.media.find(m => m.id === id)).filter(Boolean);
const composerMedia = () => [...selectedMedia(), ...pendingMedia];
const platformMedia = id => mediaFor(draft, selectedMedia(), id);
const readiness = () => remoteReadiness || destinationReadiness(draft, selectedMedia(), state.config, state.login.items, () => 0, state.runs);
const runnableIds = () => draft.selected.filter(id => readiness()[id]?.ready);
function renderReadiness() {
  const ready = readiness();
  document.querySelectorAll('[data-destination-status]').forEach(el => { const id = el.dataset.destinationStatus; el.textContent = !draft.selected.includes(id) ? 'Not selected' : ready[id].ready ? 'Ready for review' : 'Excluded · needs fixing'; el.classList.toggle('error-text', draft.selected.includes(id) && !ready[id].ready); });
  document.querySelectorAll('[data-editor-readiness]').forEach(el => { const item = ready[el.dataset.editorReadiness]; el.className = `destination-readiness ${item.ready ? 'ready' : 'blocked'}`; el.innerHTML = item.ready ? `${icon('check')} Ready for review` : `${icon('info')}<div><strong>Excluded from runs until fixed</strong><ul>${item.errors.map(error => `<li>${escape(error)}</li>`).join('')}</ul></div>`; });
  document.querySelectorAll('[data-caption-tab]').forEach(el => { el.classList.toggle('needs-fix', !ready[el.dataset.captionTab].ready); });
  const bar = document.querySelector('.actionbar'); if (bar) { const host = document.createElement('div'); host.innerHTML = actionbar(); bar.replaceWith(host.firstElementChild); }
}
async function refreshReadiness() {
  const stamp = JSON.stringify(draft), version = readinessVersion;
  try { const result = await api('/api/readiness', { method: 'POST', body: draft }); if (version === readinessVersion && stamp === JSON.stringify(draft)) { remoteReadiness = result.destinations; renderReadiness(); } } catch { /* Preview repeats this check and reports failures. */ }
}
const verifiedDestinations = () => PLATFORMS.filter(p => state.login.items[p.id]?.status === 'verified').map(p => p.id);
const activeRun = () => state.runs.find(r => ['running', 'pausing', 'paused', 'stopping', 'attention', 'awaiting_manual'].includes(r.status));
const workerBusy = () => state.workerBusy || Boolean(activeRun()) || state.login.running;
const platform = id => PLATFORMS.find(p => p.id === id);
const platformIcon = p => `<span class="platform-icon ${p.icon}">${icon(p.icon)}</span>`;
const bytes = size => size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.round(size / 1024)} KB`;
const prettyDate = date => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));
function toast(message, error = false) {
  const el = document.createElement('div'); el.className = `toast${error ? ' error' : ''}`;
  const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Dismiss notification'); close.innerHTML = icon('close'); close.onclick = () => el.remove();
  el.append(close, document.createTextNode(message)); document.querySelector('#toasts').append(el);
  const notifications = document.querySelector('#toasts'); while (notifications.children.length > 3) notifications.firstElementChild.remove();
  setTimeout(() => el.remove(), error ? 14000 : 5000);
}
async function api(url, { method = 'GET', body, ...options } = {}) {
  const response = await fetch(url, { method, credentials: 'same-origin', ...(body instanceof FormData ? { body } : body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), ...options });
  let data;
  try { data = await response.json(); } catch { throw new Error(`The worker returned an unreadable response (${response.status}).`); }
  if (response.status === 401 && url !== '/api/login') { showLogin(); throw new Error('Your workspace session expired. Sign in again.'); }
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}
function saveDraft() {
  reviewValid = false;
  reviewDraft = null; remoteReadiness = null;
  readinessVersion++;
  clearTimeout(readinessTimer); readinessTimer = setTimeout(refreshReadiness, 400);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem('mrinal.social-studio.draft', JSON.stringify(draft)); const el = document.querySelector('#draft-status'); if (el) el.textContent = 'Draft saved on this device'; }
    catch { const el = document.querySelector('#draft-status'); if (el) el.textContent = 'Draft is in memory · export to keep it'; }
  }, 350);
}
function shell() {
  const titles = { settings: 'Connections', compose: 'Compose', preview: 'Preview', activity: 'Activity' };
  app.innerHTML = `<div class="shell">
    <aside class="sidebar" aria-label="Workspace sidebar">
      <div class="brand"><div class="brand-mark" aria-hidden="true">G</div><div class="brand-text"><div class="brand-title">Social Studio<span class="hidden"> by Mrinal</span></div><div class="brand-caption">GO CLASSES</div></div></div>
      <div class="workspace-label">WORKSPACE</div>
      <nav class="navigation" aria-label="Main navigation">${Object.entries(titles).map(([id, title]) => `<button class="nav-item ${view === id ? 'active' : ''}" data-view="${id}" ${view === id ? 'aria-current="page"' : ''} title="${title}">${icon(id === 'preview' ? 'eye' : id === 'settings' ? 'settings' : id)}<span>${title}</span></button>`).join('')}</nav>
      <div class="sidebar-bottom"><div class="worker-card"><div class="worker-title"><span class="dot ${connected ? '' : 'offline'}"></span> Your publishing workspace</div><p>One browser. ${PLATFORMS.length} destinations.<br>A little more time for everything else.</p></div><div class="credit"><div class="avatar">M</div><div><p>Designed &amp; developed by</p><strong>Mrinal</strong></div></div></div>
    </aside>
    <div class="content"><header class="topbar"><div class="breadcrumbs">${icon('grid')}<span>Workspace</span>${icon('chevron')}<span>${titles[view]}</span></div><div class="mobile-brand"><div class="brand-mark">G</div><span>Social Studio<small class="mobile-author">Created by Mrinal</small></span></div><div class="top-actions"><button class="button subtle round theme-toggle" data-action="theme" aria-label="Appearance: ${theme}. Change theme" title="Appearance: ${theme}">${icon(theme === 'system' ? 'monitor' : theme === 'dark' ? 'moon' : 'sun')}</button><div class="connection"><span class="dot ${connected ? '' : 'offline'}"></span><span id="connection-label">${connected ? 'Worker connected' : 'Reconnecting to worker'}</span></div><span class="divider"></span>${state.protected ? `<button class="button subtle round" data-action="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button>` : ''}<div class="avatar" title="Created by Mrinal">M</div></div></header>
    <main id="main" class="main" tabindex="-1">${workflowSteps()}${page()}</main></div>
    ${actionbar()}
  </div>`;
  bindPage(); renderReadiness();
  const tab = document.querySelector(`[data-caption-tab="${captionTab}"]`), tabs = document.querySelector('.caption-tabs');
  if (tab && tabs) tabs.scrollLeft += tab.getBoundingClientRect().left - tabs.getBoundingClientRect().left - tabs.clientWidth / 2 + tab.clientWidth / 2;
}
function workflowSteps() {
  return `<nav class="workflow-steps" aria-label="Publishing steps"><button data-view="settings" class="${view === 'settings' ? 'current' : ''}"><span>1</span> Connect accounts</button>${icon('chevron')}<button data-view="compose" class="${view === 'compose' ? 'current' : ''}"><span>2</span> Compose posts</button>${icon('chevron')}<button data-view="preview" class="${view === 'preview' ? 'current' : ''}"><span>3</span> Review &amp; run</button></nav>`;
}
function page() {
  if (view === 'preview') return previewPage();
  if (view === 'activity') return activityPage();
  if (view === 'settings') return settingsPage();
  return composePage();
}
function footer() { return `<footer class="page-footer"><span>${icon('lock')} Your logins stay on the worker computer</span><span>GO Classes Social Studio · Created by Mrinal</span></footer>`; }
function composePage() {
  const media = composerMedia();
  mediaPreviewIndex = Math.max(0, Math.min(mediaPreviewIndex, media.length - 1));
  const heroImage = media[mediaPreviewIndex];
  return `<div class="hero"><div><div class="eyebrow">A little less busywork</div><h1>One idea. <span>Everywhere.</span></h1><p>Create once, make it your own for each platform.<br>Preview everything. Publish with confidence.</p></div><div class="hero-actions"><button class="button subtle" data-action="export" title="Export captions">${icon('download')}<span>Export</span></button><button class="button" data-action="import" title="Import all captions">${icon('upload')}<span>Import captions</span></button></div></div>
    ${mode === 'LIVE' ? liveBanner() : ''}
    <section aria-labelledby="destinations-title"><div class="section-heading"><h2 id="destinations-title"><span class="step-number">1</span> Choose your destinations</h2><small>${draft.selected.length} of ${PLATFORMS.length} selected</small></div>
    <div class="destination-grid">${PLATFORMS.map(p => `<button class="destination ${draft.selected.includes(p.id) ? 'selected' : ''}" data-destination="${p.id}" aria-pressed="${draft.selected.includes(p.id)}" title="${p.name}: ${p.detail}">${platformIcon(p)}<span class="check">${icon('check')}</span><span class="destination-name">${escape(p.name.replace(' · GATE ', ' · '))}</span><span class="destination-detail">${p.detail}</span><span class="destination-status" data-destination-status="${p.id}"></span></button>`).join('')}</div></section>
    <div class="section-heading"><h2><span class="step-number">2</span> Make it yours</h2><small id="draft-status">Draft saved on this device</small></div>
    <div class="composer-grid"><section class="panel media-panel" aria-label="Media upload"><div class="panel-label">Your media <small>${media.length ? `${media.length} image${media.length === 1 ? '' : 's'}` : 'Up to 10 images'}</small></div>
      <label class="dropzone ${heroImage ? 'has-preview' : ''}" id="dropzone" tabindex="0" role="button" aria-label="Upload images"><input type="file" id="file-input" accept="image/jpeg,image/png,image/webp" multiple hidden ${uploading ? 'disabled' : ''}>${heroImage ? `<img id="uploaded-preview" class="uploaded-preview" src="${escape(heroImage.url)}" alt="Preview: ${escape(heroImage.name)}"><span class="media-preview-caption">${mediaPreviewIndex + 1} of ${media.length} · ${uploading ? 'Uploading…' : 'Click or drop to add images'}</span>${heroImage.pending ? '<span class="uploading-badge" role="status">Uploading · preview ready</span>' : ''}` : `<span class="upload-art">${icon('image')}</span><strong>Drop your images here</strong><p>JPG, PNG or WEBP · up to 20 MB each</p><span class="browse">Browse files</span>`}</label>
      <div class="asset-list" tabindex="0" aria-label="Scrollable shared image library">${media.map(assetRow).join('')}</div>
      ${lastMediaOrder ? '<button class="button small" data-undo-media>Undo image change</button>' : ''}
      <p class="media-hint">${icon('info')}<span>Original format, pixels and dimensions are preserved. Drag the grip to reorder; arrow buttons also work on phones. ${draft.selected.includes('x') ? 'X accepts up to 4 images.' : 'The workspace supports up to 10 images.'}</span></p>
      <div class="media-destinations">${PLATFORMS.filter(p => draft.selected.includes(p.id) && p.id !== 'manychat').map(p => `<span class="badge ${platformMedia(p.id).length > p.maxImages ? 'bad' : 'neutral'}">${escape(p.name.replace(' · GATE ', ' · '))} · ${platformMedia(p.id).length}/${p.maxImages}</span>`).join('')}</div>
      <p class="media-hint"><span>Metadata checks cover embedded data. Platform AI labels and invisible watermarks cannot be predicted. <button class="text-button" data-metadata-help title="Lossless cleaning removes embedded metadata, then compares decoded pixels and dimensions. Colour information and required orientation are preserved. It cannot remove pixel watermarks or guarantee a platform label.">How it works</button></span></p></section>
    <section class="panel caption-panel" aria-label="Platform captions"><div class="caption-tabs" role="tablist" aria-label="Caption destination">${PLATFORMS.map(p => `<button class="caption-tab ${captionTab === p.id ? 'active' : ''}" id="tab-${p.id}" role="tab" aria-controls="editor-${p.id}" aria-selected="${captionTab === p.id}" tabindex="${captionTab === p.id ? 0 : -1}" data-caption-tab="${p.id}">${icon(p.icon)}${p.id === 'youtubeDA' ? 'YT · DA' : p.id === 'youtubeCS' ? 'YT · CS' : p.name}</button>`).join('')}</div>
    ${PLATFORMS.map(p => captionEditor(p)).join('')}<div class="caption-note">${icon('sparkle')} A shared idea, with a voice for every platform.</div></section></div>
    <div class="workflow-note">${icon('shield')}<div><strong>A rehearsal before the real thing.</strong><p>Test mode prepares your posts in the browser and stops before publishing. You’re always in control.</p></div><span class="arrow">${icon('arrow')}</span></div>${footer()}`;
}
function assetRow(m, i) {
  const busy = uploading || Boolean(cleaningMedia), origin = m.metadata?.credentials || m.metadata?.aiMarkers?.length;
  return `<div class="asset ${i === mediaPreviewIndex ? 'previewing' : ''}" data-asset-id="${escape(m.id)}">
    ${!m.pending ? `<button type="button" class="asset-grip" data-drag-media="${m.id}" aria-label="Reorder ${escape(m.name)}" title="Drag to reorder; use arrow keys to move" ${busy ? 'disabled' : ''}>${icon('grip')}</button>` : ''}
    <button class="asset-preview-button" data-media-preview="${i}" aria-label="Preview ${escape(m.name)}" aria-pressed="${i === mediaPreviewIndex}"><img src="${escape(m.url)}" alt=""></button>
    <div class="asset-meta"><div class="asset-name"><span class="asset-number">${i + 1}.</span> ${escape(m.name)}</div><small>${m.pending ? `Uploading · ${bytes(m.size)}` : `${m.width} × ${m.height} · ${bytes(m.size)} · ${(m.format || m.filename?.split('.').at(-1) || '').toUpperCase()}`}</small>
    ${!m.pending ? `<div class="asset-tools"><button type="button" class="text-button" data-metadata="${m.id}">${m.verification ? 'Metadata removed · pixels verified' : origin ? 'Origin metadata found' : m.metadata ? 'Metadata report' : 'Check metadata'}</button>${!m.verification ? `<button type="button" class="text-button" data-clean-media="${m.id}" ${busy ? 'disabled' : ''}>${cleaningMedia === m.id ? 'Verifying…' : 'Remove metadata'}</button>` : `<button type="button" class="text-button" data-restore-media="${m.id}" ${busy ? 'disabled' : ''}>Use original</button>`}<a href="${escape(m.url)}" download="${escape(m.name.replace(/\.[^.]+$/, '') + '.' + (m.format === 'jpeg' ? 'jpg' : m.format || m.filename.split('.').at(-1)))}">Download</a></div>${!m.preservedOriginal ? '<small class="legacy-media">Earlier optimized copy · reupload the original for lossless preservation.</small>' : ''}` : ''}</div>
    ${!m.pending ? `<div class="asset-order-buttons"><button type="button" data-move="${m.id}" data-direction="-1" aria-label="Move image ${i + 1} earlier" ${busy || i === 0 ? 'disabled' : ''}>${icon('up')}</button><button type="button" data-move="${m.id}" data-direction="1" aria-label="Move image ${i + 1} later" ${busy || i === draft.mediaIds.length - 1 ? 'disabled' : ''}>${icon('down')}</button></div><button class="button subtle round" data-remove="${m.id}" aria-label="Remove ${escape(m.name)}" ${busy ? 'disabled' : ''}>${icon('close')}</button>` : ''}</div>`;
}
function changeMediaOrder(ids, message, replacements = {}) {
  const shown = selectedMedia()[mediaPreviewIndex]?.id;
  lastMediaOrder = { ids: [...draft.mediaIds], selections: structuredClone(draft.mediaByPlatform) }; draft.mediaIds = ids;
  for (const [id, chosen] of Object.entries(draft.mediaByPlatform)) draft.mediaByPlatform[id] = chosen.map(key => replacements[key] || key).filter(key => ids.includes(key));
  mediaPreviewIndex = Math.max(0, ids.indexOf(shown)); saveDraft(); shell(); if (message) toast(message);
}
function metadataHelp() {
  showDialog('What metadata cleaning checks', '<p>The original file is kept. Cleaning edits metadata containers without re-encoding the picture. It preserves compressed image data, dimensions, colour profiles, transparency and required orientation, then compares decoded pixels and rescans embedded origin markers.</p><p>This does not detect or remove invisible watermarks in pixels, validate a C2PA signature, or predict platform moderation. “No embedded origin metadata found” does not mean “not AI generated.”</p>', '<button class="button primary" data-dialog-close>Got it</button>');
}
async function showMetadata(id) {
  const result = await api(`/api/media/${id}/metadata`), m = result.media;
  state.media = state.media.map(item => item.id === id ? m : item);
  const report = m.metadata, signals = report.credentials || report.aiMarkers.length;
  showDialog('Image metadata report', `<p><strong>${escape(m.name)}</strong><br>${m.width} × ${m.height} · ${bytes(m.size)}</p><dl class="metadata-facts"><dt>Content Credentials</dt><dd>${report.credentials ? 'Present · signature not validated' : 'Not found in embedded data'}</dd><dt>AI-origin markers</dt><dd>${escape(report.aiMarkers.join(', ') || 'None found in embedded data')}</dd><dt>Metadata containers</dt><dd>${escape(report.fields.join(', ') || 'No removable containers found')}</dd><dt>Quality verification</dt><dd>${m.verification ? 'Identical decoded pixels, dimensions and compressed image data' : m.preservedOriginal ? 'Uploaded original kept byte for byte' : 'Earlier optimized copy; reupload the original to preserve its original quality'}</dd></dl><table class="metadata-platforms"><thead><tr><th>Platform</th><th>What this scan can say</th></tr></thead><tbody><tr><td>Instagram</td><td>${signals ? 'Embedded origin signals present; an AI label is possible.' : 'No embedded origin signals found. Label outcome unknown.'}</td></tr><tr><td>LinkedIn</td><td>${report.credentials ? 'Content Credentials may be shown.' : 'No embedded C2PA found. Label outcome unknown.'}</td></tr><tr><td>X</td><td>Label outcome unknown.</td></tr><tr><td>YouTube posts</td><td>Community image label outcome unknown; published automatic C2PA guidance covers videos.</td></tr><tr><td>WhatsApp Channel</td><td>Label outcome unknown. Native channel disclosure requirements still apply.</td></tr></tbody></table><p>Pixel watermarks, remote provenance and platform systems are outside this scan. Removing metadata cannot guarantee that AI labels will disappear.</p><p class="metadata-sources"><a href="https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/" target="_blank" rel="noopener noreferrer">Meta guidance</a> · <a href="https://www.linkedin.com/help/linkedin/answer/a6282984/" target="_blank" rel="noopener noreferrer">LinkedIn Content Credentials</a> · <a href="https://support.google.com/youtube/answer/14328491?hl=en" target="_blank" rel="noopener noreferrer">YouTube guidance</a></p>`, '<button class="button primary" data-dialog-close>Done</button>');
}
function accountLabel(p) {
  const config = state.config?.platforms[p.id];
  if (!config) return p.detail;
  if (config.handle) return `@${config.handle}`;
  if (p.id === 'linkedin') return config.companyName || 'Company page · set up in Connections';
  if (p.id === 'manychat') return 'New comment-to-DM automation';
  if (p.id === 'whatsapp') return config.channelName || 'Set the exact channel in Connections';
  return p.detail;
}
function mediaCarousel(p, images, scope = 'editor') {
  const key = scope + p.id, index = Math.min(platformPreviewIndex[key] || 0, Math.max(0, images.length - 1)); platformPreviewIndex[key] = index;
  if (!images.length) return `<div class="preview-placeholder text-only-placeholder">${icon(p.textOnly ? 'message' : 'images')}${p.textOnly ? 'Text-only update' : 'Choose images below'}</div>`;
  return `<div class="preview-image destination-image"><img id="${scope}-image-${p.id}" src="${escape(images[index].url)}" alt="${escape(images[index].name)}"><span class="image-count" id="image-count-${p.id}">${index + 1} / ${images.length}</span>${images.length > 1 ? `<div class="preview-nav"><button data-carousel="${p.id}" data-carousel-scope="${scope}" data-carousel-step="-1" aria-label="Previous image">${icon('left')}</button><button data-carousel="${p.id}" data-carousel-scope="${scope}" data-carousel-step="1" aria-label="Next image">${icon('right')}</button></div>` : ''}</div><div class="carousel-strip" tabindex="0" aria-label="${escape(p.name)} selected image scroller">${images.map((m, i) => `<button class="carousel-thumb ${index === i ? 'active' : ''}" data-carousel="${p.id}" data-carousel-scope="${scope}" data-carousel-index="${i}" aria-label="Show selected image ${i + 1}: ${escape(m.name)}" aria-pressed="${index === i}"><img src="${escape(m.url)}" alt=""><span>${i + 1}</span></button>`).join('')}</div>`;
}
function destinationMediaEditor(p) {
  if (p.id === 'manychat') return '<div class="dm-media-note">' + icon('message') + 'Your DM uses text and link buttons. Images are not sent to ManyChat.</div>';
  const images = platformMedia(p.id), ids = images.map(m => m.id), custom = Object.hasOwn(draft.mediaByPlatform, p.id);
  return `<section class="destination-media" aria-label="${escape(p.name)} images"><div class="destination-media-heading"><strong>${icon('images')} Images for ${p.name}</strong><span class="badge ${images.length > p.maxImages ? 'bad' : 'neutral'}">${images.length} / ${p.maxImages}</span></div><div data-carousel-view="editor-${p.id}">${mediaCarousel(p, images)}</div><div class="image-selection-heading"><span>${custom ? 'Custom selection and order' : 'Using shared library order'} · ${p.maxImages === 1 ? 'choose one or use text only' : `choose up to ${p.maxImages}`}</span><div><button class="text-button" data-platform-media-action="${p.id}" data-selection-action="clear">Clear</button><button class="text-button" data-platform-media-action="${p.id}" data-selection-action="inherit" ${selectedMedia().length > p.maxImages ? 'disabled' : ''}>Use all</button></div></div><div class="image-picker" tabindex="0" aria-label="Choose images for ${escape(p.name)}">${selectedMedia().map(m => {
    const chosen = ids.indexOf(m.id), disabled = p.maxImages > 1 && chosen < 0 && ids.length >= p.maxImages;
    return `<button class="image-choice ${chosen >= 0 ? 'chosen' : ''}" data-pick-media="${p.id}" data-media-id="${m.id}" aria-pressed="${chosen >= 0}" aria-label="${escape(p.name)}: ${escape(m.name)}" ${disabled ? 'disabled' : ''}><img src="${escape(m.url)}" alt=""><span class="choice-number">${chosen >= 0 ? chosen + 1 : '+'}</span><span class="choice-name">${escape(m.name)}</span></button>`;
  }).join('') || '<p class="import-help">Upload images to the shared library first.</p>'}</div>${images.length > 1 ? `<div class="selection-order" aria-label="${escape(p.name)} image order">${images.map((m, i) => `<div><span>${i + 1}. ${escape(m.name)}</span><button data-destination-move="${p.id}" data-media-id="${m.id}" data-direction="-1" aria-label="Move selected image ${i + 1} earlier" ${i === 0 ? 'disabled' : ''}>${icon('left')}</button><button data-destination-move="${p.id}" data-media-id="${m.id}" data-direction="1" aria-label="Move selected image ${i + 1} later" ${i === images.length - 1 ? 'disabled' : ''}>${icon('right')}</button></div>`).join('')}</div>` : ''}<p class="selection-hint">Only this tab's selected images will be uploaded, in the numbered order. Other destinations keep their own selection.</p></section>`;
}
function captionEditor(p) {
  const text = draft.captions[p.id] || '';
  const count = countCharacters(text);
  return `<div class="caption-body ${captionTab !== p.id ? 'hidden' : ''}" id="editor-${p.id}" role="tabpanel" aria-labelledby="tab-${p.id}">
    <div class="caption-toolbar"><div class="caption-account">${platformIcon(p)}<div><strong>${p.name}</strong><small>${escape(accountLabel(p))}</small></div></div>${p.id !== 'instagram' ? `<button class="button subtle small" data-copy-instagram="${p.id}" title="Copy caption from Instagram">${icon('copy')}<span>From Instagram</span></button>` : '<span class="badge neutral">Feed post</span>'}</div>
    <div data-editor-readiness="${p.id}"></div>${destinationMediaEditor(p)}
    <label class="editor-label" for="caption-${p.id}">${p.id === 'manychat' ? 'DM text' : 'Post caption'}</label>
    <textarea class="caption-editor" id="caption-${p.id}" data-caption="${p.id}" placeholder="${p.id === 'instagram' ? 'What’s the story?\n\nWrite your caption here. A thought, an update,\na reason to stop scrolling…' : p.id === 'manychat' ? 'Write the final DM message. Links become editable buttons below…' : `Write your ${p.name} caption…`}" spellcheck="true">${escape(text)}</textarea>
    <div class="caption-bottom"><span>Newlines, emojis &amp; Unicode welcome</span><span id="count-${p.id}" class="${count > p.limit ? 'error-text' : ''}">${count.toLocaleString()} / ${p.limit.toLocaleString()}${p.id === 'x' ? ' *' : ''}</span></div>
    ${p.id === 'x' ? '<p class="import-help">* Estimate. Links and some Unicode characters count differently on X; exact weighted length is checked before running.</p>' : ''}
    ${p.id === 'whatsapp' ? '<p class="import-help">Channel update only · text or one image · 1,024-character workspace limit. The linked session, exact name and unique channel link are checked before every run. TEST blocks Send and discards only its own rehearsal draft.</p>' : ''}${p.id === 'manychat' ? manychatOptions() : ''}</div>`;
}
const nextManychatReplies = () => state.manychatNextReplies || replyBatch(state.config?.platforms.manychat.replyMessages);
const currentManychatLinks = () => manychatLinks(draft.manychat, draft.captions.manychat);
function manychatLinkFields() {
  const links = currentManychatLinks();
  let error = '';
  try { validateManychatDraft({ ...draft.manychat, postUrl: '' }, draft.captions.manychat); } catch (e) { error = e.message; }
  return `<p class="import-help">${draft.manychat.linksMode === 'auto' ? 'Links are detected from your DM text. Names are suggested within the 20-character limit. Editing a button keeps a custom set until you refresh from the DM.' : 'Custom buttons are kept when you edit the DM. Refresh from the DM to detect its current links again.'} The DM text stays as written.</p>
    ${links.map((link, index) => `<div class="manychat-link-entry"><div class="manychat-link-row"><label class="field"><span>Button ${index + 1} label · max 20</span><input data-manychat-link="${index}" data-link-field="label" maxlength="20" value="${escape(link.label || '')}" placeholder="Open the details"></label><label class="field"><span>Button ${index + 1} URL</span><input type="url" data-manychat-link="${index}" data-link-field="url" value="${escape(link.url || '')}" placeholder="https://…"></label></div><button type="button" class="button subtle small" data-manychat-remove="${index}" aria-label="Remove button ${index + 1}">Remove</button></div>`).join('')}
    ${!links.length ? '<p class="import-help">Paste links into your DM to create buttons, or add one below.</p>' : ''}
    <p class="manychat-links-error error-text" role="status">${escape(error)}</p><div class="inline-controls">${links.length < 3 ? '<button type="button" class="button small" data-manychat-add>Add a button</button>' : ''}${draft.manychat.linksMode === 'manual' ? '<button type="button" class="button subtle small" data-manychat-auto>Refresh from DM</button>' : ''}</div>`;
}
function refreshManychatLinks() {
  const target = document.querySelector('#manychat-link-fields');
  if (target) target.innerHTML = manychatLinkFields();
}
function customizeManychatLinks() {
  draft.manychat.links = currentManychatLinks().map(link => ({ ...link }));
  draft.manychat.linksMode = 'manual';
}
function manychatOptions() {
  return `<section class="manychat-options" aria-label="ManyChat automation options">
    <p class="import-help">New automation · any comment · public replies on · default opening DM on.</p>
    <label class="field"><span>Instagram post URL <small>Optional when publishing Instagram in the same run</small></span><input type="url" data-manychat-post value="${escape(draft.manychat.postUrl)}" placeholder="Automatic: Instagram post from this run"><small>For a ManyChat-only LIVE run, paste the exact post or reel URL. TEST can rehearse on the latest existing post without activating anything.</small></label>
    <details class="manychat-link-options" open><summary>Link buttons from your DM · up to 3</summary><div id="manychat-link-fields">${manychatLinkFields()}</div></details>
    <div class="manychat-reply-preview"><strong>Replies for the next automation</strong><ul>${nextManychatReplies().map(message => `<li>${escape(message)}</li>`).join('')}</ul><p>Edit the reply pool in Connections. Three replies rotate after each confirmed LIVE activation.</p></div>
  </section>`;
}
function manychatConnectionFields() {
  return `<label class="field"><span>New automation builder URL</span><input type="url" name="manychat.flowUrl" value="${escape(state.config.platforms.manychat.flowUrl)}"><small>The worker creates a new “Auto-DM links from comments” automation for the selected Instagram post.</small></label>
    <label class="field"><span>Comment reply pool · one reply per line</span><textarea name="manychat.replyMessages" rows="8">${escape(state.config.platforms.manychat.replyMessages || DEFAULT_REPLY_MESSAGES.join('\n'))}</textarea><small>20 replies are included. Keep 3–50 different replies; each automation receives three, which ManyChat shuffles. You can edit these messages.</small></label>`;
}
function manychatReview() {
  const links = currentManychatLinks().filter(link => link.label && link.url);
  return `<div class="manychat-review"><p><strong>Post:</strong> ${escape(draft.manychat.postUrl || 'Instagram post published in this run')}</p><p>Any comment · 3 public replies · default opening DM</p>${mode === 'TEST' && !draft.manychat.postUrl ? '<p class="text-muted">TEST uses an existing post for rehearsal. It does not publish Instagram or activate ManyChat.</p>' : ''}${links.map(link => `<p><strong>${escape(link.label)}</strong> · ${escape(link.url)}</p>`).join('')}<ul>${nextManychatReplies().map(reply => `<li>${escape(reply)}</li>`).join('')}</ul></div>`;
}
function preparedAutomation(item) {
  const prepared = item.preparation;
  if (!prepared) return '';
  return `<div class="prepared-automation"><a href="${escape(prepared.postUrl)}" target="_blank" rel="noopener noreferrer">Selected Instagram post ${icon('external')}</a>${prepared.testExistingPost ? '<p>TEST preview used an existing post. Go live was not clicked.</p>' : ''}<ul>${prepared.replies.map(reply => `<li>${escape(reply)}</li>`).join('')}</ul></div>`;
}

function liveBanner() { return `<div class="live-banner">${icon('info')} <strong>LIVE mode</strong> · The next run will publish publicly. You will need to type POST to confirm the selected destinations.</div>`; }
function actionbar() {
  if (view === 'settings' || view === 'activity') return '';
  const busy = workerBusy() || sending || uploading || Boolean(cleaningMedia);
  const eligible = runnableIds();
  return `<div class="actionbar ${mode === 'LIVE' ? 'live-bar' : ''}"><div class="mode-info"><div class="mode-switch" role="group" aria-label="Publishing mode"><button class="${mode === 'TEST' ? 'active' : ''}" data-mode="TEST" aria-pressed="${mode === 'TEST'}">TEST MODE</button><button class="${mode === 'LIVE' ? 'active live' : ''}" data-mode="LIVE" aria-pressed="${mode === 'LIVE'}">LIVE</button></div><div class="mode-copy ${mode === 'LIVE' ? 'live' : ''}"><strong>${mode === 'TEST' ? 'Safe to explore' : 'Public publishing enabled'}</strong><small>${mode === 'TEST' ? 'Nothing will be published' : 'Confirmation required for each run'}</small></div></div><div class="action-buttons"><span class="run-readiness-count">${eligible.length} ready${draft.selected.length > eligible.length ? ` · ${draft.selected.length - eligible.length} excluded` : ''}</span><button class="button subtle" data-action="logins" ${busy ? 'disabled' : ''}>${icon('lock')} Check logins</button>${view === 'compose' ? `<button class="button primary" data-action="preview" ${uploading ? 'disabled' : ''}>Preview posts ${icon('arrow')}</button>` : `<button class="button ${mode === 'LIVE' ? 'danger' : 'primary'}" data-action="run" ${busy || !reviewValid || !reviewDraft?.selected.length || reviewDraft.selected.some(id => !readiness()[id]?.ready) ? 'disabled' : ''}>${icon('play')} ${sending ? 'Starting…' : mode === 'LIVE' ? 'Publish selected' : 'Run test'}</button>`}</div></div>`;
}
function previewPage() {
  const ready = readiness(), images = selectedMedia();
  return `<div class="hero"><div><div class="eyebrow">A moment to make it perfect</div><h1>Looks like <span>your next post.</span></h1><p>Review the image, caption and destination for every post.</p></div><div class="hero-actions"><button class="button" data-view="compose">${icon('compose')}<span>Keep editing</span></button></div></div>${mode === 'LIVE' ? liveBanner() : ''}<div class="notice">These are content previews. The platform controls the final layout and cropping. ${mode === 'TEST' ? 'Run a test to capture the actual composers without publishing.' : 'The next run will publish to the selected destinations.'}</div><div class="review-summary"><span><strong>${reviewDraft?.selected.length || 0}</strong> included · ${draft.selected.length - (reviewDraft?.selected.length || 0)} excluded</span><span><strong>${images.length}</strong> images in library</span><span>${mode === 'TEST' ? 'TEST · no publishing' : 'LIVE · public posts'}</span></div><div class="preview-grid">${PLATFORMS.filter(p => draft.selected.includes(p.id)).map(p => {
    const images = platformMedia(p.id), caption = draft.captions[p.id] || '';
    const valid = ready[p.id].ready;
    return `<article class="panel preview-card ${valid ? '' : 'excluded-preview'}" data-preview-destination="${p.id}"><div class="preview-header">${platformIcon(p)}<div><strong>${p.name}</strong><small>${escape(accountLabel(p))}</small></div></div>${p.id === 'manychat' ? `<div class="preview-placeholder">${icon('message')} New comment-to-DM automation</div>` : `<div data-carousel-view="review-${p.id}">${mediaCarousel(p, images, 'review')}</div>`}<div class="preview-caption">${escape(caption || 'Add a caption in Compose.')}</div>${p.id === 'manychat' ? manychatReview() : ''}${!valid ? `<div class="excluded-reasons">${ready[p.id].errors.map(error => `<p>${escape(error)}</p>`).join('')}<button class="text-button" data-fix-destination="${p.id}">Edit this destination</button></div>` : ''}<div class="preview-meta"><span class="badge ${valid ? '' : 'warn'}">${icon(valid ? 'check' : 'info')}${valid ? 'Included in run' : 'Excluded · needs fixing'}</span><span>${countCharacters(caption).toLocaleString()} characters</span></div></article>`;
  }).join('')}</div>${!draft.selected.length ? '<div class="panel empty-state"><h2>No destinations selected</h2><p>Choose destinations in Compose to see your previews.</p></div>' : ''}${footer()}`;
}
const statusLabels = { queued: 'Queued', running: 'In progress', dry_run: 'Test complete', posted: 'Published', failed: 'Failed', uncertain: 'Verify outcome', attention: 'Needs attention', awaiting_manual: 'Your turn', needs_setup: 'Choose flow', skipped: 'Skipped' };
function statusBadge(item) {
  const good = ['posted', 'dry_run'].includes(item.status);
  const bad = ['failed', 'uncertain'].includes(item.status);
  const warn = ['attention', 'awaiting_manual', 'needs_setup'].includes(item.status);
  return `<span class="badge ${bad ? 'bad' : warn ? 'warn' : good ? '' : 'neutral'}">${icon(item.status === 'running' ? 'refresh' : good ? 'check' : warn || bad ? 'info' : 'clock', item.status === 'running' ? 'spin' : '')}${statusLabels[item.status] || item.status}</span>`;
}
function activityPage() {
  return `<div class="hero"><div><div class="eyebrow">Your publishing desk</div><h1>Every step. <span>In sight.</span></h1><p>Follow the queue, review screenshots and pick up where you left off.</p></div><div class="hero-actions"><button class="button" data-action="download-log">${icon('download')}<span>Export report</span></button></div></div><div id="activity-runs">${renderRuns()}</div>${footer()}`;
}
function renderRuns() {
  if (!state.runs.length) return `<div class="panel empty-state">${icon('activity')}<h2>Your first run starts here.</h2><p>Compose your posts and run a test. Every destination, screenshot and result will appear here.</p><button class="button primary" data-view="compose">Create a post ${icon('arrow')}</button></div>`;
  return state.runs.map(run => {
    const done = run.items.filter(i => !['queued', 'running', 'attention', 'awaiting_manual'].includes(i.status)).length;
    const active = activeRun()?.id === run.id;
    const controls = active ? `${run.status === 'running' ? `<button class="button small" data-control="pause">${icon('pause')} Pause</button>` : ''}${run.status === 'paused' ? `<button class="button small" data-control="resume">${icon('play')} Resume</button>` : ''}${run.status === 'attention' ? `<button class="button primary small" data-control="continue">${icon('refresh')} I’ve fixed it · continue</button>` : ''}${run.status === 'awaiting_manual' ? `<button class="button primary small" data-control="done">${icon('check')} I’ve saved in ManyChat</button>` : ''}<button class="button small" data-control="stop" ${run.status === 'stopping' ? 'disabled' : ''}>${icon('stop')} ${run.status === 'stopping' ? 'Stopping after this post' : 'Stop'}</button>` : run.items.some(i => i.status === 'failed') ? `<button class="button small" data-retry="${run.id}" ${workerBusy() ? 'disabled' : ''}>${icon('refresh')} Restart failed</button>` : '';
    const failed = run.items.filter(item => ['failed', 'uncertain', 'attention', 'needs_setup'].includes(item.status));
    const success = run.items.filter(item => ['posted', 'dry_run'].includes(item.status)).length;
    const title = run.captions[run.items.find(item => item.id !== 'manychat')?.id || 'manychat']?.split('\n').find(line => line.trim()) || 'Publishing run';
    return `<details class="panel run-card" data-run-id="${run.id}" ${runExpansion.get(run.id) ?? active ? 'open' : ''}><summary class="run-summary"><div><h2><span class="badge ${run.mode === 'LIVE' ? 'bad' : ''}">${run.mode === 'LIVE' ? 'LIVE' : 'TEST RUN'}</span><span>${success}/${run.items.length} ${run.mode === 'LIVE' ? 'published' : 'prepared'}</span>${failed.length ? `<span class="badge bad">${failed.length} need attention</span>` : ''}</h2><p class="run-caption-title">${escape(title)}</p><p>${prettyDate(run.createdAt)} · ${escape(run.status.replaceAll('_', ' '))}</p></div><span class="run-expand">${icon('chevron')}</span></summary><div class="run-detail"><div class="run-actions">${controls}</div><progress class="progress" value="${done}" max="${run.items.length}" aria-label="Run progress">${done} of ${run.items.length}</progress>${run.items.map(item => {
      const p = platform(item.id);
      return `<div class="run-item">${platformIcon(p)}<div><h3>${p.name}</h3><p>${escape(item.message)}</p>${item.id === 'manychat' ? preparedAutomation(item) : item.id === 'whatsapp' && item.preparation ? `<p>Verified channel: ${escape(item.preparation.channelName)} · ${item.preparation.imageCount ? '1 image' : 'text only'}</p>` : ''}${item.status === 'awaiting_manual' ? `<div class="inline-controls"><button class="button small" data-copy-manual="${run.id}">${icon('copy')} Copy ManyChat message</button><a href="${escape(state.config.platforms.manychat.flowUrl)}" target="_blank" rel="noopener noreferrer" class="muted-link">Open ManyChat ${icon('external')}</a></div>` : ''}${item.status === 'uncertain' ? `<div class="inline-controls"><button class="button small" data-resolve="${run.id}" data-platform="${item.id}" data-resolution="posted">Verified published</button><button class="button small" data-resolve="${run.id}" data-platform="${item.id}" data-resolution="failed">Verified not published</button></div>` : ''}<div class="run-links">${item.publication?.postUrl ? `<a href="${escape(item.publication.postUrl)}" target="_blank" rel="noopener noreferrer">View published post ${icon('external')}</a>` : ''}${(item.screenshots || []).map(s => `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.label.replaceAll('-', ' '))} ${icon('external')}</a>`).join('')}</div></div><div class="run-item-right">${statusBadge(item)}${item.status === 'failed' ? `<button class="button small retry-one" data-retry="${run.id}" data-retry-platform="${item.id}" ${workerBusy() ? 'disabled' : ''}>${icon('refresh')} Retry ${escape(p.name)}</button>` : ''}${item.startedAt ? `<span class="run-time" data-elapsed-start="${item.startedAt}" data-elapsed-end="${item.finishedAt || ''}">${elapsed(item.startedAt, item.finishedAt)}</span>` : ''}</div></div>`;
    }).join('')}</div></details>`;
  }).join('');
}
function elapsed(start, end) { const seconds = Math.max(0, Math.round(((end ? new Date(end) : Date.now()) - new Date(start)) / 1000)); return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
function settingsPage() {
  const field = (id, key, label, hint = '', placeholder = '') => `<label class="field"><span>${label}</span><input name="${id}.${key}" value="${escape(state.config.platforms[id][key])}" placeholder="${escape(placeholder)}" autocomplete="off" ${/Url$/.test(key) ? 'type="url"' : 'type="text"'}>${hint ? `<small>${hint}</small>` : ''}</label>`;
  return `<div class="hero"><div><div class="eyebrow">The right account, every time</div><h1>Make the <span>connections.</span></h1><p>Connect your accounts first, then continue to your post.</p></div><div class="hero-actions"><button class="button" data-action="logins" ${workerBusy() ? 'disabled' : ''}>${icon('lock')}<span>${state.login.running ? 'Checking…' : 'Check logins'}</span></button></div></div><div class="notice"><strong>A browser on the worker, a workspace on any device.</strong> Sign in on the worker computer. Both YouTube channels share your Google login; their IDs are saved automatically and the worker switches channels for you. Then click “Check logins” again. Passwords are never entered into this workspace.</div><form id="settings-form"><div class="settings-grid">${PLATFORMS.map(p => `<section class="panel settings-card"><div class="settings-title">${platformIcon(p)}<h2>${p.name}</h2></div>${p.id === 'instagram' || p.id === 'x' ? field(p.id, 'handle', 'Expected account handle', p.id === 'x' ? 'Open & check waits for X and detects your signed-in handle automatically when this is empty.' : 'The active account must match this handle.', 'your-account') : p.id === 'linkedin' ? field(p.id, 'companyPageUrl', 'Company admin URL', 'Open this URL after signing in. If you cannot see company admin controls, ask a page admin for posting access.') + field(p.id, 'companyName', 'Exact company page name', 'Must match the identity shown in the post composer.') : p.id.startsWith('youtube') ? field(p.id, 'channelId', 'Channel ID (detected automatically)', 'Open & check saves this ID and verifies the selected channel. You can also enter a known ID.', 'UC...') + field(p.id, 'channelName', 'Exact channel name') + field(p.id, 'handle', 'Channel handle', 'Both the active channel name and handle are checked before posting.') : p.id === 'whatsapp' ? field(p.id, 'channelName', 'Exact WhatsApp channel name', 'The worker selects this only inside Channels. Duplicate names or personal-chat composers are rejected.') + field(p.id, 'channelUrl', 'Unique public channel link', 'The selected channel’s own link must match. Link WhatsApp Web on this worker using your phone’s Linked devices. A stale Verified badge never replaces the fresh check before a run.', 'https://whatsapp.com/channel/…') : manychatConnectionFields()}
      <div class="login-status" id="login-status-${p.id}">${loginStatus(p.id)}</div></section>`).join('')}</div><div class="settings-footer"><p>Shared settings apply to everyone using this worker.<br>Created by Mrinal · Account sessions stay on this computer.</p><button class="button primary" type="submit" ${workerBusy() ? 'disabled' : ''}>${icon('check')} Save connections</button></div></form>${connectionsNext()}<div class="notice sharing-notice"><strong>Use it with your team.</strong> For devices on the same network, configure HOST and a workspace password in .env. For access outside the office, connect a managed Cloudflare Tunnel to this worker and set APP_ORIGIN. See README.md for the exact steps. Keep the worker awake and its desktop session available.</div>${footer()}`;
}
function connectionsNext() {
  return `<section class="connections-next"><div><strong>Accounts first. A smoother post next.</strong><p id="verified-count">${verifiedDestinations().length} of ${PLATFORMS.length} destinations verified</p><small>You can compose with your verified destinations and connect the others later.</small></div><button class="button primary" data-action="continue-compose" ${workerBusy() || !verifiedDestinations().length ? 'disabled' : ''}>Continue to Compose ${icon('arrow')}</button></section>`;
}
function loginStatus(id) {
  const s = state.login.items[id];
  const check = `<button class="button small" type="button" data-check-login="${id}" ${workerBusy() ? 'disabled' : ''}>${icon('lock')}${s?.status === 'needs_login' ? 'I’ve logged in · check again' : 'Open & check'}</button><button class="button small" type="button" data-manual-login="${id}" ${workerBusy() ? 'disabled' : ''}>Manual sign-in</button>`;
  if (!s) return `${icon('lock')} Not checked yet<div class="inline-controls">${check}</div>`;
  const idSaved = s.discoveredId && state.config.platforms[id].channelId === s.discoveredId;
  return `<span class="badge ${s.status === 'verified' ? '' : s.status === 'checking' ? 'neutral' : 'warn'}">${icon(s.status === 'verified' ? 'check' : s.status === 'checking' ? 'refresh' : 'info', s.status === 'checking' ? 'spin' : '')}${s.status.replaceAll('_', ' ')}</span><p>${escape(s.message)}</p>${s.discoveredId ? `<strong>${idSaved ? 'Channel ID saved' : 'Detected channel ID'}</strong><code>${escape(s.discoveredId)}</code>${idSaved ? '' : `<button class="button small" type="button" data-use-channel="${id}" data-channel-id="${escape(s.discoveredId)}">Use this ID</button>`}` : ''}${s.discoveredHandle ? `<p>Signed in as <strong>@${escape(s.discoveredHandle)}</strong></p>` : ''}<div class="inline-controls">${check}${s.screenshot ? `<a href="${escape(s.screenshot)}" target="_blank" rel="noopener noreferrer" class="muted-link">View screenshot ${icon('external')}</a>` : ''}</div>${s.checkedAt ? `<p>Last checked ${prettyDate(s.checkedAt)}</p>` : ''}`;
}

function navigate(next) {
  if (view === 'settings' && document.querySelector('#settings-form')?.dataset.dirty === 'true') {
    showDialog('Unsaved connections', '<p>Save your connection changes before leaving, or discard them.</p>', `<button class="button" data-dialog-close>Keep editing</button><button class="button primary" id="discard-settings">Discard &amp; continue</button>`);
    document.querySelector('#discard-settings').onclick = () => { modal.close(); view = next; shell(); };
    return;
  }
  view = next; shell(); window.scrollTo({ top: 0, behavior: 'instant' });
}
function bindPage() {
  for (const handle of document.querySelectorAll('[data-drag-media]')) {
    handle.onpointerdown = event => {
      if (handle.disabled || event.button !== 0) return;
      event.preventDefault(); handle.setPointerCapture(event.pointerId);
      const id = handle.dataset.dragMedia; let targetId = id, after = false;
      const dragged = handle.closest('.asset'); dragged.classList.add('dragging');
      handle.onpointermove = move => {
        document.querySelectorAll('.asset.drop-before,.asset.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
        const target = document.elementFromPoint(move.clientX, move.clientY)?.closest('[data-asset-id]');
        if (!target || target.dataset.assetId === id) return;
        targetId = target.dataset.assetId; after = move.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
        target.classList.add(after ? 'drop-after' : 'drop-before');
      };
      handle.onpointerup = up => {
        handle.releasePointerCapture(up.pointerId); handle.onpointermove = handle.onpointerup = null;
        document.querySelectorAll('.asset').forEach(el => el.classList.remove('dragging', 'drop-before', 'drop-after'));
        if (targetId === id) return;
        const order = draft.mediaIds.filter(value => value !== id), index = order.indexOf(targetId);
        if (index < 0) return; order.splice(index + (after ? 1 : 0), 0, id); changeMediaOrder(order, 'Image order updated.');
      };
      handle.onpointercancel = () => { handle.onpointermove = handle.onpointerup = null; document.querySelectorAll('.asset').forEach(el => el.classList.remove('dragging', 'drop-before', 'drop-after')); };
    };
  }
  // Delegate most events once; only native file/form controls need per-render listeners.
  const file = document.querySelector('#file-input');
  if (file) file.onchange = () => upload(file.files);
  const zone = document.querySelector('#dropzone');
  if (zone) {
    zone.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
    zone.ondragover = e => { e.preventDefault(); zone.classList.add('dragover'); };
    zone.ondragleave = () => zone.classList.remove('dragover');
    zone.ondrop = e => { e.preventDefault(); zone.classList.remove('dragover'); upload(e.dataTransfer.files); };
  }
  const form = document.querySelector('#settings-form');
  if (form) {
    form.oninput = e => { form.dataset.dirty = 'true'; e.target.dataset.edited = 'true'; };
    form.onsubmit = async e => {
      e.preventDefault();
      const updated = structuredClone(state.config);
      for (const [key, value] of new FormData(form)) { const [id, field] = key.split('.'); updated.platforms[id][field] = value; }
      try { state.config = await api('/api/config', { method: 'PUT', body: updated }); form.dataset.dirty = 'false'; toast('Connections saved.'); shell(); }
      catch (error) { toast(error.message, true); }
    };
  }
}
async function upload(files) {
  if (uploading || !files?.length) return;
  if (draft.mediaIds.length + files.length > 10) return toast('Choose up to 10 images. Remove an image to add another.', true);
  for (const f of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return toast(`${f.name}: choose JPG, PNG, or WEBP.`, true);
    if (f.size > 20 * 1024 * 1024) return toast(`${f.name}: each image must be 20 MB or smaller.`, true);
  }
  const form = new FormData(); for (const f of files) form.append('images', f);
  pendingMedia = [...files].map((file, index) => ({ id: `pending-${Date.now()}-${index}`, name: file.name, url: URL.createObjectURL(file), size: file.size, pending: true }));
  mediaPreviewIndex = selectedMedia().length;
  lastMediaOrder = null; uploading = true; shell();
  try { const result = await api('/api/upload', { method: 'POST', body: form }); state.media.push(...result.media); draft.mediaIds.push(...result.media.map(m => m.id)); saveDraft(); toast(`${result.media.length === 1 ? 'Image ready' : 'Images ready'}.`); }
  catch (error) { toast(error.message, true); }
  finally {
    const temporaryUrls = pendingMedia.map(m => m.url); pendingMedia = []; uploading = false; shell();
    for (const url of temporaryUrls) URL.revokeObjectURL(url);
  }
}
function showDialog(title, body, actions) {
  modal.innerHTML = `<h2 id="dialog-title">${title}</h2>${body}<div class="dialog-actions">${actions}</div>`;
  if (!modal.open) modal.showModal();
}
function confirmLive(onConfirm, label = 'Publish selected', destinations = draft.selected) {
  showDialog('Ready to publish publicly?', `<p>This will publish to <strong>${destinations.length} selected destination${destinations.length === 1 ? '' : 's'}</strong>: ${destinations.map(id => escape(platform(id).name)).join(', ')}. For ManyChat, this creates and activates an automation that replies to comments and sends the prepared DM. Review the posts first. Type <strong>POST</strong> to confirm this run.</p><label class="field"><span>Confirmation</span><input id="live-confirmation" autocomplete="off" placeholder="Type POST" spellcheck="false"></label><div id="dialog-error" class="dialog-error" role="alert"></div>`, `<button class="button" data-dialog-close>Cancel</button><button class="button danger" id="confirm-live" disabled>${icon('play')} ${label}</button>`);
  const input = document.querySelector('#live-confirmation');
  input.oninput = () => { document.querySelector('#confirm-live').disabled = input.value !== 'POST'; };
  document.querySelector('#confirm-live').onclick = async () => {
    const button = document.querySelector('#confirm-live'); button.disabled = true;
    try { await onConfirm(input.value); modal.close(); }
    catch (error) { document.querySelector('#dialog-error').textContent = error.message; button.disabled = false; }
  };
  input.focus();
}
async function preview() {
  try {
    const source = structuredClone(draft), stamp = JSON.stringify(source);
    const checked = await api('/api/readiness', { method: 'POST', body: source });
    if (stamp !== JSON.stringify(draft)) return toast('The draft changed during review. Preview it again.');
    remoteReadiness = checked.destinations;
    const selected = runnableIds();
    reviewBlocked = draft.selected.filter(id => !selected.includes(id));
    reviewDraft = { ...source, selected };
    if (selected.length) await api('/api/validate', { method: 'POST', body: reviewDraft });
    reviewValid = true; navigate('preview');
    if (reviewBlocked.length) toast(`${reviewBlocked.length} destination${reviewBlocked.length === 1 ? '' : 's'} excluded until fixed. Review the reasons on each card.`);
  } catch (error) { toast(error.message, true); }
}
async function startRun(confirmation) {
  if (sending) return;
  if (!reviewValid || !reviewDraft?.selected.length || reviewDraft.selected.some(id => !readiness()[id]?.ready)) throw new Error('Review the ready destinations before running.');
  sending = true;
  try {
    await api('/api/runs', { method: 'POST', body: { draft: reviewDraft, mode, confirmation } });
    mode = 'TEST'; // Live authorization is one run only.
    view = 'activity'; await refresh(); shell();
    toast('Run started. You can follow every step here.');
  } finally { sending = false; }
}
async function checkLogins(selected = draft.selected) {
  if (view === 'settings' && document.querySelector('#settings-form')?.dataset.dirty === 'true') return toast('Save your connection changes before checking logins.', true);
  if (!selected.length) return toast('Select at least one destination in Compose.', true);
  await api('/api/logins', { method: 'POST', body: { selected } });
  navigate('settings'); toast('The browser is opening on the worker computer. Sign in there, then check again.');
}
function exportText() {
  const text = PLATFORMS.map(p => `=====${p.delimiter}=====\n${draft.captions[p.id] || ''}`).join('\n\n');
  download('social-studio-captions.txt', text, 'text/plain;charset=utf-8');
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importDialog() {
  showDialog('Every caption, in one paste.', '<p>Paste the six existing sections and add =====WHATSAPP===== for the channel update. WhatsApp is optional in an import, but needs its own text whenever selected.</p><label class="field"><span>Structured captions</span><textarea id="import-captions" placeholder="=====INSTAGRAM=====&#10;Your caption here…&#10;&#10;=====LINKEDIN=====&#10;Your company update…"></textarea></label><div id="dialog-error" class="dialog-error" role="alert"></div>', '<button class="button" data-dialog-close>Cancel</button><button class="button primary" id="parse-captions">Import captions</button>');
  document.querySelector('#parse-captions').onclick = () => {
    const { captions, errors } = parseCaptions(document.querySelector('#import-captions').value);
    if (errors.length) { document.querySelector('#dialog-error').textContent = errors.join('\n'); return; }
    draft.captions = captions; saveDraft(); modal.close(); view = 'compose'; shell(); toast('Captions imported. Check the WhatsApp text if that destination is selected.');
  };
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.'); }
  catch {
    showDialog('Copy your message', '<p>Clipboard access is unavailable on this connection. Select and copy the message below.</p><label class="field"><span>Message</span><textarea id="copy-fallback" readonly></textarea></label>', '<button class="button primary" data-dialog-close>Done</button>');
    const area = document.querySelector('#copy-fallback'); area.value = text; area.focus(); area.select();
  }
}

document.addEventListener('click', async e => {
  const button = e.target.closest('button'); if (!button || button.disabled) return;
  try {
    if (button.hasAttribute('data-dialog-close')) { modal.close(); return; }
    if (button.dataset.action === 'theme') {
      theme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
      try { localStorage.setItem('mrinal.social-studio.theme', theme); } catch { /* Session preference still applies. */ }
      applyTheme(); button.innerHTML = icon(theme === 'system' ? 'monitor' : theme === 'dark' ? 'moon' : 'sun'); button.setAttribute('aria-label', `Appearance: ${theme}. Change theme`); button.title = `Appearance: ${theme}`; return;
    }
    if (button.dataset.fixDestination) { captionTab = button.dataset.fixDestination; navigate('compose'); document.querySelector(`#editor-${captionTab}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (button.dataset.pickMedia) {
      const id = button.dataset.pickMedia, p = platform(id), selected = [...mediaIdsFor(draft, id)], image = button.dataset.mediaId;
      draft.mediaByPlatform[id] = p.maxImages === 1 ? selected.length === 1 && selected[0] === image ? [] : [image] : selected.includes(image) ? selected.filter(key => key !== image) : [...selected, image];
      platformPreviewIndex['editor' + id] = Math.max(0, draft.mediaByPlatform[id].indexOf(image)); saveDraft(); shell(); return;
    }
    if (button.dataset.platformMediaAction) { const id = button.dataset.platformMediaAction; if (button.dataset.selectionAction === 'inherit') delete draft.mediaByPlatform[id]; else draft.mediaByPlatform[id] = []; saveDraft(); shell(); return; }
    if (button.dataset.destinationMove) {
      const id = button.dataset.destinationMove, ids = [...mediaIdsFor(draft, id)], index = ids.indexOf(button.dataset.mediaId), target = index + Number(button.dataset.direction);
      if (index >= 0 && target >= 0 && target < ids.length) { [ids[index], ids[target]] = [ids[target], ids[index]]; draft.mediaByPlatform[id] = ids; saveDraft(); shell(); } return;
    }
    if (button.dataset.carousel) {
      const id = button.dataset.carousel, scope = button.dataset.carouselScope, images = platformMedia(id), key = scope + id;
      if (!images.length) return;
      platformPreviewIndex[key] = button.hasAttribute('data-carousel-index') ? Number(button.dataset.carouselIndex) : ((platformPreviewIndex[key] || 0) + Number(button.dataset.carouselStep) + images.length) % images.length;
      document.querySelector(`[data-carousel-view="${scope}-${id}"]`).innerHTML = mediaCarousel(platform(id), images, scope);
      document.querySelector(`[data-carousel-view="${scope}-${id}"] .carousel-thumb.active`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); return;
    }
    if (button.dataset.view) { if (button.dataset.view === 'preview') await preview(); else navigate(button.dataset.view); return; }
    if (button.dataset.destination) {
      const id = button.dataset.destination; draft.selected = draft.selected.includes(id) ? draft.selected.filter(p => p !== id) : PLATFORMS.filter(p => [...draft.selected, id].includes(p.id)).map(p => p.id); saveDraft(); shell(); return;
    }
    if (button.dataset.captionTab) { captionTab = button.dataset.captionTab; shell(); document.querySelector(`#tab-${captionTab}`)?.focus(); return; }
    if (button.dataset.copyInstagram) { draft.captions[button.dataset.copyInstagram] = draft.captions.instagram; saveDraft(); shell(); toast('Instagram caption copied. Make it your own.'); return; }
    if (button.hasAttribute('data-metadata-help')) { metadataHelp(); return; }
    if (button.dataset.metadata) { await showMetadata(button.dataset.metadata); return; }
    if (button.dataset.cleanMedia) {
      cleaningMedia = button.dataset.cleanMedia; shell();
      try {
        const result = await api(`/api/media/${cleaningMedia}/clean`, { method: 'POST', body: {} });
        state.media.push(result.media); changeMediaOrder(draft.mediaIds.map(id => id === cleaningMedia ? result.media.id : id), undefined, { [cleaningMedia]: result.media.id });
        toast('Embedded metadata removed. Identical pixels and dimensions verified; platform labels remain unknown.');
      } finally { cleaningMedia = null; shell(); }
      return;
    }
    if (button.dataset.restoreMedia) { const item = state.media.find(m => m.id === button.dataset.restoreMedia); if (item?.sourceId) changeMediaOrder(draft.mediaIds.map(id => id === item.id ? item.sourceId : id), 'Original image restored.', { [item.id]: item.sourceId }); return; }
    if (button.hasAttribute('data-undo-media')) { const restore = lastMediaOrder; if (restore) { draft.mediaIds = restore.ids; draft.mediaByPlatform = restore.selections; lastMediaOrder = null; saveDraft(); shell(); toast('Image change undone.'); } return; }
    if (button.hasAttribute('data-manychat-add')) { customizeManychatLinks(); if (draft.manychat.links.length < 3) draft.manychat.links.push({ label: '', url: '' }); saveDraft(); refreshManychatLinks(); return; }
    if (button.hasAttribute('data-manychat-remove')) { customizeManychatLinks(); draft.manychat.links.splice(Number(button.dataset.manychatRemove), 1); saveDraft(); refreshManychatLinks(); return; }
    if (button.hasAttribute('data-manychat-auto')) { draft.manychat.linksMode = 'auto'; draft.manychat.links = []; saveDraft(); refreshManychatLinks(); return; }
    if (button.dataset.remove) { changeMediaOrder(draft.mediaIds.filter(id => id !== button.dataset.remove)); return; }
    if (button.dataset.move) { const ids = [...draft.mediaIds], i = ids.indexOf(button.dataset.move), target = i + Number(button.dataset.direction || -1); if (i >= 0 && target >= 0 && target < ids.length) { [ids[target], ids[i]] = [ids[i], ids[target]]; changeMediaOrder(ids, 'Image order updated.'); } return; }
    if (button.hasAttribute('data-media-preview')) { mediaPreviewIndex = Number(button.dataset.mediaPreview); shell(); return; }
    if (button.dataset.action === 'continue-compose') {
      if (document.querySelector('#settings-form')?.dataset.dirty === 'true') return toast('Save your connection changes before continuing.', true);
      const verified = verifiedDestinations();
      draft.selected = verified.filter(id => draft.selected.includes(id));
      if (!draft.selected.length) draft.selected = verified;
      saveDraft(); navigate('compose'); return;
    }
    if (button.dataset.mode) {
      if (button.dataset.mode === 'TEST') { mode = 'TEST'; shell(); }
      else if (mode !== 'LIVE') {
        showDialog('Switch to live publishing?', '<p>Live mode publishes publicly to the destinations you select. You’ll review your posts and type POST to confirm each run.</p>', '<button class="button" data-dialog-close>Stay in test mode</button><button class="button danger" id="enable-live">Enable live mode</button>');
        document.querySelector('#enable-live').onclick = () => { mode = 'LIVE'; modal.close(); shell(); };
      } return;
    }
    if (button.dataset.control) { await api('/api/control', { method: 'POST', body: { action: button.dataset.control } }); await refresh(); if (view === 'activity') renderActivity(); return; }
    if (button.dataset.retry) {
      const runId = button.dataset.retry;
      const retryPlatform = button.dataset.retryPlatform;
      const retry = async confirmation => {
        await api(`/api/runs/${runId}/retry`, { method: 'POST', body: { mode: confirmation === 'POST' ? 'LIVE' : 'TEST', confirmation, platform: retryPlatform } });
        await refresh(); shell(); toast(retryPlatform ? `${platform(retryPlatform).name} queued.` : 'Failed destinations queued.');
      };
      showDialog(retryPlatform ? `Retry ${platform(retryPlatform).name}` : 'Retry failed destinations', `<p>${retryPlatform ? `Only ${escape(platform(retryPlatform).name)} will run, using its saved caption and image selection.` : 'Only destinations marked Failed will run again.'} Published, completed tests, skipped, and unverified outcomes are excluded. A test retry is selected by default.</p>`, '<button class="button" data-dialog-close>Cancel</button><button class="button" id="retry-live">Retry live…</button><button class="button primary" id="retry-test">Retry in TEST</button>');
      document.querySelector('#retry-test').onclick = async () => { try { await retry(); modal.close(); } catch (error) { toast(error.message, true); } };
      document.querySelector('#retry-live').onclick = () => {
        const selected = state.runs.find(r => r.id === runId).items.filter(i => i.status === 'failed' && (!retryPlatform || i.id === retryPlatform));
        confirmLive(retry, `Publish ${selected.length} failed destination${selected.length === 1 ? '' : 's'}`, selected.map(i => i.id));
      }; return;
    }
    if (button.dataset.resolve) {
      showDialog('Verify the outcome on the platform', `<p>Only confirm after checking ${escape(platform(button.dataset.platform).name)} directly. ${button.dataset.resolution === 'failed' ? 'Marking this as not published makes it eligible for retry.' : 'Marking this as published prevents it from being retried.'}</p>`, '<button class="button" data-dialog-close>Cancel</button><button class="button primary" id="confirm-resolution">I checked · confirm</button>');
      document.querySelector('#confirm-resolution').onclick = async () => {
        try { await api(`/api/runs/${button.dataset.resolve}/resolve`, { method: 'POST', body: { platform: button.dataset.platform, resolution: button.dataset.resolution } }); modal.close(); await refresh(); renderActivity(); }
        catch (error) { toast(error.message, true); }
      }; return;
    }
    if (button.dataset.copyManual) { const run = state.runs.find(r => r.id === button.dataset.copyManual); await copyText(run.captions.manychat); return; }
    if (button.dataset.useChannel) {
      const input = document.querySelector(`[name="${button.dataset.useChannel}.channelId"]`); input.value = button.dataset.channelId; document.querySelector('#settings-form').dataset.dirty = 'true'; toast('Channel ID filled in. Verify it belongs to this destination, then Save connections.'); return;
    }
    if (button.dataset.checkLogin) { await checkLogins([button.dataset.checkLogin]); return; }
    if (button.dataset.manualLogin) {
      if (document.querySelector('#settings-form')?.dataset.dirty === 'true') return toast('Save your connection changes before signing in.', true);
      const result = await api('/api/manual-login', { method: 'POST', body: { platform: button.dataset.manualLogin } });
      showDialog('Sign in with your regular browser', `<p>A separate ${escape(result.browser)} window is open with this tool’s saved profile. It has no automation connection during sign-in.</p><p>Finish signing in there, then <strong>close that separate window completely</strong>. Return to Connections and click <strong>Open &amp; check</strong> to use the saved session.</p>`, '<button class="button primary" data-dialog-close>Got it</button>');
      return;
    }
    if (button.dataset.imageStep) {
      const images = selectedMedia(); const id = button.dataset.previewPlatform; const img = document.querySelector(`#preview-image-${id}`); const i = (Number(img.dataset.index || 0) + Number(button.dataset.imageStep) + images.length) % images.length;
      img.src = images[i].url; img.alt = images[i].name; img.dataset.index = i; document.querySelector(`#image-count-${id}`).textContent = `${i + 1} / ${images.length}`; return;
    }
    if (button.dataset.action === 'import') importDialog();
    if (button.dataset.action === 'export') exportText();
    if (button.dataset.action === 'preview') await preview();
    if (button.dataset.action === 'run') { if (mode === 'LIVE') confirmLive(startRun, 'Publish selected', reviewDraft.selected); else await startRun(); }
    if (button.dataset.action === 'logins') await checkLogins();
    if (button.dataset.action === 'logout') { await api('/api/logout', { method: 'POST', body: {} }); showLogin(); }
    if (button.dataset.action === 'download-log') download('social-studio-report.json', JSON.stringify({ application: 'GO Classes Social Studio', createdBy: 'Mrinal', exportedAt: new Date().toISOString(), runs: state.runs }, null, 2), 'application/json');
  } catch (error) { toast(error.message, true); }
});
document.addEventListener('input', e => {
  if (e.target.hasAttribute('data-manychat-post')) { draft.manychat.postUrl = e.target.value; saveDraft(); return; }
  if (e.target.hasAttribute('data-manychat-link')) {
    const index = Number(e.target.dataset.manychatLink);
    const wasAutomatic = draft.manychat.linksMode === 'auto';
    customizeManychatLinks();
    draft.manychat.links[index] = { label: '', url: '', ...draft.manychat.links[index], [e.target.dataset.linkField]: e.target.value };
    if (wasAutomatic) {
      // Preserve focus while making the mode change visible.
      const help = document.querySelector('#manychat-link-fields .import-help');
      if (help) help.textContent = 'Custom buttons are kept when you edit the DM. Refresh from the DM to detect its current links again. The DM text stays as written.';
      const controls = document.querySelector('#manychat-link-fields .inline-controls');
      controls?.insertAdjacentHTML('beforeend', '<button type="button" class="button subtle small" data-manychat-auto>Refresh from DM</button>');
    }
    const message = document.querySelector('.manychat-links-error');
    if (message) { try { validateManychatDraft({ ...draft.manychat, postUrl: '' }, draft.captions.manychat); message.textContent = ''; } catch (error) { message.textContent = error.message; } }
    saveDraft(); return;
  }
  const id = e.target.dataset.caption;
  if (!id) return;
  draft.captions[id] = e.target.value;
  if (id === 'manychat') refreshManychatLinks();
  const p = platform(id); const length = countCharacters(e.target.value); const el = document.querySelector(`#count-${id}`);
  el.textContent = `${length.toLocaleString()} / ${p.limit.toLocaleString()}${id === 'x' ? ' *' : ''}`; el.classList.toggle('error-text', length > p.limit);
  const saved = document.querySelector('#draft-status'); if (saved) saved.textContent = 'Saving draft…'; saveDraft(); renderReadiness();
});
document.addEventListener('keydown', e => {
  if (e.target.matches('[data-drag-media]') && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault(); const id = e.target.dataset.dragMedia, ids = [...draft.mediaIds], i = ids.indexOf(id), target = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (target >= 0 && target < ids.length) { [ids[i], ids[target]] = [ids[target], ids[i]]; changeMediaOrder(ids, 'Image order updated.'); document.querySelector(`[data-drag-media="${id}"]`)?.focus(); } return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && view === 'compose' && !modal.open) { e.preventDefault(); preview(); }
  if (e.target.matches('[role="tab"]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    e.preventDefault(); const index = PLATFORMS.findIndex(p => p.id === captionTab);
    captionTab = PLATFORMS[e.key === 'Home' ? 0 : e.key === 'End' ? PLATFORMS.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + PLATFORMS.length) % PLATFORMS.length].id;
    shell(); document.querySelector(`#tab-${captionTab}`).focus();
  }
});
document.addEventListener('toggle', event => { if (event.target.matches?.('details[data-run-id]')) runExpansion.set(event.target.dataset.runId, event.target.open); }, true);
function renderActivity() {
  const el = document.querySelector('#activity-runs');
  if (el) el.innerHTML = renderRuns();
}
function applyStatus(data) {
  const changedConnections = JSON.stringify(state.login.items) !== JSON.stringify(data.login.items);
  const changedRuns = JSON.stringify(state.runs) !== JSON.stringify(data.runs);
  state.runs = data.runs; state.login = data.login; state.workerBusy = data.workerBusy; state.manychatNextReplies = data.manychatNextReplies;
  if (data.config) {
    state.config = data.config;
    document.querySelectorAll('#settings-form input[name], #settings-form textarea[name]').forEach(input => {
      if (input.dataset.edited === 'true') return;
      const [id, key] = input.name.split('.'); input.value = state.config.platforms[id]?.[key] ?? '';
    });
  }
  if (view === 'activity') renderActivity();
  if (view === 'settings') {
    for (const p of PLATFORMS) { const el = document.querySelector(`#login-status-${p.id}`); if (el) el.innerHTML = loginStatus(p.id); }
    const busy = workerBusy();
    const check = document.querySelector('[data-action="logins"]'); if (check) { check.disabled = busy; const span = check.querySelector('span'); if (span) span.textContent = state.login.running ? 'Checking…' : 'Check logins'; }
    const save = document.querySelector('#settings-form button[type="submit"]'); if (save) save.disabled = busy;
    const next = document.querySelector('[data-action="continue-compose"]'); if (next) next.disabled = busy || !verifiedDestinations().length;
    const count = document.querySelector('#verified-count'); if (count) count.textContent = `${verifiedDestinations().length} of ${PLATFORMS.length} destinations verified`;
  }
  if (view === 'compose' || view === 'preview') { const bar = document.querySelector('.actionbar'); if (bar) { const container = document.createElement('div'); container.innerHTML = actionbar(); bar.replaceWith(container.firstElementChild); } }
  if (changedConnections || changedRuns) { readinessVersion++; remoteReadiness = null; reviewValid = false; renderReadiness(); }
}
function setConnected(value) {
  connected = value;
  const label = document.querySelector('#connection-label'); if (label) label.textContent = value ? 'Worker connected' : 'Reconnecting to worker';
  document.querySelectorAll('.connection .dot').forEach(el => el.classList.toggle('offline', !value));
}
async function refresh() { const data = await api('/api/status'); applyStatus(data); setConnected(true); }
function connect() {
  events?.close(); clearInterval(pollTimer);
  events = new EventSource('/api/events');
  events.onmessage = e => { try { applyStatus(JSON.parse(e.data)); setConnected(true); } catch { /* A subsequent event will refresh the snapshot. */ } };
  events.onerror = () => setConnected(false);
  events.addEventListener('expired', showLogin);
  // Polling also works through proxies that do not support event streams (e.g. quick tunnels).
  pollTimer = setInterval(() => refresh().catch(() => setConnected(false)), 5000);
}
async function load() {
  const data = await api('/api/bootstrap'); state = data;
  draft.mediaIds = draft.mediaIds.filter(id => state.media.some(m => m.id === id));
  for (const [id, ids] of Object.entries(draft.mediaByPlatform)) { if (!platform(id) || !Array.isArray(ids)) delete draft.mediaByPlatform[id]; else draft.mediaByPlatform[id] = ids.filter(key => draft.mediaIds.includes(key)); }
  connected = true;
  if (activeRun()) view = 'activity';
  shell(); connect();
}
function showLogin() {
  events?.close(); clearInterval(pollTimer); connected = false; mode = 'TEST'; if (modal.open) modal.close();
  app.innerHTML = `<div class="signin"><div><form class="panel signin-card" id="signin-form"><div class="brand"><div class="brand-mark">G</div><div><div class="brand-title">Social Studio</div><div class="brand-caption">GO CLASSES</div></div></div><h1>A little more connected.</h1><p>Sign in to your company publishing workspace.<br>Your next great post starts here.</p><label class="field"><span>Workspace password</span><input name="password" type="password" autocomplete="current-password" required autofocus></label><div id="signin-error" class="dialog-error" role="alert"></div><button class="button primary" type="submit">Enter workspace ${icon('arrow')}</button></form><div class="signin-credit">Designed &amp; developed by Mrinal · © 2026</div></div></div>`;
  document.querySelector('#signin-form').onsubmit = async e => {
    e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
    try { await api('/api/login', { method: 'POST', body: { password: new FormData(e.target).get('password') } }); await load(); }
    catch (error) { const el = document.querySelector('#signin-error'); if (el) el.textContent = error.message; button.disabled = false; }
  };
}
setInterval(() => document.querySelectorAll('[data-elapsed-start]').forEach(el => { el.textContent = elapsed(el.dataset.elapsedStart, el.dataset.elapsedEnd); }), 1000);
try {
  const session = await api('/api/session');
  if (!session.authenticated) showLogin(); else await load();
} catch (error) {
  app.innerHTML = `<div class="signin"><div class="panel signin-card"><h1>The worker is unavailable.</h1><p>${escape(error.message)}<br>Start the server with npm start, then reload this page.</p><button class="button primary" id="reload-app">Try again</button><div class="signin-credit">Created by Mrinal</div></div></div>`;
  document.querySelector('#reload-app').onclick = () => location.reload();
}
