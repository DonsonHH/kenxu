import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openStore} from '../src/store.mjs';
test('user and server drilldowns attribute shared-core logical routes independently',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'kenxu-details-')),store=openStore(dir);
 try{
 store.importSource('proxies: [{name: SG, type: vless, server: example.com, port: 443, uuid: old}, {name: UK, type: vless, server: example.com, port: 443, uuid: old2}]');
 const [sg,uk]=store.inventory(),parent=store.meter.register(sg.id,'SG'),child=store.meter.register(uk.id,'UK',{agentId:parent.id,outboundTag:'uk-gusecure2'}),id=await store.createUser('details_user','fixture-details-password',[sg.id,uk.id]);await store.setPassword(id,'fixture-details-updated');
 const agent=store.meter.authenticate(parent.token),d=store.meter.desired(agent);store.meter.report(agent,{epoch:'fixture',seq:1,at:Date.now(),revision:d.revision,counters:d.routes.flatMap(r=>r.clients.map(c=>({email:c.email,up:r.nodeId===parent.id?100:10,down:r.nodeId===parent.id?1000:2000})))});
 const usage=store.meter.usage(id);assert.equal(usage.routes.find(r=>r.id===sg.id).month.down,1000);assert.equal(store.meter.nodeUsage(child.id).totals.month.down,2000);assert.equal(store.meter.nodeUsage(parent.id).users[0].totals.total.up,100);assert.equal(store.meter.nodeUsage(child.id).daily.at(-1).down,2000);assert.equal(usage.total.down,3000);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
