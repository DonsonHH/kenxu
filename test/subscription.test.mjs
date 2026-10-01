import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openStore} from '../src/store.mjs';
import {createApp} from '../src/app.mjs';

test('Clash metadata uses monthly per-user bytes, 720-minute updates and a non-enforcing 100 GB allowance',async()=>{
 const realNow=Date.now;let now=Date.UTC(2026,8,30,15,59);Date.now=()=>now;
 const dir=await mkdtemp(path.join(tmpdir(),'kenxu-sub-')),store=openStore(dir);let server;
 try{
  store.importSource('proxies: [{name: Test, type: vless, server: example.com, port: 443, uuid: old}]');
  const route=store.inventory()[0].id,reg=store.meter.register(route,'Test'),agent=store.meter.authenticate(reg.token);
  const a=await store.createUser('sub_a','fixture-password-a',[route]),b=await store.createUser('sub_b','fixture-password-b',[route]);
  await store.setPassword(a,'fixture-updated-a');await store.setPassword(b,'fixture-updated-b');
  const desired=store.meter.desired(agent),email=id=>desired.clients.find(c=>c.email.includes(id)).email;
  const report=(seq,up,down)=>store.meter.report(agent,{epoch:'core',seq,at:now,revision:desired.revision,counters:[{email:email(a),up,down},{email:email(b),up:10000,down:20000}]});
  report(1,100,500);now=Date.UTC(2026,8,30,16,1);report(2,300,1500);
  server=createApp({store,origin:'http://127.0.0.1:4450'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const endpoint=`http://127.0.0.1:${server.address().port}/s/${store.subscription(store.getUser(a))}.yaml`;
  const response=await fetch(endpoint);assert.equal(response.status,200);assert.equal(response.headers.get('profile-update-interval'),'12');
  assert.equal(response.headers.get('subscription-userinfo'),'upload=200; download=1000; total=107374182400');
  assert.equal(response.headers.get('profile-web-page-url'),'http://127.0.0.1:4450');assert.ok(!(await response.text()).includes('transfer-limit'));
  assert.equal((await fetch(endpoint,{method:'HEAD'})).headers.get('subscription-userinfo'),response.headers.get('subscription-userinfo'));
  report(3,300,107374187400);const over=await fetch(endpoint);assert.equal(over.status,200);assert.match(over.headers.get('subscription-userinfo'),/download=107374186900/);assert.equal(store.getUser(a).enabled,1);assert.equal(store.meter.desired(agent).clients.length,2);
  now=Date.UTC(2026,9,31,16,1);const reset=await fetch(endpoint);assert.equal(reset.headers.get('subscription-userinfo'),'upload=0; download=0; total=107374182400');
  store.setAccess(a,false,[route]);assert.equal((await fetch(endpoint)).status,404);
 }finally{Date.now=realNow;if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}store.close();await rm(dir,{recursive:true,force:true});}
});
