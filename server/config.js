// Copyright (c) 2026 Mrinal. All rights reserved.
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_REPLY_MESSAGES, replyPool, manychatBuilderUrl } from '../shared/manychat.js';
import { DEFAULT_WHATSAPP_NAME, DEFAULT_WHATSAPP_URL, whatsappChannelUrl } from '../shared/whatsapp.js';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.resolve(ROOT, process.env.DATA_DIR || 'data');
export const defaults = {
  platforms: {
    instagram: { handle: '' },
    linkedin: { companyPageUrl: 'https://www.linkedin.com/company/74757117/admin/dashboard/', companyName: 'GO Classes' },
    x: { handle: '' },
    youtubeDA: { channelId: '', channelName: 'GO Classes for GATE DA', handle: 'GOClassesforGATEDA' },
    youtubeCS: { channelId: '', channelName: 'GO Classes for GATE CS', handle: 'GOClassesforGATECS' },
    manychat: { flowUrl: 'https://app.manychat.com/fb5759472/cms/easy-builder?campaign_type=easy_builder_cgt_next_post_multi_links', replyMessages: DEFAULT_REPLY_MESSAGES.join('\n') },
    whatsapp: { channelName: DEFAULT_WHATSAPP_NAME, channelUrl: DEFAULT_WHATSAPP_URL }
  }
};
export async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}
export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return structuredClone(fallback); throw error; }
}
export async function loadConfig() { return readJson(path.join(DATA, 'config.json'), defaults); }
export function validateConfig(input) {
  const result = structuredClone(defaults);
  for (const [id, fields] of Object.entries(result.platforms)) {
    for (const key of Object.keys(fields)) {
      const value = input?.platforms?.[id]?.[key] ?? fields[key];
      if (typeof value !== 'string' || value.length > (key === 'replyMessages' ? 10000 : 500)) throw new Error(`Invalid ${id} ${key}.`);
      fields[key] = value.trim().replace(/^@/, key === 'handle' ? '' : '@');
    }
  }
  const li = result.platforms.linkedin.companyPageUrl;
  if (li && !/^https:\/\/www\.linkedin\.com\/company\/[\w%-]+\/admin\/(?:[\w/-]*)?(?:[?#].*)?$/.test(li)) throw new Error('Use a LinkedIn company /admin/ URL, not a personal profile.');
  for (const id of ['youtubeDA', 'youtubeCS']) {
    const { channelId, handle } = result.platforms[id];
    if (channelId && !/^UC[\w-]{22}$/.test(channelId)) throw new Error(`${id}: channel IDs begin with UC and contain 24 characters.`);
    if (handle && !/^[\p{L}\p{N}_.-]+$/u.test(handle)) throw new Error(`${id}: enter a channel handle without a URL.`);
  }
  if (result.platforms.youtubeDA.channelId && result.platforms.youtubeDA.channelId === result.platforms.youtubeCS.channelId) throw new Error('The DA and CS channel IDs must be different.');
  for (const id of ['instagram', 'x']) if (result.platforms[id].handle && !/^[\w.]+$/.test(result.platforms[id].handle)) throw new Error(`${id}: enter the handle without a URL.`);
  const flow = result.platforms.manychat.flowUrl;
  if (flow) { const url = new URL(flow); if (url.protocol !== 'https:' || !/(^|\.)manychat\.com$/.test(url.hostname) || url.username || url.password) throw new Error('ManyChat flow URL must be an HTTPS manychat.com address.'); }
  if (flow) result.platforms.manychat.flowUrl = manychatBuilderUrl(flow);
  result.platforms.manychat.replyMessages = replyPool(result.platforms.manychat.replyMessages).join('\n');
  const wa = result.platforms.whatsapp;
  if (wa.channelName.length > 100) throw new Error('WhatsApp: channel names can contain up to 100 characters.');
  if (wa.channelUrl) { const url = whatsappChannelUrl(wa.channelUrl); if (!url) throw new Error('WhatsApp: use the exact https://whatsapp.com/channel/… channel link, not a chat, group, or phone link.'); wa.channelUrl = url; }
  return result;
}
export function setupErrors(config, selected) {
  const errors = [];
  for (const id of selected) {
    const p = config.platforms[id];
    if ((id === 'instagram' || id === 'x') && !p.handle) errors.push(`Set the expected ${id === 'x' ? 'X' : 'Instagram'} account handle in Settings.`);
    if (id === 'linkedin' && (!p.companyPageUrl || !p.companyName)) errors.push('Set the LinkedIn company admin URL and company name in Settings.');
    if (id.startsWith('youtube') && (!p.channelId || !p.channelName || !p.handle)) errors.push(`Set the ${id === 'youtubeDA' ? 'GATE DA' : 'GATE CS'} channel ID, handle, and name in Settings.`);
    if (id === 'manychat' && !p.flowUrl) errors.push('Set the ManyChat flow URL in Settings.');
    if (id === 'manychat' && !config.platforms.instagram.handle) errors.push('Set the Instagram account handle in Connections so ManyChat can verify its connected account.');
    if (id === 'whatsapp' && (!p.channelName || !p.channelUrl)) errors.push('Set the exact WhatsApp channel name and public channel link in Connections.');
  }
  return errors;
}
