// Copyright (c) 2026 Mrinal. All rights reserved.
import { mediaFor, selectionErrors } from './media.js';
import { INSTAGRAM_STORY, instagramOptions, storyErrors, instagramHashtags } from './instagram.js';
export const PLATFORMS = [
  { id: 'instagram', delimiter: 'INSTAGRAM', name: 'Instagram', detail: 'Feed post', color: '#c54786', icon: 'instagram', limit: 2200, maxImages: 10 },
  { id: 'linkedin', delimiter: 'LINKEDIN', name: 'LinkedIn', detail: 'Company photo gallery', color: '#1479ba', icon: 'linkedin', limit: 3000, maxImages: 10, textOnly: true },
  { id: 'x', delimiter: 'X', name: 'X', detail: 'Timeline post', color: '#25272b', icon: 'x', limit: 280, maxImages: 4, textOnly: true },
  { id: 'youtubeDA', delimiter: 'YOUTUBE_DA', name: 'YouTube · GATE DA', detail: 'Community post', color: '#e34c4b', icon: 'youtube', limit: 1500, maxImages: 10, textOnly: true },
  { id: 'youtubeCS', delimiter: 'YOUTUBE_CS', name: 'YouTube · GATE CS', detail: 'Community post', color: '#e34c4b', icon: 'youtube', limit: 1500, maxImages: 10, textOnly: true },
  { id: 'manychat', delimiter: 'MANYCHAT', name: 'ManyChat', detail: 'Instagram comment → DM', color: '#168b78', icon: 'message', limit: 1000, maxImages: 10 },
  { id: 'whatsapp', delimiter: 'WHATSAPP', name: 'WhatsApp Channel', detail: 'Channel update · 1 image', color: '#138b63', icon: 'whatsapp', limit: 1024, maxImages: 1, optionalImport: true, textOnly: true },
  { id: 'telegram', delimiter: 'TELEGRAM', name: 'Telegram Channel', detail: 'Channel post · photo album', color: '#2488b8', icon: 'telegram', limit: 4096, maxImages: 10, optionalImport: true, textOnly: true }
];

export const DESTINATIONS = [...PLATFORMS, INSTAGRAM_STORY];

export const captionLimit = (p, images = 0) => p.id === 'telegram' && images ? 1024 : p.limit;
export const captionLength = (p, text = '') => p.id === 'telegram' ? text.length : countCharacters(text);
export const countCharacters = text => [...(text || '')].length;

export function parseCaptions(input) {
  const captions = {};
  const errors = [];
  const headers = [...input.matchAll(/^\s*=====([A-Z_]+)=====\s*$/gm)];
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const platform = DESTINATIONS.find(p => p.delimiter === header[1]);
    if (!platform) { errors.push(`Unknown section: ${header[1]}`); continue; }
    if (Object.hasOwn(captions, platform.id)) errors.push(`Duplicate section: ${header[1]}`);
    captions[platform.id] = input.slice(header.index + header[0].length, headers[i + 1]?.index ?? input.length).trim();
  }
  for (const platform of PLATFORMS) captions[platform.id] ||= '';
  if(!Object.values(captions).some(value=>value.trim()))errors.push('Add at least one caption section.');
  captions.instagramStory ||= '';
  return { captions, errors };
}

export function validateDraft(draft, media, xLength = countCharacters) {
  const errors = selectionErrors(draft);
  const selected = Array.isArray(draft.selected) ? draft.selected : [];
  if (!selected.length) errors.push('Select at least one destination.');
  if (new Set(selected).size !== selected.length) errors.push('Duplicate destinations are not allowed.');
  if (selected.some(id => !DESTINATIONS.some(p => p.id === id))) errors.push('Unknown destination.');
  for (const p of PLATFORMS.filter(p => selected.includes(p.id))) {
    const images = mediaFor(draft, media, p.id);
    const caption = draft.captions?.[p.id];
    if (typeof caption !== 'string' || !caption.trim()) errors.push(`${p.name}: add a caption.`);
    else if ((p.id === 'x' ? xLength(caption) : captionLength(p, caption)) > captionLimit(p, images.length)) errors.push(`${p.name}: caption exceeds ${captionLimit(p, images.length).toLocaleString()} characters${p.id === 'telegram' && images.length ? ' with images' : ''}.`);
    if(p.id==='instagram'&&instagramHashtags(caption).length>5)errors.push('Instagram: use 5 hashtags or fewer to avoid caption changes.');
    if (p.id !== 'manychat' && !p.textOnly && !images.length) errors.push(`${p.name}: add at least one image.`);
    if (p.id !== 'manychat' && images.length > p.maxImages) errors.push(`${p.name}: use ${p.maxImages} image${p.maxImages === 1 ? '' : 's'} or fewer.`);
  }
  if(selected.includes('instagram') || selected.includes('instagramStory')) {
    try { const options=instagramOptions({...draft.instagram,story:{...draft.instagram?.story,enabled:selected.includes('instagramStory')}}); if(selected.includes('instagramStory'))errors.push(...storyErrors(options.story,selected)); }catch(e){errors.push(e.message);}
  }
  return errors;
}
