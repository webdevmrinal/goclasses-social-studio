import test from 'node:test';import assert from 'node:assert/strict';import {runTiming} from '../shared/run-timing.js';
test('total run timing includes the full run and stops at completion',()=>{
 const run={createdAt:'2026-11-16T06:00:00Z',finishedAt:'2026-11-16T06:03:45Z',status:'completed'};
 assert.equal(runTiming(run).durationMs,225000);assert.equal(runTiming({...run,status:'completed_with_errors'}).durationMs,225000);
});
test('active runs tick while legacy completed runs use the last saved result',()=>{
 const run={createdAt:'2026-11-16T06:00:00Z',status:'waiting_for_input',items:[{finishedAt:'2026-11-16T06:01:00Z'}]};
 assert.equal(runTiming(run,Date.parse('2026-11-16T06:02:00Z')).durationMs,120000);assert.equal(runTiming(run).end,'');
 assert.equal(runTiming({...run,status:'completed'}).durationMs,60000);assert.equal(runTiming({}),null);
});
