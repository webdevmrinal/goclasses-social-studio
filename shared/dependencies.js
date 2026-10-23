// Copyright (c) 2026 Mrinal. Draft selection and existing-post dependencies.
import { DESTINATIONS } from './platforms.js';
import { instagramPostUrl } from './manychat.js';

const dependencies = [
  { id: 'manychat', parentId: 'instagram', field: 'manychat.postUrl' },
  { id: 'instagramStory', parentId: 'instagram', field: 'instagram.story.sourcePostUrl' }
];
const sourceValue = (draft, id) => id === 'manychat' ? draft.manychat?.postUrl : draft.instagram?.story?.sourcePostUrl;
// Validate the pasted address before URL parsing can normalize malformed paths.
const exactPostUrl = value => typeof value === 'string' && /^https:\/\/(?:www\.)?instagram\.com\/(?:[\w][\w.]*\/)?(?:p|reel)\/[\w-]+\/?(?:[?#][^\s\\]*)?$/i.test(value) ? instagramPostUrl(value) : null;

export function syncStorySelection(draft) {
  draft.instagram ||= {};
  draft.instagram.story ||= {};
  draft.instagram.story.enabled = Array.isArray(draft.selected) && draft.selected.includes('instagramStory');
  return draft;
}

export function setDestinationSelected(draft, id, enabled, { cascade = true } = {}) {
  if (!DESTINATIONS.some(destination => destination.id === id)) throw new Error('Unknown destination.');
  const selected = new Set(Array.isArray(draft.selected) ? draft.selected : []);
  if (enabled) selected.add(id);
  else {
    selected.delete(id);
    if (cascade && id === 'instagram') selected.delete('instagramStory');
  }
  draft.selected = DESTINATIONS.filter(destination => selected.has(destination.id)).map(destination => destination.id);
  return syncStorySelection(draft);
}

export function dependencyRequirements(draft) {
  const selected = Array.isArray(draft.selected) ? draft.selected : [];
  if (selected.includes('instagram')) return [];
  return dependencies.filter(dependency => selected.includes(dependency.id) && !exactPostUrl(sourceValue(draft, dependency.id))).map(dependency => ({ ...dependency }));
}

export function resolveDependencyLinks(draft, links = {}) {
  const next = structuredClone(draft);
  for (const { id } of dependencyRequirements(draft)) {
    const postUrl = exactPostUrl(links?.[id]);
    if (!postUrl) throw new Error(`${id === 'manychat' ? 'ManyChat' : 'Instagram Story'}: enter the exact HTTPS Instagram post or reel URL.`);
    if (id === 'manychat') { next.manychat ||= {}; next.manychat.postUrl = postUrl; }
    else { next.instagram ||= {}; next.instagram.story ||= {}; next.instagram.story.sourcePostUrl = postUrl; }
  }
  return syncStorySelection(next);
}

export function skipDestination(draft, id) {
  return setDestinationSelected(structuredClone(draft), id, false, { cascade: false });
}
