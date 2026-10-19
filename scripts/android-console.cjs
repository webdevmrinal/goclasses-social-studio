// Copyright (c) 2026 Mrinal. Hide auxiliary Appium/ADB consoles on Windows.
if(process.platform==='win32'){
  const child=require('node:child_process');
  for(const name of ['spawn','execFile']){
    const original=child[name];
    child[name]=function(...args){const index=Array.isArray(args[1])?2:1;if(args[index]&&typeof args[index]==='object')args[index]={...args[index],windowsHide:true};else args.splice(index,0,{windowsHide:true});return original.apply(this,args);};
  }
  require('node:module').syncBuiltinESMExports();
}
