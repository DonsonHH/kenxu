import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {openStore} from '../src/store.mjs';import {createAuthGuard,clientAddress} from '../src/auth-guard.mjs';import {createApp} from '../src/app.mjs';
test('persistent account/source limits, cooldown, role separation and bounded password work',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'kenxu-auth-'));let s=openStore(dir);const now=Date.now;
 try{let user=createAuthGuard(s,'user'),admin=createAuthGuard(s,'admin');for(let i=0;i<8;i++)assert.equal(user.consume('login','target','source'+i).allowed,true);assert.equal(user.consume('login','target','other').allowed,false);assert.equal(admin.consume('login','target','other').allowed,true);
 s.close();s=openStore(dir);user=createAuthGuard(s,'user');assert.equal(user.consume('login','TARGET','third').allowed,false);Date.now=()=>now()+16*60000;assert.equal(user.consume('login','target','other').allowed,true);Date.now=now;
 for(let i=0;i<30;i++)assert.equal(user.consume('login','spray'+i,'spray-source').allowed,true);assert.equal(user.consume('login','new-name','spray-source').allowed,false);
 admin=createAuthGuard(s,'admin');assert.equal(user.acquire(),true);assert.equal(user.acquire(),true);assert.equal(user.acquire(),false);assert.equal(admin.acquire(),true);assert.equal(admin.acquire(),false);user.release();user.release();admin.release();
 assert.ok(!JSON.stringify(s.db.prepare('SELECT * FROM auth_limits').all()).includes('spray-source'));
 await assert.rejects(s.createUser('weak','123456789012',[]),/过于常见/);
 }finally{Date.now=now;s.close();await rm(dir,{recursive:true,force:true});}
});
test('only the configured loopback Cloudflare path may supply a client address',()=>{
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{'cf-connecting-ip':'198.51.100.10','x-forwarded-for':'203.0.113.8'}};assert.equal(clientAddress(req),'127.0.0.1');assert.equal(clientAddress(req,true),'198.51.100.10');req.socket.remoteAddress='192.0.2.3';assert.equal(clientAddress(req,true),'192.0.2.3');req.socket.remoteAddress='127.0.0.1';req.headers['cf-connecting-ip']='spoof, 1.1.1.1';assert.equal(clientAddress(req,true),'127.0.0.1');
});
test('an account disabled while its password is being checked cannot acquire a session',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'kenxu-auth-race-')),s=openStore(dir);let server;
 try{const id=await s.createUser('race_user','fixture-race-password',[]);await s.setPassword(id,'fixture-race-password');const lookup=s.findUser;s.findUser=name=>{const user=lookup(name);if(name==='race_user')queueMicrotask(()=>s.setAccess(id,false,[]));return user;};server=createApp({store:s,origin:'http://127.0.0.1:4450'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/login',{method:'POST',headers:{Origin:'http://127.0.0.1:4450','Content-Type':'application/json'},body:JSON.stringify({username:'race_user',password:'fixture-race-password'})});assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);assert.equal(s.db.prepare('SELECT count(*) n FROM sessions').get().n,0);
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}s.close();await rm(dir,{recursive:true,force:true});}
});
test('both login realms return retry hints; static revalidation never caches private APIs',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'kenxu-auth-http-')),s=openStore(dir),servers=[];
 try{for(const admin of [false,true]){const app=createApp({store:s,origin:'http://127.0.0.1:4450',admin}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));servers.push(server);const base='http://127.0.0.1:'+server.address().port;
 for(let i=0;i<9;i++){const r=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://127.0.0.1:4450','Content-Type':'application/json','X-Forwarded-For':'198.51.100.'+i},body:JSON.stringify({username:'nonexistent',password:'fixture-invalid-password'})});assert.equal(r.status,i<8?401:429);if(i===8){assert.ok(Number(r.headers.get('retry-after'))>0);assert.ok((await r.json()).retryAfter>0);}}
 const asset=await fetch(base+'/app.js');assert.match(asset.headers.get('cache-control'),/no-cache/);assert.ok(!asset.headers.get('cache-control').includes('no-store'));const etag=asset.headers.get('etag');assert.equal((await fetch(base+'/app.js',{cache:'no-cache',headers:{'If-None-Match':etag}})).status,304);assert.match((await fetch(base+'/api/me')).headers.get('cache-control'),/no-store/);
 }}finally{for(const server of servers){server.closeAllConnections();await new Promise(r=>server.close(r));}s.close();await rm(dir,{recursive:true,force:true});}
});
