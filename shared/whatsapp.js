// Copyright (c) 2026 Mrinal. All rights reserved.
export const DEFAULT_WHATSAPP_NAME = 'GO Classes for GATE CSE/DA';
export const DEFAULT_WHATSAPP_URL = 'https://whatsapp.com/channel/0029Vb5iXnYJUM2bxaL3Rd1K';
export function whatsappChannelUrl(value) {
  try {
    const url = new URL(value), match = url.pathname.match(/^\/channel\/([A-Za-z0-9]{16,64})\/?$/);
    return url.protocol === 'https:' && /^(?:www\.)?whatsapp\.com$/.test(url.hostname) && !url.username && !url.password && !url.port && match ? `https://whatsapp.com/channel/${match[1]}` : null;
  } catch { return null; }
}
