import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import {openStore} from '../src/store.mjs';
import {createApp} from '../src/app.mjs';

async function fixture(run){
 const directory=await mkdtemp(path.join(tmpdir(),'kenxu-admin-rules-')),store=openStore(directory);let server;
 try{
  store.importSource(YAML.stringify({proxies:[{name:'Node A',type:'socks5',server:'127.0.0.1',port:1080},{name:'Node B',type:'socks5',server:'127.0.0.1',port:1081}],'proxy-groups':[{name:'Main',type:'select',proxies:['Node A','Node B']},{name:'Only B',type:'select',proxies:['Node B']}],rules:['DOMAIN-SUFFIX,baseline.example,Main','MATCH,Main']}));
  await store.createUser('owner','owner-rule-fixture',[],'admin');
  const alice=await store.createUser('alice','alice-rule-fixture',[store.inventory()[0].id]),bob=await store.createUser('bob','bobby-rule-fixture',[store.inventory()[1].id]);
  server=createApp({store,origin:'http://127.0.0.1:4451',admin:true}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,origin='http://127.0.0.1:4451';
  const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'owner',password:'owner-rule-fixture'})});
  const cookie=login.headers.get('set-cookie').split(';')[0],me=await(await fetch(base+'/api/me',{headers:{Cookie:cookie}})).json();
  const request=(route,{method='GET',body}={})=>fetch(base+route,{method,headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':me.csrf,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  await run({store,request,alice,bob,base,cookie,csrf:me.csrf});
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}store.close();await rm(directory,{recursive:true,force:true});}
}

test('administrator edits the global rule list without changing nodes, accounts or subscription tokens',()=>fixture(async({store,request,alice,bob})=>{
 const reply=await request('/api/admin/rules');assert.equal(reply.status,200);const before=await reply.json();
 assert.deepEqual(before.rules,['DOMAIN-SUFFIX,baseline.example,Main','MATCH,Main']);assert.ok(before.targets.includes('Main'));assert.ok(before.targets.includes('DIRECT'));assert.equal(before.scope,'global');
 const profiles=[alice,bob].map(id=>JSON.stringify(store.getUser(id))),tokens=[alice,bob].map(id=>store.subscription(store.getUser(id))),nodes=JSON.stringify(store.source().proxies);
 const rules=['DOMAIN-SUFFIX,new.example,DIRECT','MATCH,Main'];
 const saved=await request('/api/admin/rules',{method:'PUT',body:{revision:before.revision,rules}});assert.equal(saved.status,200);
 assert.deepEqual(YAML.parse(store.config(store.getUser(alice))).rules,rules);assert.deepEqual(YAML.parse(store.config(store.getUser(bob))).rules,rules);
 assert.equal(JSON.stringify(store.source().proxies),nodes);assert.deepEqual([alice,bob].map(id=>JSON.stringify(store.getUser(id))),profiles);assert.deepEqual([alice,bob].map(id=>store.subscription(store.getUser(id))),tokens);
}));

test('user rule assignment survives restart and is never accessible through the public user listener',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'kenxu-rule-persistence-'));let store=openStore(directory),server;
 try{
  store.importSource('proxies: [{name: Node, type: socks5, server: 127.0.0.1, port: 1080}]\nrules: ["MATCH,Node"]\n');
  const id=await store.createUser('friend','friend-persist-fixture',[store.inventory()[0].id]);await store.setPassword(id,'friend-persist-fixture');
  const state=store.rulesState(id);store.saveRules({mode:'replace',rules:['DOMAIN,own.example,DIRECT','MATCH,Node'],revision:state.revision},id);
  const token=store.subscription(store.getUser(id));store.close();store=openStore(directory);assert.equal(store.rulesState(id).mode,'replace');assert.ok(store.config(store.getUser(id)).includes('own.example'));assert.equal(store.subscription(store.getUser(id)),token);
  server=createApp({store,origin:'http://127.0.0.1:4450'}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://127.0.0.1:4450','Content-Type':'application/json'},body:JSON.stringify({username:'friend',password:'friend-persist-fixture'})});const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/api/admin/rules',{headers:{Cookie:cookie}})).status,403);assert.equal((await fetch(base+'/api/admin/users/'+id+'/rules',{headers:{Cookie:cookie}})).status,403);
  const download=await fetch(base+'/s/'+token+'.yaml');assert.equal(download.status,200);assert.ok((await download.text()).includes('own.example'));assert.equal(download.headers.get('content-disposition'),'attachment; filename=Kenxu.yaml');
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}store.close();await rm(directory,{recursive:true,force:true});}
});

test('a managed node awaiting per-user enrollment is not advertised or exported with a shared source credential',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'kenxu-pending-enrollment-')),store=openStore(directory);
 try{
  store.importSource('proxies: [{name: Managed, type: vless, server: fixture.example, port: 443, uuid: shared-source-secret}]\nrules: ["MATCH,Managed"]\n');
  const proxy=store.inventory()[0],id=await store.createUser('late_friend','friend-enrollment-fixture',[proxy.id]);
  const meter=store.meter.register(proxy.id,'Managed');
  assert.throws(()=>store.config(store.getUser(id)),/尚未分配|配置/,'A newly registered node must wait for an individual enrollment');
  assert.ok(!store.rulesState(id).targets.includes('Managed'));
  store.meter.allowUser(meter.id,id);const configuration=store.config(store.getUser(id));assert.ok(!configuration.includes('shared-source-secret'));assert.ok(store.rulesState(id).targets.includes('Managed'));
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test('rule preview is read-only, private and grant-filtered; invalid edits and stale revisions cannot overwrite saved rules',()=>fixture(async({store,request,alice,bob,base,cookie})=>{
 const endpoint='/api/admin/users/'+alice+'/rules',state=await(await request(endpoint)).json(),original=store.config(store.getUser(alice));
 const rule=String.raw`PROCESS-PATH-WILDCARD,C:\Program Files (x86)\Example\*,DIRECT`;
 const preview=await request('/api/admin/rules/preview',{method:'POST',body:{userId:alice,patch:{mode:'prepend',rules:[rule],revision:state.revision}}});assert.equal(preview.status,200);
 const result=await preview.json();assert.ok(result.effectiveRules[0].startsWith('PROCESS-PATH-REGEX,'));assert.equal(result.convertedCount,1);
 assert.equal(store.config(store.getUser(alice)),original);assert.deepEqual((await(await request(endpoint)).json()).rules,[]);
 assert.ok(!JSON.stringify(result).includes('127.0.0.1'));assert.equal(result.effectiveRules.at(-1),'MATCH,Main');
 for(const rules of [['DOMAIN-SUFFIX,forbidden.example,Only B'],['RULE-SET,unknown,DIRECT'],['DOMAIN-REGEX,[,DIRECT'],['MATCH,DIRECT','DOMAIN,test.example,DIRECT'],['IP-CIDR,10.0.0.0/40,DIRECT'],['DOMAIN-SUFFIX,https://example.com/,DIRECT']]){
  const reply=await request(endpoint,{method:'PUT',body:{mode:'replace',rules,revision:state.revision}});assert.equal(reply.status,400);assert.equal(store.config(store.getUser(alice)),original);
 }
 assert.equal((await request(endpoint,{method:'PUT',body:{mode:'prepend',rules:['MATCH,DIRECT'],revision:state.revision}})).status,400);
 const valid={mode:'prepend',rules:['DOMAIN,one.example,DIRECT'],revision:state.revision};assert.equal((await request(endpoint,{method:'PUT',body:valid})).status,200);
 assert.equal((await request(endpoint,{method:'PUT',body:{...valid,rules:['DOMAIN,two.example,DIRECT']}})).status,409);assert.ok(!store.config(store.getUser(alice)).includes('two.example'));
 const bobState=await(await request('/api/admin/users/'+bob+'/rules')).json();store.setAccess(bob,true,[]);
 assert.equal((await request('/api/admin/users/'+bob+'/rules',{method:'PUT',body:{mode:'replace',rules:['MATCH,DIRECT'],revision:bobState.revision}})).status,409);
 const wrong=await fetch(base+'/api/admin/rules',{method:'PUT',headers:{Origin:'http://127.0.0.1:4451',Cookie:cookie,'X-CSRF-Token':'wrong','Content-Type':'application/json'},body:'{}'});assert.equal(wrong.status,403);
 assert.equal((await fetch(base+'/api/admin/rules')).status,401);
}));

test('per-user inherit, priority supplements and independent rules stay isolated across global updates',()=>fixture(async({store,request,alice,bob})=>{
 const endpoint='/api/admin/users/'+alice+'/rules';
 let reply=await request(endpoint);assert.equal(reply.status,200);let state=await reply.json();
 assert.equal(state.mode,'inherit');assert.deepEqual(state.rules,[]);assert.ok(!state.targets.includes('Only B'));
 const supplement=['DOMAIN-SUFFIX,personal.example,DIRECT'];
 reply=await request(endpoint,{method:'PUT',body:{mode:'prepend',rules:supplement,revision:state.revision}});assert.equal(reply.status,200);state=await reply.json();
 assert.deepEqual(YAML.parse(store.config(store.getUser(alice))).rules,[...supplement,'DOMAIN-SUFFIX,baseline.example,Main','MATCH,Main']);
 assert.ok(!store.config(store.getUser(bob)).includes('personal.example'));
 reply=await request(endpoint,{method:'PUT',body:{mode:'replace',rules:['DOMAIN-SUFFIX,independent.example,DIRECT'],revision:state.revision}});assert.equal(reply.status,200);state=await reply.json();
 const independent=YAML.parse(store.config(store.getUser(alice))).rules;assert.deepEqual(independent,['DOMAIN-SUFFIX,independent.example,DIRECT','MATCH,Main']);
 const global=await(await request('/api/admin/rules')).json();
 assert.equal((await request('/api/admin/rules',{method:'PUT',body:{rules:['MATCH,DIRECT'],revision:global.revision}})).status,200);
 assert.deepEqual(YAML.parse(store.config(store.getUser(alice))).rules,independent,'Independent fallback is captured on save, not silently changed by later global rules');
 assert.deepEqual(YAML.parse(store.config(store.getUser(bob))).rules,['MATCH,DIRECT']);
 state=await(await request(endpoint)).json();assert.equal((await request(endpoint,{method:'PUT',body:{mode:'inherit',rules:[],revision:state.revision}})).status,200);
 assert.deepEqual(YAML.parse(store.config(store.getUser(alice))).rules,['MATCH,DIRECT']);
}));
