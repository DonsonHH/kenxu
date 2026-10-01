import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import YAML from 'yaml';
import {openStore} from '../src/store.mjs';
import {createApp} from '../src/app.mjs';
import {parseSource,inventory,generateConfig} from '../src/config.mjs';
export const fixture=YAML.stringify({
 'external-controller':'0.0.0.0:9090',secret:'NEVER-PUBLISH-CONTROLLER',
 proxies:[{name:'Node A',type:'vless',server:'a.example',port:443,uuid:'fixture-secret-A'},{name:'Node B',type:'vless',server:'b.example',port:443,uuid:'fixture-secret-B'}],
 'proxy-groups':[{name:'Only B',type:'select',proxies:['Node B']},{name:'Main',type:'select',proxies:['Node A','Only B']}],
 rules:['DOMAIN,restricted.example,Only B','MATCH,Main'],
});
test('configuration generation is per-user and removes unauthorized references',()=>{
 const source=parseSource(fixture),list=inventory(source),text=generateConfig(source,[list[0].id]);
 const output=YAML.parse(text);
 assert.equal(output.proxies.length,1);assert.equal(output.proxies[0].name,'Node A');
 assert.ok(!text.includes('fixture-secret-B'));assert.ok(!text.includes('NEVER-PUBLISH'));assert.equal(output['allow-lan'],false);
 assert.equal(output['proxy-groups'].length,1);assert.deepEqual(output['proxy-groups'][0].proxies,['Node A']);
 assert.ok(output.rules.includes('DOMAIN,restricted.example,REJECT'));
 assert.throws(()=>generateConfig(source,[]));
 assert.throws(()=>parseSource(fixture+'\nproxies: []'));
 assert.throws(()=>parseSource(YAML.stringify({...source,'proxy-groups':[{name:'Cycle',type:'select',proxies:['Cycle']}]})));
});
test('account lifecycle, CSRF, role isolation, downloads and token revocation',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'donson-portal-test-'));const store=openStore(dir);const servers=[];
 const userOrigin='http://127.0.0.1:4450',adminOrigin='http://127.0.0.1:4451';
 async function start(app){const s=app.listen(0,'127.0.0.1');await new Promise(resolve=>s.once('listening',resolve));servers.push(s);return `http://127.0.0.1:${s.address().port}`;}
 let cookie='',csrf='';
 try{
  await store.createUser('owner','owner-fixture-password',[],'admin');store.importSource(fixture);
  const admin=await start(createApp({store,origin:adminOrigin,subscriptionOrigin:userOrigin,admin:true}));
  const pub=await start(createApp({store,origin:userOrigin}));
  const request=(base,route,{method='GET',body,origin=base===admin?adminOrigin:userOrigin,session=cookie,token=csrf}={})=>fetch(base+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session}:{}),...(token?{'X-CSRF-Token':token}:{})},body:body?JSON.stringify(body):undefined});
  assert.equal((await request(pub,'/api/config')).status,401);
  assert.equal((await request(pub,'/data/portal.sqlite')).status,404);
  assert.equal((await request(pub,'/api/login',{method:'POST',body:{username:'owner',password:'owner-fixture-password'}})).status,401);
  const adminLogin=await request(admin,'/api/login',{method:'POST',body:{username:'owner',password:'owner-fixture-password'}});assert.equal(adminLogin.status,200);cookie=adminLogin.headers.get('set-cookie').split(';')[0];
  assert.match(adminLogin.headers.get('set-cookie'),/HttpOnly/);assert.match(adminLogin.headers.get('set-cookie'),/SameSite=Strict/);
  csrf=(await (await request(admin,'/api/me')).json()).csrf;
  const grants=store.inventory().map(n=>n.id);
  assert.equal((await request(admin,'/api/admin/users',{method:'POST',body:{username:'alice',password:'alice-fixture-password',grants:[grants[0]]},token:'wrong'})).status,403);
  assert.equal((await request(admin,'/api/admin/users',{method:'POST',body:{username:'alice',password:'alice-fixture-password',grants:[grants[0]]},origin:'https://evil.example'})).status,403);
  const creation=await request(admin,'/api/admin/users',{method:'POST',body:{username:'alice',password:'alice-fixture-password',grants:[grants[0]],role:'admin'}});assert.equal(creation.status,201);const {id}=await creation.json();assert.equal(store.getUser(id).role,'user');
  const adminCookie=cookie,adminCsrf=csrf;
  let login=await request(pub,'/api/login',{method:'POST',body:{username:'alice',password:'alice-fixture-password'},session:''});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  let me=await (await request(pub,'/api/me')).json();csrf=me.csrf;assert.equal(me.mustChange,true);assert.equal(me.subscriptionUrl,null);assert.equal((await request(pub,'/api/config')).status,403);
  assert.equal((await request(pub,'/api/password',{method:'POST',body:{currentPassword:'alice-fixture-password',password:'alice-updated-password'}})).status,200);
  assert.equal((await request(pub,'/api/me')).status,401);
  login=await request(pub,'/api/login',{method:'POST',body:{username:'alice',password:'alice-updated-password'},session:''});cookie=login.headers.get('set-cookie').split(';')[0];
  me=await (await request(pub,'/api/me')).json();csrf=me.csrf;assert.equal(me.nodes.length,1);assert.ok(!JSON.stringify(me).includes('fixture-secret'));assert.equal((await request(pub,'/api/admin/state')).status,403);
  let subPath=new URL(me.subscriptionUrl).pathname;
  let sub=await request(pub,subPath,{session:''});assert.equal(sub.status,200);assert.match(sub.headers.get('cache-control'),/no-store/);assert.equal(sub.headers.get('referrer-policy'),'no-referrer');assert.ok(!(await sub.text()).includes('fixture-secret-B'));
  assert.equal((await request(pub,subPath.replace(/.$/,'x'),{session:''})).status,404);
  await request(pub,'/api/subscription/rotate',{method:'POST'});assert.equal((await request(pub,subPath,{session:''})).status,404);
  me=await (await request(pub,'/api/me')).json();subPath=new URL(me.subscriptionUrl).pathname;
  await request(admin,'/api/admin/users/'+id,{method:'PUT',session:adminCookie,token:adminCsrf,body:{enabled:true,grants:[grants[1]]}});
  const changed=await (await request(pub,subPath,{session:''})).text();assert.ok(changed.includes('fixture-secret-B'));assert.ok(!changed.includes('fixture-secret-A'));
  await request(admin,'/api/admin/users/'+id,{method:'PUT',session:adminCookie,token:adminCsrf,body:{enabled:false,grants:[grants[1]]}});
  assert.equal((await request(pub,subPath,{session:''})).status,404);assert.equal((await request(pub,'/api/me')).status,401);
  await request(admin,'/api/admin/users/'+id,{method:'PUT',session:adminCookie,token:adminCsrf,body:{enabled:true,grants:[grants[1]]}});
  assert.equal((await request(pub,subPath,{session:''})).status,404,'Re-enable must not revive old tokens');
  for(let i=0;i<9;i++){const r=await request(pub,'/api/login',{method:'POST',session:'',body:{username:'intruder',password:'wrong-password-value'}});assert.equal(r.status,i<8?401:429);}
  const persisted=store.getUser(id);assert.match(persisted.password,/^[a-f0-9]{32}:[a-f0-9]{128}$/);
 }finally{for(const s of servers){s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}store.close();await rm(dir,{recursive:true,force:true});}
});
