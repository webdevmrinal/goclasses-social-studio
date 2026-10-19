// Copyright (c) 2026 Mrinal. A real launcher/update/restart fixture, with no social browsers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {once} from 'node:events';
const exec=promisify(execFile),temp=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-launcher-')),publisher=path.join(temp,'publisher'),origin=path.join(temp,'origin'),root=path.join(temp,'teammate');
const git=async(cwd,...args)=>(await exec('git',['-c','user.name=Mrinal fixture','-c','user.email=fixture@example.invalid',...args],{cwd,windowsHide:true})).stdout.trim();
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));const url='http://127.0.0.1:'+port;
let child,output='';
const body=build=>`import http from 'node:http';import {UpdateBridge} from './updates.js';const bridge=new UpdateBridge(),build=${JSON.stringify(build)};if(process.argv[1]?.endsWith('index.js')){if(build==='broken')process.exit(3);const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');try{if(req.url==='/api/session')res.end(JSON.stringify({authenticated:true,revision:process.env.STUDIO_REVISION,build}));else if(req.url==='/state')res.end(JSON.stringify(bridge.state));else {const action=req.url==='/apply'?'apply':'check';res.end(JSON.stringify(await bridge.request(action)));}}catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}}).listen(Number(process.env.PORT),'127.0.0.1');process.on('message',m=>{if(m.type==='studio-shutdown')server.close(()=>process.exit(0));});}`;
async function commit(build){await fs.writeFile(path.join(publisher,'server/index.js'),body(build));await git(publisher,'add','.');await git(publisher,'commit','-m',build+' by Mrinal');await git(publisher,'push','origin','main');return git(publisher,'rev-parse','HEAD');}
async function until(fn,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){try{const result=await fn();if(result)return result;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Launcher fixture timed out: '+output.slice(-2500));}
const get=route=>fetch(url+route).then(r=>r.json());
try{
 await fs.mkdir(publisher);await fs.mkdir(origin);await git(origin,'init','--bare');await git(publisher,'init','-b','main');await git(publisher,'remote','add','origin',origin);
 for(const dir of ['scripts','server','client'])await fs.mkdir(path.join(publisher,dir));
 for(const file of ['studio.mjs','scripts/studio-runner.mjs','scripts/updates.mjs','server/updates.js'])await fs.copyFile(file,path.join(publisher,file));
 await fs.writeFile(path.join(publisher,'.gitignore'),'.studio/\ndata/\nnode_modules/\n.env\n');await fs.writeFile(path.join(publisher,'client/app.js'),'console.log("Mrinal fixture");');await fs.mkdir(path.join(publisher,'server/automation'));await fs.writeFile(path.join(publisher,'server/automation/browser.js'),'export async function resolveBrowser(){return {label:"fixture"}}');
 const pkg={name:'mrinal-launcher-fixture',version:'1.0.0',type:'module'};await fs.writeFile(path.join(publisher,'package.json'),JSON.stringify(pkg));await fs.writeFile(path.join(publisher,'package-lock.json'),JSON.stringify({name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages:{'':{name:pkg.name,version:pkg.version}}}));
 const first=await commit('v1');await git(temp,'clone','--branch','main',origin,root);await fs.writeFile(path.join(root,'.env'),'PORT='+port);await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data','config.json'),'Teammate login settings');
 child=spawn(process.execPath,['studio.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 await until(async()=> (await get('/api/session')).revision===first);
 const second=await commit('v2');const checked=await get('/check');assert.equal(checked.target,second);assert(checked.available);await get('/apply');await until(async()=> (await get('/api/session')).revision===second);
 assert.equal(await fs.readFile(path.join(root,'data','config.json'),'utf8'),'Teammate login settings');assert.equal(await git(root,'rev-parse','HEAD'),first);await until(async()=> (await get('/state')).phase==='idle');assert.equal(JSON.parse(await fs.readFile(path.join(root,'.studio/current.json'),'utf8')).revision,second);
 await until(async()=> (await get('/state')).phase==='idle');await commit('broken');await get('/check');await get('/apply');await until(async()=>{const session=await get('/api/session'),state=await get('/state');return session.revision===second&&state.phase==='error';});assert.equal((await get('/api/session')).build,'v2');assert.equal(await fs.readFile(path.join(root,'data/config.json'),'utf8'),'Teammate login settings');
 console.log('Launcher passed: first-run dependencies, real local Git check/install/restart, persistent user data, unchanged original checkout, failed-start rollback. No social browsers or external network.');
}finally{
 if(child?.connected){const closed=once(child,'exit');child.send({type:'studio-stop'});await closed;}
 if(path.dirname(temp)===path.resolve(os.tmpdir())&&path.basename(temp).startsWith('mrinal-launcher-'))await fs.rm(temp,{recursive:true,force:true});
}
