// Copyright (c) 2026 Mrinal. Only the local supervisor can install code updates.
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
export class UpdateBridge extends EventEmitter{
  constructor(){super();this.state={supported:false,phase:'idle',revision:process.env.STUDIO_REVISION||'',message:'Start with npm start to enable updates.'};this.pending=new Map();
    if(process.env.STUDIO_SUPERVISED==='1'&&process.send){this.state.supported=true;this.state.message='Check for updates';process.on('message',message=>{
      if(message.type==='studio-update-state'){this.state=message.state;this.emit('change',this.state);}
      if(message.type==='studio-update-reply'){const request=this.pending.get(message.id);if(request){clearTimeout(request.timer);this.pending.delete(message.id);message.error?request.reject(new Error(message.error)):request.resolve(message.result);}}
    });}
  }
  request(action){if(!process.send||process.env.STUDIO_SUPERVISED!=='1')return Promise.reject(new Error(this.state.message));return new Promise((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('The update supervisor did not respond. Try again.'));},90000);this.pending.set(id,{resolve,reject,timer});process.send({type:'studio-update-request',id,action});});}
}
