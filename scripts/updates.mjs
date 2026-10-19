// Copyright (c) 2026 Mrinal. Stage updates without overwriting a teammate's checkout or data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function npmCommand(args,cwd){
  const candidate=process.env.npm_execpath;
  const nearby=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  const cli=await fs.access(candidate||nearby).then(()=>candidate||nearby,()=>null);
  await new Promise((resolve,reject)=>{
    const child=cli?spawn(process.execPath,[cli,...args],{cwd,windowsHide:true,stdio:'inherit'}):spawn(process.platform==='win32'?'npm.cmd':'npm',args,{cwd,windowsHide:true,shell:process.platform==='win32',stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Dependency installation failed. The current version was preserved.')));
  });
}
export class RepositoryUpdates{
  constructor({root,install=dir=>npmCommand(['ci','--omit=dev','--no-audit','--no-fund'],dir),onProgress=()=>{}}){this.root=path.resolve(root);this.install=install;this.onProgress=onProgress;}
  async git(args,cwd=this.root){return (await exec('git',['-c','core.hooksPath='+path.join(this.root,'.studio','no-hooks'),...args],{cwd,windowsHide:true,timeout:60000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}})).stdout.trim();}
  async revision(cwd=this.root){return this.git(['rev-parse','HEAD'],cwd);}
  async check(current=this.root){
    let branch;
    try{await this.git(['remote','get-url','origin']);branch=process.env.UPDATE_BRANCH||await this.git(['symbolic-ref','--short','HEAD']);}catch{return {supported:false,available:false,message:'Connect this checkout to its GitHub origin to enable updates.'};}
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)||branch.includes('..'))throw new Error('Invalid update branch.');
    if(await this.git(['status','--porcelain'])||current!==this.root&&await this.git(['status','--porcelain'],current))throw new Error('Commit or save local code changes before updating. Your files were left unchanged.');
    this.onProgress('Checking GitHub for updates...');
    try{await this.git(['fetch','--no-tags','origin',branch]);}catch{throw new Error('Could not check the configured GitHub origin. Check your network and repository access.');}
    const target=await this.git(['rev-parse','FETCH_HEAD^{commit}']),revision=await this.revision(current);
    if(target!==revision){try{await this.git(['merge-base','--is-ancestor',revision,target]);}catch{throw new Error('The update history diverged from this copy. Ask Mrinal to review it; no files were changed.');}}
    this.target=target;this.branch=branch;
    return {supported:true,available:target!==revision,revision,target,branch,notes:target!==revision?await this.git(['log','--format=%s','-5',revision+'..'+target]):'',message:target===revision?'You are up to date.':'Update available'};
  }
  async stage(current){
    const checked=await this.check(current);if(!checked.available)throw new Error(checked.message);
    const target=checked.target;if(!/^[a-f0-9]{40,64}$/.test(target))throw new Error('Invalid update revision.');
    const parent=path.join(this.root,'.studio','releases'),directory=path.join(parent,target);
    await fs.mkdir(parent,{recursive:true});
    if(await fs.access(directory).then(()=>true,()=>false)){
      if(await this.revision(directory)!==target||await this.git(['status','--porcelain'],directory))throw new Error('The staged update was modified. It was preserved for review.');
    }else{this.onProgress('Downloading the new version...');await this.git(['worktree','add','--detach',directory,target]);}
    this.onProgress('Installing the new version. The current app is still available...');await this.install(directory);
    this.onProgress('Checking the new version...');
    for(const file of ['server/index.js','client/app.js'])await exec(process.execPath,['--check',path.join(directory,file)],{cwd:directory,windowsHide:true,timeout:30000});
    await exec(process.execPath,['--input-type=module','-e',"await import('./server/index.js')"],{cwd:directory,windowsHide:true,timeout:30000});
    return {directory,revision:target};
  }
}
