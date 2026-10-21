// Copyright (c) 2026 Mrinal. All rights reserved.
export const TEXT_ONLY_PLATFORMS = Object.freeze(['linkedin', 'x', 'youtubeDA', 'youtubeCS', 'whatsapp', 'telegram']);

export function mediaIdsFor(draft, id) {
  return Object.hasOwn(draft.mediaByPlatform || {}, id) ? draft.mediaByPlatform[id] : (id==='whatsapp'?(draft.mediaIds||[]).slice(0,1):draft.mediaIds||[]);
}
export function mediaFor(draft, media, id) {
  if(id==='instagramMusic')return [];
  if (!Object.hasOwn(draft.mediaByPlatform || {}, id)) return id==='whatsapp'?media.slice(0,1):media;
  return Array.isArray(draft.mediaByPlatform[id]) ? draft.mediaByPlatform[id].map(key => media.find(item => item.id === key)).filter(Boolean) : [];
}
export function selectionErrors(draft) {
  const map = draft.mediaByPlatform;
  if (map === undefined) return [];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return ['Invalid destination image selections.'];
  const library = new Set(draft.mediaIds || []);
  return Object.entries(map).flatMap(([id, ids]) => !Array.isArray(ids) || ids.some(key => typeof key !== 'string' || !library.has(key)) || new Set(ids).size !== ids.length ? [`${id}: choose unique images from this draft's library.`] : []);
}

export function updateDraftMedia(draft,ids,replacements={}){
 draft.mediaIds=ids;draft.textOnlyPlatforms=(draft.textOnlyPlatforms||[]).filter(id=>TEXT_ONLY_PLATFORMS.includes(id));
 for(const [id,chosen] of Object.entries(draft.mediaByPlatform||{})){
  const next=Array.isArray(chosen)?chosen.map(key=>replacements[key]||key).filter(key=>ids.includes(key)):[];
  if(!next.length&&!draft.textOnlyPlatforms.includes(id))delete draft.mediaByPlatform[id];else draft.mediaByPlatform[id]=next;
 }
}
export function setTextOnly(draft,id,enabled){draft.textOnlyPlatforms=(draft.textOnlyPlatforms||[]).filter(key=>key!==id);if(enabled&&TEXT_ONLY_PLATFORMS.includes(id))draft.textOnlyPlatforms.push(id);}
export function metadataNeedsReview(draft,media){
 const ids=new Set((draft.selected||[]).filter(id=>!['manychat','instagramStory','instagramMusic'].includes(id)).flatMap(id=>mediaFor(draft,media,id).map(m=>m.id)));
 return media.filter(m=>ids.has(m.id)&&!m.verification&&(m.metadata?.credentials||m.metadata?.aiMarkers?.length));
}
export function metadataConsentValid(images,consent={}){return images.every(image=>consent?.[image.id]===(image.fileHash||image.id));}
