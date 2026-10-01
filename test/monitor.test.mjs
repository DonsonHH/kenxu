import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeMonitor,createMonitorReader} from '../src/monitor.mjs';
test('monitor snapshot exposes only selected metrics, caches requests and rejects unapproved sources',async()=>{
 const payload={clients:[{uuid:'fixture',name:'Example',region:'SG',ipv4:'private-ip',token:'secret'}],live:{online:['fixture'],data:{fixture:{cpu:0,ram:123,ram_total:1024,disk:20,disk_total:100,net_total_up:100,lastReportTime:Date.now(),token:'secret'}}}};
 assert.equal(normalizeMonitor(payload).servers[0].cpu,0);assert.equal(normalizeMonitor(payload).servers[0].netOut,null);assert.ok(!JSON.stringify(normalizeMonitor(payload)).includes('secret'));assert.ok(!JSON.stringify(normalizeMonitor(payload)).includes('private-ip'));
 let calls=0,url='https://monitor.example';const store={getSettings:()=>({monitorUrl:url,monitorRefreshSeconds:60})};
 const read=createMonitorReader(store,{allowedOrigins:url,fetcher:async()=>{calls++;return new Response(JSON.stringify(payload));}});
 await read();await read();assert.equal(calls,1);url='https://unapproved.example';assert.equal((await read()).available,false);assert.equal(calls,1);
});
