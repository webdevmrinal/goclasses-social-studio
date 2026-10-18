// Copyright (c) 2026 Mrinal. All rights reserved.
// Experimental Android tooling only. This file has no Instagram publishing actions.
import fs from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';

const exec = promisify(execFile);
const action = process.argv[2] || 'status';
if (!['status', 'start', 'stop', 'doctor', 'play-store'].includes(action)) throw new Error('Use status, start, stop, doctor, or play-store.');
if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) throw new Error('This experimental emulator launcher currently supports Windows.');
const root = path.join(process.env.LOCALAPPDATA, 'GoClassesSocialStudio', 'android-worker');
const sdk = path.join(root, 'sdk');
const automation = path.join(root, 'automation');
const emulator = path.join(sdk, 'emulator', 'emulator.exe');
const adb = path.join(sdk, 'platform-tools', 'adb.exe');
const appium = path.join(automation, 'node_modules', 'appium', 'build', 'lib', 'main.js');
const avdName = 'GOC_Instagram_Music_Test';
const serial = 'emulator-5556';
const appiumUrl = 'http://127.0.0.1:4731';
const runtimeFile = path.join(root, 'runtime.json');
const exists = file => fs.access(file).then(() => true, () => false);
const readJson = file => fs.readFile(file, 'utf8').then(text => JSON.parse(text.replace(/^\uFEFF/, ''))).catch(error => {
  if (error.code === 'ENOENT') return {};
  throw error;
});
const installation = await readJson(path.join(root, 'installation.json'));
const javaHome = installation.javaHome || process.env.JAVA_HOME;
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  ANDROID_USER_HOME: path.join(root, 'user-state'),
  ANDROID_AVD_HOME: path.join(root, 'avd'),
  APPIUM_HOME: automation,
  ...(javaHome ? { JAVA_HOME: javaHome } : {})
};
const run = async (file, args, timeout = 10000, includeStderr = false) => {
  const result = await exec(file, args, { env, cwd: automation, windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024 });
  return (includeStderr ? [result.stdout, result.stderr].filter(Boolean).join('\n') : result.stdout).trim();
};
const adbRun = args => run(adb, ['-s', serial, ...args]);
const ownedDevice = async () => {
  if (!await exists(adb)) return false;
  try {
    const name = await adbRun(['emu', 'avd', 'name']);
    return name.split(/\r?\n/).map(line => line.trim()).filter(line => line !== 'OK').join('') === avdName;
  } catch { return false; }
};
const booted = async () => {
  if (!await ownedDevice()) return false;
  return (await adbRun(['shell', 'getprop', 'sys.boot_completed']).catch(() => '')) === '1';
};
const serverReady = async () => {
  try {
    const response = await fetch(appiumUrl + '/status', { signal: AbortSignal.timeout(1200) });
    return response.ok && (await response.json()).value?.ready === true;
  } catch { return false; }
};
async function ownedAppium(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    const script = 'Get-CimInstance Win32_Process -Filter "ProcessId=' + pid + '" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress';
    const text = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    if (!text) return false;
    const info = JSON.parse(text);
    return info.ExecutablePath?.toLowerCase() === process.execPath.toLowerCase()
      && info.CommandLine?.toLowerCase().includes(appium.toLowerCase())
      && /--port\s+4731\b/.test(info.CommandLine)
      && /--address\s+127\.0\.0\.1\b/.test(info.CommandLine);
  } catch { return false; }
}
const portAvailable = port => new Promise(resolve => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});
async function launch(file, args, { visible = false, log } = {}) {
  let fd;
  try {
    if (log) fd = openSync(log, 'a');
    const child = spawn(file, args, { env, cwd: automation, detached: true, windowsHide: !visible, stdio: fd === undefined ? 'ignore' : ['ignore', fd, fd] });
    await once(child, 'spawn');
    child.unref();
    return child.pid;
  } finally { if (fd !== undefined) closeSync(fd); }
}
async function requireTools() {
  for (const [label, file] of [
    ['Android emulator', emulator], ['Android platform-tools', adb], ['Appium', appium],
    ['Android virtual device', path.join(root, 'avd', avdName + '.avd', 'config.ini')],
    ['Java JDK', javaHome ? path.join(javaHome, 'bin', 'javac.exe') : '']
  ]) {
    if (!file || !await exists(file)) throw new Error(label + ' is missing. Finish the dedicated Android test setup first. No app settings were changed.');
  }
}
async function status() {
  const tools = {
    emulator: await exists(emulator), adb: await exists(adb), appium: await exists(appium),
    virtualDevice: await exists(path.join(root, 'avd', avdName + '.avd', 'config.ini')),
    jdk: Boolean(javaHome && await exists(path.join(javaHome, 'bin', 'javac.exe')))
  };
  const runtime = await readJson(runtimeFile);
  console.log(JSON.stringify({
    createdBy: 'Mrinal', root, avdName, serial, tools,
    emulatorRunning: await ownedDevice(), androidBooted: await booted(),
    appiumReady: await ownedAppium(runtime.appiumPid) && await serverReady(),
    appiumUrl, publishingEnabled: false
  }, null, 2));
}
async function start() {
  await requireTools();
  await fs.mkdir(path.join(root, 'logs'), { recursive: true });
  const runtime = await readJson(runtimeFile);
  if (!await ownedDevice()) {
    if (!await portAvailable(5556) || !await portAvailable(5557)) throw new Error('Emulator ports 5556/5557 are in use. No other device was stopped.');
    console.log('Starting the dedicated Instagram test emulator...');
    runtime.emulatorPid = await launch(emulator, [
      '-avd', avdName, '-port', '5556', '-memory', '2048', '-cores', '2',
      '-gpu', 'auto', '-no-snapshot', '-no-boot-anim',
      '-camera-back', 'none', '-camera-front', 'none', '-timezone', 'Asia/Kolkata'
    ], { visible: true, log: path.join(root, 'logs', 'emulator.log') });
  }
  if (!await ownedAppium(runtime.appiumPid) || !await serverReady()) {
    if (!await portAvailable(4731)) throw new Error('Port 4731 belongs to an unverified or unready service. It was left unchanged.');
    console.log('Starting the Android driver on loopback only...');
    runtime.appiumPid = await launch(process.execPath, [
      appium, '--address', '127.0.0.1', '--port', '4731',
      '--use-drivers', 'uiautomator2', '--log-level', 'warn',
      '--log-no-colors', '--log', path.join(root, 'logs', 'appium.log')
    ]);
  }
  await fs.writeFile(runtimeFile, JSON.stringify(runtime, null, 2) + '\n', { mode: 0o600 });
  const deadline = Date.now() + 120000;
  let nextUpdate = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await booted() && await serverReady() && await ownedAppium(runtime.appiumPid)) {
      console.log('Android is ready. Instagram publishing is disabled in this test setup.');
      await status();
      return;
    }
    if (Date.now() >= nextUpdate) {
      console.log('Waiting for Android to finish booting...');
      nextUpdate = Date.now() + 15000;
    }
    await delay(1500);
  }
  throw new Error('Android did not finish booting within two minutes. Check the dedicated emulator window and its log. No Instagram action was attempted.');
}
async function stop() {
  const runtime = await readJson(runtimeFile);
  if (await ownedDevice()) {
    await adbRun(['emu', 'kill']);
    console.log('Stopped the dedicated emulator; its saved user data is preserved.');
  }
  if (await ownedAppium(runtime.appiumPid)) {
    process.kill(runtime.appiumPid);
    console.log('Stopped the owned Appium server.');
  }
}
try {
  if (action === 'status') await status();
  if (action === 'start') await start();
  if (action === 'stop') await stop();
  if (action === 'doctor') {
    await requireTools();
    const text = await run(process.execPath, [appium, 'driver', 'doctor', 'uiautomator2'], 60000, true);
    console.log(text);
  }
  if (action === 'play-store') {
    await requireTools();
    if (!await booted()) throw new Error('Start the dedicated emulator before opening Google Play.');
    console.log(await adbRun(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'market://details?id=com.instagram.android', '-p', 'com.android.vending']));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
