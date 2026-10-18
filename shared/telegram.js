// Copyright (c) 2026 Mrinal. All rights reserved.
export const DEFAULT_TELEGRAM_NAME = 'GO Classes';
export const DEFAULT_TELEGRAM_URL = 'https://t.me/goclasses_cse';
export function telegramChannelUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 't.me' || url.port || url.username || url.password || url.search || url.hash) return null;
    const match = url.pathname.match(/^\/([a-z][a-z0-9_]{4,31})\/?$/i);
    return match ? 'https://t.me/' + match[1].toLowerCase() : null;
  } catch { return null; }
}
export const telegramHandle = value => telegramChannelUrl(value)?.split('/').at(-1);
export const telegramWebUrl = value => {
  const handle = telegramHandle(value);
  if (!handle) throw new Error('Set the exact public Telegram channel URL in Connections.');
  return 'https://web.telegram.org/k/#@' + handle;
};
