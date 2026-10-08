import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import YAML from 'yaml';
import {openStore} from '../src/store.mjs';
import {retireSourceNode} from '../src/retirement.mjs';
import {createApp} from '../src/app.mjs';

test('retiring a shared-collector anchor removes the route from subscriptions without breaking its surviving route or losing history',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'kenxu-route-retirement-')),store=openStore(directory);
 try{
  store.importSource('proxies: [{name: Expired, type: vless, server: expired.example, port: 443, uuid: upstream-expired}, {name: Backup, type: vless, server: backup.example, port: 443, uuid: upstream-backup}]\nproxy-groups: [{name: Main, type: select, proxies: [Expired, Backup]}]\nrules: ["MATCH,Main"]');
  const [expired,backup]=store.inventory(),anchor=store.meter.register(expired.id,'Expired'),registration=store.meter.register(backup.id,'Backup',{agentId:anchor.id});
  const id=await store.createUser('friend','friend-retirement-fixture',[expired.id,backup.id]);await store.setPassword(id,'friend-retirement-fixture');
  const user=store.getUser(id),token=store.subscription(user),agent=store.meter.authenticate(anchor.token),before=store.meter.desired(agent),retiredClient=before.routes.find(r=>r.nodeId===anchor.id).clients[0],backupClient=before.routes.find(r=>r.nodeId===registration.id).clients[0];
  const batch={epoch:'route-retirement',seq:1,at:Date.now(),revision:before.revision,counters:[{email:retiredClient.email,up:100,down:200},{email:backupClient.email,up:10,down:20}]};store.meter.report(agent,batch);
  const total=store.meter.usage(id).total;
  const result=store.retireNode('Expired');assert.equal(result.remainingNodes,1);assert.deepEqual(store.inventory().map(n=>n.name),['Backup']);
  const afterUser=store.getUser(id);assert.equal(afterUser.password,user.password);assert.equal(store.subscription(afterUser),token);assert.deepEqual(JSON.parse(afterUser.grants),[backup.id]);assert.deepEqual(store.meter.usage(id).total,total);
  const configuration=YAML.parse(store.config(afterUser));assert.deepEqual(configuration.proxies.map(p=>p.name),['Backup']);assert.deepEqual(configuration['proxy-groups'][0].proxies,['Backup']);assert.equal(configuration.proxies[0].uuid,backupClient.id);
  const liveAgent=store.meter.authenticate(anchor.token);assert.ok(liveAgent,'The original collector token must remain valid for the surviving shared route');const desired=store.meter.desired(liveAgent);assert.deepEqual(desired.routes.map(r=>r.nodeId),[registration.id]);assert.deepEqual(desired.clients,[backupClient]);
  assert.equal(store.meter.usage(id).routes.find(r=>r.id===expired.id).assigned,false);
  const queued={...batch,seq:2,at:Date.now(),counters:[{email:retiredClient.email,up:105,down:210},{email:backupClient.email,up:15,down:25}]};assert.equal(store.meter.report(liveAgent,queued).ok,true);assert.equal(store.meter.report(liveAgent,queued).duplicate,true);assert.deepEqual(store.meter.usage(id).total,{up:120,down:235});
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test('retirement refuses ambiguous policy dependencies and preserves source comments and surviving node fields',async()=>{
 const original='# Private source heading\nproxies:\n  # Expired entry\n  - {name: Expired, type: vless, server: expired.example, port: 443, uuid: fixture-expired}\n  # Keep this comment\n  - {name: Backup, type: vless, server: backup.example, port: 443, uuid: fixture-kept}\nproxy-groups: [{name: Main, type: select, proxies: [Expired, Backup]}]\nrules: ["MATCH,Main"]\n';
 const prepared=retireSourceNode(original,'Expired');assert.ok(prepared.text.includes('# Private source heading'));assert.ok(prepared.text.includes('# Keep this comment'));assert.deepEqual(YAML.parse(prepared.text).proxies,[YAML.parse(original).proxies[1]]);
 for(const source of [
  'proxies: [{name: Expired, type: vless, server: fixture.example, port: 443}]',
  original.replace('MATCH,Main','MATCH,Expired'),
  original.replace('proxies: [Expired, Backup]','proxies: [Expired]'),
  original.replace('uuid: fixture-kept','uuid: fixture-kept, dialer-proxy: Expired'),
 ])assert.throws(()=>retireSourceNode(source,'Expired'));
 assert.throws(()=>retireSourceNode(original,'Unknown'));
 const directory=await mkdtemp(path.join(tmpdir(),'kenxu-retirement-policy-')),store=openStore(directory);
 try{
  store.importSource(original);const id=await store.createUser('friend','friend-policy-fixture',store.inventory().map(n=>n.id)),rules=store.rulesState(id);store.saveRules({mode:'replace',rules:['MATCH,Expired'],revision:rules.revision},id);
  const user=store.getUser(id),token=store.subscription(user);assert.throws(()=>store.retireNode('Expired'),/个人规则/);assert.deepEqual(store.getUser(id),user);assert.equal(store.subscription(store.getUser(id)),token);assert.equal(store.inventory().length,2);assert.equal(store.rulesState(id).rules[0],'MATCH,Expired');
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test('a retired collector anchor loses authentication when no enabled sibling routes remain',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'kenxu-retirement-agent-')),store=openStore(directory);
 try{
  store.importSource('proxies: [{name: Expired, type: vless, server: expired.example, port: 443}, {name: Backup, type: vless, server: backup.example, port: 443}, {name: Independent, type: vless, server: independent.example, port: 443}]');
  const nodes=store.inventory(),anchor=store.meter.register(nodes[0].id,'Expired');store.meter.register(nodes[1].id,'Backup',{agentId:anchor.id});
  store.retireNode('Expired');assert.ok(store.meter.authenticate(anchor.token));store.retireNode('Backup');assert.equal(store.meter.authenticate(anchor.token),null);assert.deepEqual(store.inventory().map(n=>n.name),['Independent']);
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test('existing subscription links immediately exclude the retired node in Clash, Stash and Shadowrocket without expanding grants',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'kenxu-retirement-download-')),store=openStore(directory);let server;
 try{
  store.importSource('proxies: [{name: Expired, type: vless, server: expired.example, port: 443, uuid: upstream-expired}, {name: Backup, type: vless, server: backup.example, port: 443, uuid: upstream-backup}]\nproxy-groups: [{name: Main, type: select, proxies: [Expired, Backup]}]\nrules: ["MATCH,Main"]');
  const nodes=store.inventory(),anchor=store.meter.register(nodes[0].id,'Expired');store.meter.register(nodes[1].id,'Backup',{agentId:anchor.id,clientTemplate:{server:'portal.example',port:443,network:'ws',tls:true,servername:'portal.example','ws-opts':{path:'/relay/v1'}}});
  const friend=await store.createUser('friend','friend-download-fixture',nodes.map(n=>n.id)),limited=await store.createUser('limited','limited-download-fixture',[nodes[0].id]);await store.setPassword(friend,'friend-download-fixture');await store.setPassword(limited,'limited-download-fixture');
  const friendToken=store.subscription(store.getUser(friend)),limitedToken=store.subscription(store.getUser(limited));server=createApp({store,origin:'http://127.0.0.1:4450'}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/s/'+friendToken+'.yaml')).status,200);store.retireNode('Expired');
  for(const query of ['','?format=stash','?format=shadowrocket']){
   const response=await fetch(base+'/s/'+friendToken+'.yaml'+query);assert.equal(response.status,200);assert.equal(response.headers.get('profile-update-interval'),'12');const text=await response.text();assert.ok(!text.includes('Expired'));assert.ok(!text.includes('upstream-expired'));assert.ok(!text.includes('upstream-backup'));
   if(!query||query==='?format=stash'){const yaml=YAML.parse(text);assert.deepEqual(yaml.proxies.map(p=>p.name),['Backup']);assert.deepEqual(yaml['proxy-groups'][0].proxies,['Backup']);}
  }
  assert.equal(store.subscription(store.getUser(friend)),friendToken);assert.equal(store.subscription(store.getUser(limited)),limitedToken);assert.deepEqual(JSON.parse(store.getUser(limited).grants),[]);assert.equal((await fetch(base+'/s/'+limitedToken+'.yaml')).status,403,'Retirement must not grant another node to a user who only owned the expired route');
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}store.close();await rm(directory,{recursive:true,force:true});}
});
