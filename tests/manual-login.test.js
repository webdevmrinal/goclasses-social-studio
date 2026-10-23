// Copyright (c) 2026 Mrinal. Offline manual sign-in recovery regressions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {closeManualProcess} from '../server/automation/browser.js';
import {Queue} from '../server/queue.js';
const child=()=>Object.assign(new EventEmitter(),{pid:4321,exitCode:null,kill:()=>assert.fail('Never force-kill a Windows browser')});
test('finish sign-in closes only its spawned Windows window gracefully',async()=>{
 const browser=child();let call;
 await closeManualProcess(browser,{platform:'win32',run:async(...args)=>{call=args;browser.exitCode=0;browser.emit('exit',0);}});
 assert.equal(call[0],'powershell.exe');assert.match(call[1].at(-1),/Get-Process -Id 4321/);assert.match(call[1].at(-1),/CloseMainWindow/);assert.doesNotMatch(call[1].at(-1),/Stop-Process|taskkill|Force/);assert.equal(call[2].windowsHide,true);assert.equal(browser.listenerCount('exit'),0);
});
test('unclosed sign-in window times out without discarding the session or leaving exit listeners',async()=>{
 const browser=child();await assert.rejects(closeManualProcess(browser,{platform:'win32',run:async()=>{},timeout:10}),/Close all windows/);assert.equal(browser.exitCode,null);assert.equal(browser.listenerCount('exit'),0);
});
test('failed close reports an error and releases its listener; exited child is never targeted',async()=>{
 const browser=child();await assert.rejects(closeManualProcess(browser,{platform:'win32',run:async()=>{throw Error('Close unavailable');}}),/Close unavailable/);assert.equal(browser.listenerCount('exit'),0);browser.exitCode=0;await closeManualProcess(browser,{run:()=>assert.fail('Exited process must not be targeted')});
});
test('manual browser exit immediately notifies UI to release its worker lock',()=>{
 const browser=new EventEmitter();browser.manualProcess=child();const queue=new Queue(browser);queue.manualLogin={platform:'instagram',browser:'Fixture Chrome'};queue.login.items.instagram={status:'manual_login'};let snapshot;queue.on('change',state=>snapshot=state);assert.equal(queue.state().workerBusy,true);browser.manualProcess=null;browser.emit('manual-login-change');assert.equal(snapshot.workerBusy,false);assert.equal(snapshot.manualLogin.open,false);assert.match(snapshot.login.items.instagram.message,/closed/);
});
