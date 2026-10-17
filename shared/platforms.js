// Copyright (c) 2026 Mrinal. All rights reserved.
export const PLATFORMS = [
  { id: 'instagram', delimiter: 'INSTAGRAM', name: 'Instagram', detail: 'Feed post', color: '#c54786', icon: 'instagram', limit: 2200, maxImages: 10 },
  { id: 'linkedin', delimiter: 'LINKEDIN', name: 'LinkedIn', detail: 'Company photo gallery', color: '#1479ba', icon: 'linkedin', limit: 3000, maxImages: 10 },
  { id: 'x', delimiter: 'X', name: 'X', detail: 'Timeline post', color: '#25272b', icon: 'x', limit: 280, maxImages: 4 },
  { id: 'youtubeDA', delimiter: 'YOUTUBE_DA', name: 'YouTube · GATE DA', detail: 'Community post', color: '#e34c4b', icon: 'youtube', limit: 1500, maxImages: 10 },
  { id: 'youtubeCS', delimiter: 'YOUTUBE_CS', name: 'YouTube · GATE CS', detail: 'Community post', color: '#e34c4b', icon: 'youtube', limit: 1500, maxImages: 10 },
  { id: 'manychat', delimiter: 'MANYCHAT', name: 'ManyChat', detail: 'Instagram comment → DM', color: '#168b78', icon: 'message', limit: 1000, maxImages: 10 },
  { id: 'whatsapp', delimiter: 'WHATSAPP', name: 'WhatsApp Channel', detail: 'Channel update · 1 image', color: '#138b63', icon: 'whatsapp', limit: 1024, maxImages: 1, optionalImport: true, textOnly: true }
];

export const countCharacters = text => [...(text || '')].length;

export function parseCaptions(input) {
  const captions = {};
  const errors = [];
  const headers = [...input.matchAll(/^\s*=====([A-Z_]+)=====\s*$/gm)];
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const platform = PLATFORMS.find(p => p.delimiter === header[1]);
    if (!platform) { errors.push(`Unknown section: ${header[1]}`); continue; }
    if (Object.hasOwn(captions, platform.id)) errors.push(`Duplicate section: ${header[1]}`);
    captions[platform.id] = input.slice(header.index + header[0].length, headers[i + 1]?.index ?? input.length).trim();
  }
  for (const platform of PLATFORMS) {
    if (platform.optionalImport) captions[platform.id] ||= '';
    else if (!captions[platform.id]) errors.push(`${platform.name}: section is missing or empty.`);
  }
  return { captions, errors };
}

export function validateDraft(draft, media, xLength = countCharacters) {
  const errors = [];
  const selected = Array.isArray(draft.selected) ? draft.selected : [];
  if (!selected.length) errors.push('Select at least one destination.');
  if (new Set(selected).size !== selected.length) errors.push('Duplicate destinations are not allowed.');
  if (selected.some(id => !PLATFORMS.some(p => p.id === id))) errors.push('Unknown destination.');
  for (const p of PLATFORMS.filter(p => selected.includes(p.id))) {
    const caption = draft.captions?.[p.id];
    if (typeof caption !== 'string' || !caption.trim()) errors.push(`${p.name}: add a caption.`);
    else if ((p.id === 'x' ? xLength(caption) : countCharacters(caption)) > p.limit) errors.push(`${p.name}: caption exceeds ${p.limit.toLocaleString()} characters.`);
    if (p.id !== 'manychat' && !p.textOnly && !media.length) errors.push(`${p.name}: add at least one image.`);
    if (media.length > p.maxImages) errors.push(`${p.name}: use ${p.maxImages} image${p.maxImages === 1 ? '' : 's'} or fewer.`);
  }
  return errors;
}
