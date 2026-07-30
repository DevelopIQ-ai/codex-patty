import { describe, expect, it } from 'vitest';
import { PattyDaemon } from '../src/server.js';
describe('two-account fake worker E2E',()=>{
 it('routes new work to higher quota and keeps a created thread on its owner',async()=>{const d=new PattyDaemon();const exhausted=d.addFakeAccount('low',['gpt-5-codex'],.05);const available=d.addFakeAccount('high',['gpt-5-codex'],.9);const run=await d.coordinator.start({model:'gpt-5-codex',input:'new'});expect((d.store.run(run) as {account_id:string}).account_id).toBe(available.id);const thread=await d.coordinator.createThread('gpt-5-codex',exhausted.id);const pinned=await d.coordinator.start({model:'gpt-5-codex',input:'pinned',threadId:thread.threadId});expect((d.store.run(pinned) as {account_id:string}).account_id).toBe(exhausted.id);});
});
