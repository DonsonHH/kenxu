import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openStore} from '../src/store.mjs';
test('audit defaults to 24 hours, continues without duplicates and removes only records older than 30 days',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'kenxu-audit-')),store=openStore(dir),realNow=Date.now,now=realNow();
 try{
 Date.now=()=>now-31*86400000;store.audit('fixture','old','record');
 Date.now=()=>now-7*86400000;store.audit('fixture','week','record');
 Date.now=()=>now;for(let i=0;i<55;i++)store.audit('fixture','today','record-'+i);
 const first=store.auditPage();assert.equal(first.items.length,30);assert.ok(first.items.every(r=>r.at>=now-86400000));assert.equal(first.hasMore,true);
 const next=store.auditPage(first.nextCursor);assert.equal(next.items.length,26);assert.equal(next.items.at(-1).action,'week');assert.equal(next.hasMore,false);assert.ok(!next.items.some(r=>first.items.some(x=>x.id===r.id)));
 assert.throws(()=>store.auditPage('bad-cursor'));store.pruneAudit(true);assert.equal(store.db.prepare("SELECT count(*) n FROM audit WHERE action='old'").get().n,0);assert.equal(store.db.prepare("SELECT count(*) n FROM audit WHERE action='week'").get().n,1);
 }finally{Date.now=realNow;store.close();await rm(dir,{recursive:true,force:true});}
});
