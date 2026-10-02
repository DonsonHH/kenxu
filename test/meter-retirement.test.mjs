import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openStore} from '../src/store.mjs';
test('retired identities cannot poison a collector batch or recreate deleted usage',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'kenxu-retirement-')),s=openStore(dir);
 try{
  s.importSource('proxies: [{name: One, type: vless, server: fixture.example, port: 443}, {name: Two, type: vless, server: fixture.example, port: 443}]');
  const routes=s.inventory(),reg=s.meter.register(routes[0].id,'One'),other=s.meter.register(routes[1].id,'Two'),agent=s.meter.authenticate(reg.token);
  const old=await s.createUser('retired_fixture','fixture-retired-password',[routes[0].id]),kept=await s.createUser('kept_fixture','fixture-kept-password',[routes[0].id]);
  await s.setPassword(old,'fixture-retired-password');await s.setPassword(kept,'fixture-kept-password');
  const before=s.meter.desired(agent),retired=before.clients.find(c=>c.email.includes(old)),active=before.clients.find(c=>c.email.includes(kept));
  s.setAccess(old,false,[]);
  // The operator records exact retired identities before deleting account rows.
  s.meter.retireUserCredentials?.(old);
  s.db.prepare('DELETE FROM meter_allowlist WHERE user_id=?').run(old);s.db.prepare('DELETE FROM meter_credentials WHERE user_id=?').run(old);s.db.prepare('DELETE FROM users WHERE id=?').run(old);
  const batch={epoch:'queued-before-delete',seq:1,at:Date.now(),revision:before.revision,counters:[{email:retired.email,up:10,down:100},{email:active.email,up:20,down:200}]};
  assert.deepEqual(s.meter.report(agent,batch),{ok:true,duplicate:false});assert.equal(s.meter.usage(kept).total.down,200);assert.equal(s.db.prepare('SELECT count(*) n FROM usage_events WHERE user_id=?').get(old).n,0);
  assert.equal(s.meter.report(agent,batch).duplicate,true);
  assert.throws(()=>s.meter.report(agent,{...batch,seq:2,counters:[{email:active.email,up:30,down:300},{email:'unknown',up:1,down:1}]}),/Unknown meter identity/);assert.equal(s.meter.usage(kept).total.down,200);
  assert.throws(()=>s.meter.report(s.meter.authenticate(other.token),{...batch,counters:[batch.counters[0]]}),/Unknown meter identity/);
  assert.throws(()=>s.meter.retireUserCredentials(kept),/disabled/);
 }finally{s.close();await rm(dir,{recursive:true,force:true});}
});
