import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openStore} from '../src/store.mjs';
test('administrator edits account metadata, quota display and expiry without losing usage identities',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'kenxu-profile-')),store=openStore(dir);const realNow=Date.now;
 try{
 store.importSource('proxies: [{name: Test, type: vless, server: example.com, port: 443, uuid: old}]');
 const route=store.inventory()[0].id,reg=store.meter.register(route,'Test'),agent=store.meter.authenticate(reg.token);
 const id=await store.createUser('oldname','fixture-profile-password',[route]);await store.setPassword(id,'fixture-profile-updated');const oldUser=store.getUser(id),token=store.subscription(oldUser),session=store.session(id),credential=store.meter.desired(agent).clients[0].id;
 store.updateUser(id,{username:'newname',displayName:'Fixture Friend',email:'friend@example.test',note:'Private admin note',planName:'Friends',displayGB:250,expiresAt:realNow()+86400000,enabled:true,grants:[route]});
 const updated=store.getUser(id);assert.equal(updated.username,'newname');assert.equal(updated.note,'Private admin note');assert.equal(store.displayBytes(updated),250*1024**3);assert.equal(store.subscriptionUser(token),null);assert.equal(store.authenticate(session.token),null);assert.equal(store.meter.desired(agent).clients[0].id,credential);
 assert.throws(()=>store.updateUser(id,{username:'bad@name',enabled:true,grants:[route]}));assert.equal(store.getUser(id).username,'newname');
 Date.now=()=>realNow()+2*86400000;assert.equal(store.isActive(store.getUser(id)),false);assert.equal(store.meter.desired(agent).clients.length,0);assert.equal(store.subscriptionUser(store.subscription(store.getUser(id))),null);
 }finally{Date.now=realNow;store.close();await rm(dir,{recursive:true,force:true});}
});
