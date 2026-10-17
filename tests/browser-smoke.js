// Offline smoke test for installed Chrome/Edge + CDP and profile persistence.
// Copyright (c) 2026 Mrinal. All rights reserved.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BrowserManager, resolveBrowser } from '../server/automation/browser.js';
import { pasteCaption } from '../server/automation/utils.js';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-browser-smoke-'));
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><title>Social Studio browser connection test · Mrinal</title><h1>Browser connection test</h1><textarea aria-label="Caption"></textarea><input type="file" accept="image/png">');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}`;
const manager = new BrowserManager({ dataDir });
try {
  const installed = await resolveBrowser();
  const page = await manager.page('test');
  await page.goto(url);
  await pasteCaption(page, page.getByLabel('Caption'), 'नमस्ते ✅\nSocial Studio · Mrinal');
  assert.equal(await page.getByLabel('Caption').inputValue(), 'नमस्ते ✅\nSocial Studio · Mrinal');
  await page.locator('input[type="file"]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('test fixture') });
  assert.equal(await page.locator('input[type="file"]').evaluate(el => el.files[0].name), 'test.png');
  await page.context().addCookies([{ name: 'studio_test', value: 'saved', url, expires: Math.floor(Date.now() / 1000) + 3600 }]);
  await fs.mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/browser-connection.png' });
  await manager.close();
  const restored = await manager.page('test'); await restored.goto(url);
  assert((await restored.context().cookies(url)).some(c => c.name === 'studio_test' && c.value === 'saved'));
  console.log(`Browser connection passed: ${installed.label}, Unicode paste, file upload, screenshot, and profile persistence. No social websites were visited.`);
} finally { await manager.close(); server.closeAllConnections(); server.close(); }
