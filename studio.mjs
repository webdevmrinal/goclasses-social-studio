#!/usr/bin/env node
// Copyright (c) 2026 Mrinal. Stable entry point; use the installed runner on restart.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));process.env.STUDIO_HOME=root;
let runner=path.join(root,'scripts','studio-runner.mjs');
try{
  const {revision}=JSON.parse(await fs.readFile(path.join(root,'.studio','current.json'),'utf8'));
  if(!/^[a-f0-9]{40,64}$/.test(revision))throw new Error('Invalid saved update.');
  const candidate=path.join(root,'.studio','releases',revision,'scripts','studio-runner.mjs');await fs.access(candidate);runner=candidate;
}catch(error){if(error.code!=='ENOENT')console.log('Using the original launcher:',error.message);}
await import(pathToFileURL(runner).href);
