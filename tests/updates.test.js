// Copyright (c) 2026 Mrinal. Local Git fixtures only; no GitHub or social traffic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {RepositoryUpdates} from '../scripts/updates.mjs';
import {UpdateBridge} from '../server/updates.js';
import {createApp} from '../server/index.js';
const exec=promisify(execFile);
const git=async(cwd,...args)=>(await exec('git',['-c','user.name=Mrinal fixture','-c','user.email=fixture@example.invalid',...args],{cwd,windowsHide:true})).stdout.trim();
async function fixture(){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-update-')),origin=path.join(temp,'origin'),publisher=path.join(temp,'publisher'),root=path.join(temp,'teammate copy');
 await fs.mkdir(origin);await git(origin,'init','--bare');await fs.mkdir(publisher);await git(publisher,'init','-b','main');
 await fs.mkdir(path.join(publisher,'server'));await fs.mkdir(path.join(publisher,'client'));
 await fs.writeFile(path.join(publisher,'.gitignore'),'.studio/\ndata/\nnode_modules/\n');await fs.writeFile(path.join(publisher,'server/index.js'),'export const version=1;');await fs.writeFile(path.join(publisher,'client/app.js'),'console.log("Mrinal");');
 await git(publisher,'add','.');await git(publisher,'commit','-m','Initial');await git(publisher,'remote','add','origin',origin);await git(publisher,'push','origin','main');await git(temp,'clone','--branch','main',origin,root);
 return {temp,origin,publisher,root};
}
async function cleanup(temp){if(path.dirname(temp)!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('mrinal-update-'))throw Error('Unsafe test cleanup');await fs.rm(temp,{recursive:true,force:true});}
test('updates stage a fast-forward in a separate checkout and preserve source and user data',async()=>{
 const f=await fixture();try{
  const original=await git(f.root,'rev-parse','HEAD');await fs.mkdir(path.join(f.root,'data'));await fs.writeFile(path.join(f.root,'data','config.json'),'personal settings');
  const phases=[],installed=[],updater=new RepositoryUpdates({root:f.root,install:async dir=>installed.push(dir),onProgress:s=>phases.push(s)});
  assert.equal((await updater.check()).available,false);
  await fs.writeFile(path.join(f.publisher,'server/index.js'),'export const version=2;');await git(f.publisher,'add','.');await git(f.publisher,'commit','-m','Fix by Mrinal');await git(f.publisher,'push','origin','main');
  const checked=await updater.check();assert(checked.available);assert.match(checked.notes,/Fix by Mrinal/);
  const staged=await updater.stage(f.root);assert.equal(staged.revision,checked.target);assert.equal(installed.length,1);assert(phases.length>=3);
  assert.equal(await git(f.root,'rev-parse','HEAD'),original);assert.equal(await fs.readFile(path.join(f.root,'data','config.json'),'utf8'),'personal settings');
  assert.equal((await updater.check(staged.directory)).available,false);
  await fs.writeFile(path.join(f.root,'client/app.js'),'Local work');await assert.rejects(updater.check(staged.directory),/local code changes/);
 }finally{await cleanup(f.temp);}
});
test('failed dependency preparation does not alter the original checkout',async()=>{
 const f=await fixture();try{const original=await git(f.root,'rev-parse','HEAD');await fs.writeFile(path.join(f.publisher,'server/index.js'),'export const version=3;');await git(f.publisher,'add','.');await git(f.publisher,'commit','-m','Next');await git(f.publisher,'push','origin','main');
 const updater=new RepositoryUpdates({root:f.root,install:async()=>{throw Error('Fixture install failed');}});await assert.rejects(updater.stage(f.root),/install failed/);assert.equal(await git(f.root,'rev-parse','HEAD'),original);
 }finally{await cleanup(f.temp);}
});
test('update endpoints require idle worker and same-origin authorization',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-update-http-')),bridge=new UpdateBridge(),calls=[];
 bridge.state={supported:true,available:true,phase:'idle',target:'a'.repeat(40)};bridge.request=async action=>{calls.push(action);return {ok:true};};
 const worker={busy:false},browser={};const {app,queue}=await createApp({dataDir,browser,updateBridge:bridge,queueOptions:{instagramWorker:worker}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 const post=(route,sendOrigin=true)=>fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json',...(sendOrigin?{Origin:origin}:{})},body:'{}'});
 try{
  assert.equal((await post('/api/updates/apply',false)).status,403);
  worker.busy=true;assert.equal((await post('/api/updates/apply')).status,409);assert.deepEqual(calls,[]);worker.busy=false;
  queue.active;queue.runs=[{id:'busy',status:'paused',items:[]}];assert.equal((await post('/api/updates/apply')).status,409);queue.runs=[];
  assert.equal((await post('/api/updates/apply')).status,202);assert.deepEqual(calls,['apply']);assert(queue.maintenance);
  assert.equal((await post('/api/runs')).status,409);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await cleanup(dataDir);}
});
