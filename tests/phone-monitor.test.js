import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {PhoneTools} from '../server/phone-tools.js';
test('unchanged phone polling does not broadcast and rerender the full Activity history',async()=>{
 const screen=new EventEmitter(),guard=new EventEmitter();screen.state=()=>({});guard.state=()=>({});
 let online=true;const tools=new PhoneTools({screen,touchGuard:guard,run:async()=>online?'OFFICE123 device model:Samsung':''});
 let changes=0;tools.on('change',()=>changes++);
 await tools.refresh();assert.equal(changes,1);await tools.refresh();assert.equal(changes,1);
 online=false;await tools.refresh();assert.equal(changes,2);assert.equal(tools.devices.length,0);
});
