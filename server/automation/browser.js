// Copyright (c) 2026 Mrinal. All rights reserved.
import { chromium } from 'playwright';
import { spawn, execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DATA } from '../config.js';
import { wait } from './utils.js';
import { InterventionError } from './utils.js';

export function browserCandidates(platform = process.platform, env = process.env, home = os.homedir()) {
  const chrome = platform === 'win32' ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).map(root => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    : platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  const edge = platform === 'win32' ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).map(root => path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    : platform === 'darwin' ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] : ['/usr/bin/microsoft-edge'];
  return [...chrome.map(executable => ({ executable, key: 'chrome', label: 'Google Chrome' })), ...edge.map(executable => ({ executable, key: 'msedge', label: 'Microsoft Edge' }))];
}
export async function resolveBrowser({ installedOnly = false } = {}) {
  if (process.env.BROWSER_EXECUTABLE) {
    await fs.access(process.env.BROWSER_EXECUTABLE);
    return { executable: process.env.BROWSER_EXECUTABLE, key: 'custom', label: 'Configured browser' };
  }
  const requested = process.env.BROWSER_CHANNEL;
  for (const browser of browserCandidates()) {
    if (requested && requested !== browser.key) continue;
    try { await fs.access(browser.executable); return browser; } catch { /* Try the next supported installation. */ }
  }
  if (installedOnly) throw new Error('Install Google Chrome or Microsoft Edge for regular manual sign-in. You can also set BROWSER_EXECUTABLE in .env.');
  if (requested && requested !== 'chromium') throw new Error(`The requested ${requested} browser was not found. Install it or remove BROWSER_CHANNEL from .env.`);
  const executable = chromium.executablePath(); await fs.access(executable);
  return { executable, key: 'chromium', label: 'Chromium for Testing' };
}
async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

const runFile = promisify(execFile);
export async function closeManualProcess(child, { platform = process.platform, run = runFile, timeout = 8000 } = {}) {
  if (!child || child.exitCode !== null) return;
  if (!Number.isSafeInteger(child.pid) || child.pid < 1) throw new Error('The sign-in browser could not be identified. Close its window manually.');
  let timer, onExit;
  const exited = new Promise(resolve => {
    const done = () => { clearTimeout(timer); child.off('exit', done); resolve(true); };
    onExit = done; child.once('exit', done);
    timer = setTimeout(() => { child.off('exit', done); resolve(false); }, timeout);
  });
  try {
    if (platform === 'win32') {
      // This PID comes only from our own spawned, dedicated-profile browser.
      // WM_CLOSE lets Chrome save its session; never force-kill a browser tree.
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$p=Get-Process -Id '+child.pid+' -ErrorAction SilentlyContinue; $until=(Get-Date).AddSeconds(3); while($p -and $p.MainWindowHandle -eq 0 -and (Get-Date) -lt $until){Start-Sleep -Milliseconds 200; $p.Refresh()}; if($p -and $p.MainWindowHandle -ne 0){[void]$p.CloseMainWindow()}'], { windowsHide: true, timeout: 5000 });
    } else child.kill('SIGTERM');
    if (child.exitCode !== null) return;
    if (!await exited) throw new Error('Close all windows in the separate sign-in browser, then try Finish sign-in again. Your saved session is kept.');
  } finally { clearTimeout(timer); child.off('exit', onExit); }
}

export class BrowserManager extends EventEmitter {
  context = null;
  connection = null;
  launching = null;
  child = null;
  manualProcess = null;
  pages = new Map();
  constructor({ dataDir = DATA } = {}) { super(); this.dataDir = dataDir; }
  async open() {
    if (this.manualProcess) throw new Error('Finish signing in and close the separate sign-in browser window, then click Check logins again.');
    if (this.context) return this.context;
    if (this.launching) return this.launching;
    this.launching = this.launch().catch(error => {
      throw new Error(`Could not connect to the worker browser. Close any separate sign-in window first. Install Chrome or run "npm run setup", and keep the worker desktop open. ${error.message}`);
    }).finally(() => { this.launching = null; });
    return this.launching;
  }
  async launch() {
    const browser = await resolveBrowser();
    const profile = path.join(this.dataDir, 'browser-profiles', browser.key);
    await fs.mkdir(profile, { recursive: true });
    const port = await freePort();
    // Start the installed browser directly, using its normal security defaults.
    // The debugging endpoint is loopback-only and never served through the web app.
    const child = spawn(browser.executable, [
      `--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`,
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--no-first-run', '--no-default-browser-check', '--start-maximized', 'about:blank'
    ], { stdio: 'ignore', windowsHide: false });
    this.child = child;
    let launchError;
    child.once('error', error => { launchError = error; });
    const endpoint = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error('The browser exited. Its dedicated profile may still be open in a manual sign-in window.');
      try {
        const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch { /* Wait for the local debugging listener. */ }
      await wait(150);
    }
    if (!ready) throw new Error('The browser did not open its local connection within 30 seconds.');
    this.connection = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
    const context = this.connection.contexts()[0];
    if (!context) throw new Error('No browser context was available.');
    this.context = context;
    context.setDefaultTimeout(30000); context.setDefaultNavigationTimeout(30000);
    this.connection.on('disconnected', () => { this.context = null; this.connection = null; this.pages.clear(); });
    context.on('close', () => { this.context = null; this.pages.clear(); });
    return context;
  }
  async page(id) {
    const context = await this.open();
    let page = this.pages.get(id);
    if (['whatsapp', 'telegram'].includes(id)) {
      const linkedTabs = context.pages().filter(tab => !tab.isClosed() && tab.url().startsWith(id === 'whatsapp' ? 'https://web.whatsapp.com/' : 'https://web.telegram.org/'));
      if (linkedTabs.length > 1) throw new InterventionError(`More than one ${id === 'whatsapp' ? 'WhatsApp' : 'Telegram'} Web tab is open in the worker. Keep one tab and continue; the worker will not choose a session or take one over.`);
      page = linkedTabs[0] || page;
    }
    if (!page || page.isClosed()) {
      page = await context.newPage();
      page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
    }
    this.pages.set(id, page);
    await page.bringToFront();
    return page;
  }
  async manualLogin(url) {
    if (this.manualProcess) throw new Error('A manual sign-in window is already open. Complete sign-in there and close that window first.');
    await this.close();
    const browser = await resolveBrowser({ installedOnly: true });
    const profile = path.join(this.dataDir, 'browser-profiles', browser.key);
    await fs.mkdir(profile, { recursive: true });
    // No automation connection or debugging switches during manual authentication.
    const child = spawn(browser.executable, [`--user-data-dir=${profile}`, '--disable-background-mode', '--no-first-run', '--no-default-browser-check', '--new-window', url], { stdio: 'ignore', windowsHide: false });
    this.manualProcess = child;
    child.once('exit', () => { if (this.manualProcess === child) { this.manualProcess = null; this.emit('manual-login-change'); } });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', error => { this.manualProcess = null; this.emit('manual-login-change'); reject(error); }); });
    return browser.label;
  }
  async finishManualLogin() {
    const child = this.manualProcess;
    await closeManualProcess(child);
    if (this.manualProcess === child) { this.manualProcess = null; this.emit('manual-login-change'); }
  }
  async close() {
    if (this.launching) await this.launching.catch(() => {});
    const connection = this.connection;
    if (connection) {
      try { const session = await connection.newBrowserCDPSession(); await session.send('Browser.close'); } catch { /* Closing may disconnect the session before its response. */ }
      await connection.close().catch(() => {});
    }
    if (this.child && this.child.exitCode === null) {
      const child = this.child;
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    this.context = null; this.connection = null; this.pages.clear(); this.child = null;
    // A regular manual sign-in browser is left for its operator to close safely.
  }
}
