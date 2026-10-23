// Copyright (c) 2026 Mrinal. All rights reserved.
import {androidDeviceKey} from './android-device.js';
import { PLATFORMS, DESTINATIONS, validateDraft } from './platforms.js';
import { validateManychatDraft } from './manychat.js';
import { mediaFor } from './media.js';
import { usesInstagramAndroid } from './instagram.js';
import { instagramPostUrl } from './manychat.js';
import { DEFAULT_STORY_LAYOUT,instagramMethod,instagramMusicEnabled } from './instagram.js';
const instagramKey=(value,id)=>{
  const song=value?.music?.source==='manual'?{key:'manual'}:value?.music?.source==='details'?value.music.reference:value?.music?.selection,enabled=instagramMusicEnabled(value,id),track=enabled?JSON.stringify({key:song?.key||song?.id||song?.audioUrl||'',title:song?.title||'',artist:song?.artist||''}):'';
  if(id==='instagramMusic')return JSON.stringify({enabled,track});
  if(id==='instagram')return JSON.stringify({method:instagramMethod(value),enabled,track});
  const story=value?.story||{};
  return JSON.stringify({track,musicEnabled:enabled,linkEnabled:story.linkEnabled!==false,source:instagramPostUrl(story.sourcePostUrl)||'',url:story.linkEnabled===false?'':story.url?.trim()||'',label:story.linkEnabled===false?'':story.label?.trim()||'',layout:story.layout||DEFAULT_STORY_LAYOUT});
};
export function setupIssues(config, id) {
  if(['instagramStory','instagramMusic'].includes(id))id='instagram';
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
    const native=usesInstagramAndroid(draft.instagram,p.id),connection = ['instagramStory','instagramMusic'].includes(p.id)?login.instagramNative||(login.instagram?.transport==='android'?login.instagram:undefined):login[p.id];
    const deviceApplies=!native||!connection?.deviceKey||connection.deviceKey===androidDeviceKey(config?.androidDevice);
    const transportApplies=deviceApplies&&(!['instagram','instagramStory','instagramMusic'].includes(p.id)||(connection?.transport||'web')===(usesInstagramAndroid(draft.instagram,p.id)?'android':'web'));
    if (transportApplies&&blockedLoginStatuses.includes(connection?.status)) errors.push(connection.message || 'Check this connection before running.');
    const last = runs.find(run => run.items.some(item => item.id === p.id));
    const item = last?.items.find(item => item.id === p.id);
    const previousIds = last?.mediaByPlatform?.[p.id] || last?.media.map(m => m.id);
    const sameOptions = !['instagram','instagramStory'].includes(p.id) || instagramKey(last?.instagram,p.id)===instagramKey(draft.instagram,p.id);
    const parentSame=p.id!=='instagramStory'||Boolean(instagramPostUrl(draft.instagram?.story?.sourcePostUrl))||last?.captions.instagram===draft.captions?.instagram&&JSON.stringify(last?.mediaByPlatform?.instagram||last?.media.map(m=>m.id))===JSON.stringify(mediaFor(draft,media,'instagram').map(m=>m.id));
    const currentIds=['instagramStory','instagramMusic'].includes(p.id)?[]:mediaFor(draft,media,p.id).map(m=>m.id);
    const sameDraft = sameOptions && parentSame && last?.captions[p.id] === draft.captions?.[p.id] && JSON.stringify(previousIds) === JSON.stringify(currentIds);
    const unresolvedFeed=p.id==='instagram'&&runs.some(run=>run.items.some(i=>i.id==='instagram'&&i.status==='uncertain')&&run.captions?.instagram===draft.captions?.instagram&&JSON.stringify(run.mediaByPlatform?.instagram||run.media?.map(m=>m.id))===JSON.stringify(currentIds));
    if(unresolvedFeed)errors.push('An Instagram submission with these images and caption needs verification in Activity before another attempt, even with a different posting method.');
    const reviewedFreshAttempt=Boolean(draft.restartOf&&draft.restartOf===last?.id&&item?.status==='failed'&&!item.submitting);
    if (sameDraft && !reviewedFreshAttempt && ['failed', 'uncertain', 'attention', 'needs_setup'].includes(item?.status)) errors.push(`Last attempt needs review in Activity: ${String(item.message).slice(0, 300)}`);
    return [p.id, { ready: !errors.length, errors: [...new Set(errors)] }];
  }));
}
