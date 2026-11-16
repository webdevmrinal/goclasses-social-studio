// Copyright (c) 2026 Mrinal. All rights reserved.
import { mediaFor, selectionErrors } from './media.js';
import {mediaKind,mediaSelectionErrors,mediaSupport} from './media-capabilities.js';
import { INSTAGRAM_STORY, INSTAGRAM_MUSIC, instagramOptions, storyErrors, instagramHashtags } from './instagram.js';
import {extractStoryImport} from './story-import.js';
export const PLATFORMS = [
  { id: 'instagram', delimiter: 'INSTAGRAM', name: 'Instagram', detail: 'Photo post or Reel', color: '#c54786', icon: 'instagram', limit: 2200, maxImages: 10 },
  { id: 'linkedin', delimiter: 'LINKEDIN', name: 'LinkedIn', detail: 'Company post', color: '#1479ba', icon: 'linkedin', limit: 3000, maxImages: 10, textOnly: true },
  { id: 'x', delimiter: 'X', name: 'X', detail: 'Timeline post', color: '#25272b', icon: 'x', limit: 280, maxImages: 4, textOnly: true },
  { id: 'youtubeDA', delimiter: 'YOUTUBE_DA', name: 'YouTube · GATE DA', detail: 'Community post', color: '#e34c4b', icon: 'youtube', limit: 1500, maxImages: 10, textOnly: true },
  { id: 'youtubeCS', delimiter: 'YOUTUBE_CS', name: 'YouTube · GATE CS', detail: 'Community post', color: '#e34c4b', icon: 'youtube', limit: 1500, maxImages: 10, textOnly: true },
  { id: 'manychat', delimiter: 'MANYCHAT', name: 'ManyChat', detail: 'Instagram comment → DM', color: '#168b78', icon: 'message', limit: 1000, maxImages: 10 },
  { id: 'whatsapp', delimiter: 'WHATSAPP', name: 'WhatsApp Channel', detail: 'Channel update · 1 image', color: '#138b63', icon: 'whatsapp', limit: 1024, maxImages: 1, optionalImport: true, textOnly: true },
  { id: 'telegram', delimiter: 'TELEGRAM', name: 'Telegram Channel', detail: 'Channel post · photo album', color: '#2488b8', icon: 'telegram', limit: 4096, maxImages: 10, optionalImport: true, textOnly: true }
];

export const DESTINATIONS = [...PLATFORMS, INSTAGRAM_STORY, INSTAGRAM_MUSIC];

export const captionLimit = (p, images = 0) => p.id === 'telegram' && images ? 1024 : p.limit;
export const captionLength = (p, text = '') => p.id === 'telegram' ? text.length : countCharacters(text);
export const countCharacters = text => [...(text || '')].length;

export function parseCaptions(input) {
  const imported=extractStoryImport(input);input=imported.text;
  const captions = {};
  const errors = [...imported.errors];
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
  return { captions, errors,storyImport:imported.story,warnings:imported.warnings };
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
    if (p.id !== 'manychat') {
      errors.push(...mediaSelectionErrors(p.id,images));
      if (!p.textOnly && !images.length) errors.push(`${p.name}: add at least one image or video.`);
      const explicitTextOnly=Object.hasOwn(draft.mediaByPlatform||{},p.id)&&Array.isArray(draft.mediaByPlatform[p.id])&&draft.mediaByPlatform[p.id].length===0;
      if(!images.length&&media.length&&!explicitTextOnly){const unsupported=media.find(m=>!mediaSupport(p.id,m).supported);if(unsupported)errors.push(`${p.name}: ${mediaSupport(p.id,unsupported).reason}`);}
      if(p.id==='instagram'&&images.some(m=>mediaKind(m)==='video')){
        if(draft.instagram?.postingMethod==='android')errors.push('Instagram Reels: choose Web posting for video uploads.');
        if(draft.instagram?.music?.enabled)errors.push('Instagram Reels use the audio in the uploaded video. Turn off the separate photo music step.');
        if(selected.includes('instagramStory')||selected.includes('instagramMusic')||draft.instagram?.story?.enabled)errors.push('Instagram Reels: separate photo music and feed-to-Story steps cannot run with a video upload.');
      }
    }
  }
  if(selected.includes('instagramMusic')&&draft.instagram?.music?.enabled!==true)errors.push('Instagram music: enable music before retrying this step.');
  if(selected.some(id=>['instagram','instagramStory','instagramMusic'].includes(id))) {
    try { const options=instagramOptions({...draft.instagram,story:{...draft.instagram?.story,enabled:selected.includes('instagramStory')}}); if(selected.includes('instagramStory'))errors.push(...storyErrors(options.story,selected)); }catch(e){errors.push(e.message);}
  }
  return errors;
}
