// Copyright (c) 2026 Mrinal. All rights reserved.
import { PLATFORMS, DESTINATIONS, validateDraft } from './platforms.js';
import { validateManychatDraft } from './manychat.js';
import { mediaFor } from './media.js';
import { instagramPostUrl } from './manychat.js';
import { DEFAULT_STORY_LAYOUT } from './instagram.js';
const instagramKey=(value,id)=>{const song=value?.music?.selection,track=song?.key||song?.id||'';if(id==='instagram')return JSON.stringify({enabled:value?.music?.enabled===true,track:value?.music?.enabled?track:''});const story=value?.story||{};return JSON.stringify({track:value?.music?.enabled?track:'',musicEnabled:value?.music?.enabled===true,linkEnabled:story.linkEnabled!==false,source:instagramPostUrl(story.sourcePostUrl)||'',url:story.linkEnabled===false?'':story.url?.trim()||'',label:story.linkEnabled===false?'':story.label?.trim()||'',layout:story.layout||DEFAULT_STORY_LAYOUT});};
export function setupIssues(config, id) {
  if(id==='instagramStory')id='instagram';
  const p = config?.platforms?.[id] || {};
  if (['instagram', 'x'].includes(id) && !p.handle) return ['Set the expected account handle in Connections.'];
  if (id === 'linkedin' && (!p.companyPageUrl || !p.companyName)) return ['Set the company admin URL and exact name in Connections.'];
  if (id.startsWith('youtube') && (!p.channelId || !p.channelName || !p.handle)) return ['Set the channel ID, exact name and handle in Connections.'];
  if (id === 'manychat' && (!p.flowUrl || !config?.platforms?.instagram?.handle)) return ['Set the ManyChat builder and Instagram account in Connections.'];
  if (['whatsapp', 'telegram'].includes(id) && (!p.channelName || !p.channelUrl)) return ['Set the exact channel name and public channel link in Connections.'];
  return [];
}
export const blockedLoginStatuses = ['needs_login', 'wrong_account', 'needs_access', 'needs_setup', 'verification_failed', 'loading_timeout', 'network_error', 'needs_attention', 'manual_login'];
export function destinationReadiness(draft, media, config, login = {}, xLength, runs = []) {
  return Object.fromEntries(DESTINATIONS.map(p => {
    const errors = validateDraft({ ...draft, selected: p.id==='instagramStory'&&draft.selected?.includes('instagram') ? ['instagram','instagramStory'] : [p.id] }, media, xLength);
    errors.push(...setupIssues(config, p.id));
    if (p.id === 'manychat') { try { validateManychatDraft(draft.manychat, draft.captions?.manychat); } catch (error) { errors.push(error.message); } }
    const connection = login[p.id==='instagramStory'?'instagram':p.id];
    if (blockedLoginStatuses.includes(connection?.status)) errors.push(connection.message || 'Check this connection before running.');
    const last = runs.find(run => run.items.some(item => item.id === p.id));
    const item = last?.items.find(item => item.id === p.id);
    const previousIds = last?.mediaByPlatform?.[p.id] || last?.media.map(m => m.id);
    const sameOptions = !['instagram','instagramStory'].includes(p.id) || instagramKey(last?.instagram,p.id)===instagramKey(draft.instagram,p.id);
    const parentSame=p.id!=='instagramStory'||Boolean(instagramPostUrl(draft.instagram?.story?.sourcePostUrl))||last?.captions.instagram===draft.captions?.instagram&&JSON.stringify(last?.mediaByPlatform?.instagram||last?.media.map(m=>m.id))===JSON.stringify(mediaFor(draft,media,'instagram').map(m=>m.id));
    const currentIds=p.id==='instagramStory'?[]:mediaFor(draft,media,p.id).map(m=>m.id);
    const sameDraft = sameOptions && parentSame && last?.captions[p.id] === draft.captions?.[p.id] && JSON.stringify(previousIds) === JSON.stringify(currentIds);
    if (sameDraft && ['failed', 'uncertain', 'attention', 'needs_setup'].includes(item?.status)) errors.push(`Last attempt needs review in Activity: ${String(item.message).slice(0, 300)}`);
    return [p.id, { ready: !errors.length, errors: [...new Set(errors)] }];
  }));
}
