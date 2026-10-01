import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openStore} from '../src/store.mjs';
import {createApp} from '../src/app.mjs';
test('private admin settings persist, validate atomically and affect subscription display without enforcing quotas',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'kenxu-admin-')),store=openStore(dir),servers=[];
 const start=async admin=>{const s=createApp({store,origin:'http://127.0.0.1:4451',admin}).listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));servers.push(s);return 'http://127.0.0.1:'+s.address().port;};
 try{
 await store.createUser('owner','fixture-owner-password',[],'admin');store.importSource('proxies: [{name: Test, type: vless, server: example.com, port: 443, uuid: old}]');
 const user=await store.createUser('friend','fixture-friend-password',store.inventory().map(n=>n.id));await store.setPassword(user,'fixture-friend-updated');
 const admin=await start(true),pub=await start(false),origin='http://127.0.0.1:4451';
 const login=await fetch(admin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'owner',password:'fixture-owner-password'})}),cookie=login.headers.get('set-cookie').split(';')[0];
 const me=await (await fetch(admin+'/api/me',{headers:{Cookie:cookie}})).json();
 const save=body=>fetch(admin+'/api/admin/settings',{method:'PUT',headers:{Cookie:cookie,Origin:origin,'X-CSRF-Token':me.csrf,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await save({subscriptionMinutes:1440,uiRefreshSeconds:120,defaultDisplayGB:200,minPasswordLength:20,adminTitle:'Private Control'})).status,200);
 assert.equal((await save({uiRefreshSeconds:1,defaultDisplayGB:500})).status,400);assert.equal(store.getSettings().defaultDisplayGB,200);
 const sub=await fetch(pub+'/s/'+store.subscription(store.getUser(user))+'.yaml');assert.equal(sub.headers.get('profile-update-interval'),'24');assert.match(sub.headers.get('subscription-userinfo'),/total=214748364800/);
 assert.equal((await fetch(pub+'/api/admin/settings')).status,401);
 assert.equal((await fetch(admin+'/healthz')).status,200);assert.equal((await (await fetch(admin+'/api/interface')).json()).adminInterface,true);
 await assert.rejects(()=>store.createUser('weakuser','fixture-short-pass',[store.inventory()[0].id]));
 }finally{for(const s of servers){s.closeAllConnections();await new Promise(r=>s.close(r));}store.close();await rm(dir,{recursive:true,force:true});}
});
