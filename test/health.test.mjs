import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {openStore} from '../src/store.mjs';import {probeConfiguration} from '../src/probe.mjs';
test('node status uses real dated checks, not meter heartbeat; source changes and stale results are never normal',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'health-')),s=openStore(dir),realNow=Date.now;try{
 s.importSource('proxies: [{name: One, type: vless, server: example.com, port: 443, uuid: secret}, {name: Two, type: vless, server: other.example, port: 443, uuid: other}]');const [one,two]=s.inventory(),p=s.source().proxies[0];assert.equal(s.health.nodes([one.id])[0].status,'pending');
 s.health.record(one.id,p,{status:'normal',at:Date.now(),latency:300});assert.equal(s.health.nodes([one.id])[0].status,'normal');assert.equal(s.health.nodes([one.id]).length,1);assert.ok(!JSON.stringify(s.health.nodes()).includes('secret'));
 Date.now=()=>realNow()+40*60000;assert.equal(s.health.nodes([one.id])[0].status,'stale');Date.now=realNow;s.importSource('proxies: [{name: One, type: vless, server: changed.example, port: 443, uuid: secret}]');assert.equal(s.health.nodes([one.id])[0].status,'pending');
 const config=probeConfiguration({type:'vless',server:'example.com',port:443,uuid:'fixture',flow:'xtls-rprx-vision',servername:'sni.example','reality-opts':{'short-id':114514,'public-key':'fixture'}},18710);assert.equal(config.outbounds[0].streamSettings.realitySettings.shortId,'114514');assert.equal(config.inbounds[0].listen,'127.0.0.1');
 }finally{Date.now=realNow;s.close();await rm(dir,{recursive:true,force:true});}
});
