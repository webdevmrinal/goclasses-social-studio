// Copyright (c) 2026 Mrinal. All rights reserved.
export function mediaIdsFor(draft, id) {
  return Object.hasOwn(draft.mediaByPlatform || {}, id) ? draft.mediaByPlatform[id] : draft.mediaIds || [];
}
export function mediaFor(draft, media, id) {
  if (!Object.hasOwn(draft.mediaByPlatform || {}, id)) return media;
  return Array.isArray(draft.mediaByPlatform[id]) ? draft.mediaByPlatform[id].map(key => media.find(item => item.id === key)).filter(Boolean) : [];
}
export function selectionErrors(draft) {
  const map = draft.mediaByPlatform;
  if (map === undefined) return [];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return ['Invalid destination image selections.'];
  const library = new Set(draft.mediaIds || []);
  return Object.entries(map).flatMap(([id, ids]) => !Array.isArray(ids) || ids.some(key => typeof key !== 'string' || !library.has(key)) || new Set(ids).size !== ids.length ? [`${id}: choose unique images from this draft's library.`] : []);
}
