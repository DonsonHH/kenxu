import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {openStore} from '../src/store.mjs';import {probeConfiguration,probeEnvironment} from '../src/probe.mjs';
test('node status uses real dated checks, not meter heartbeat; source changes and stale results are never normal',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'health-')),s=openStore(dir),realNow=Date.now;try{
 s.importSource('proxies: [{name: One, type: vless, server: example.com, port: 443, uuid: secret}, {name: Two, type: vless, server: other.example, port: 443, uuid: other}]');const [one,two]=s.inventory(),p=s.source().proxies[0];assert.equal(s.health.nodes([one.id])[0].status,'pending');
 s.health.record(one.id,p,{status:'normal',at:Date.now(),latency:300});assert.equal(s.health.nodes([one.id])[0].status,'normal');assert.equal(s.health.nodes([one.id]).length,1);assert.ok(!JSON.stringify(s.health.nodes()).includes('secret'));
 Date.now=()=>realNow()+40*60000;assert.equal(s.health.nodes([one.id])[0].status,'stale');Date.now=realNow;s.importSource('proxies: [{name: One, type: vless, server: changed.example, port: 443, uuid: secret}]');assert.equal(s.health.nodes([one.id])[0].status,'pending');
 const config=probeConfiguration({type:'vless',server:'example.com',port:443,uuid:'fixture',flow:'xtls-rprx-vision',servername:'sni.example','reality-opts':{'short-id':114514,'public-key':'fixture'}},18710);assert.equal(config.outbounds[0].streamSettings.realitySettings.shortId,'114514');assert.equal(config.inbounds[0].listen,'127.0.0.1');
 assert.deepEqual(probeEnvironment({PATH:'fixture',http_proxy:'other',HTTPS_PROXY:'other',ALL_PROXY:'other',NO_PROXY:'*',no_proxy:'*'}),{PATH:'fixture'});
 }finally{Date.now=realNow;s.close();await rm(dir,{recursive:true,force:true});}
});

test('health retains legacy timing meaning and stores split HTTPS response/setup timing without rewriting history',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'health-timing-')),s=openStore(dir);try{
  s.importSource('proxies: [{name: One, type: vless, server: fixture.example, port: 443, uuid: fixture}]');const node=s.inventory()[0],proxy=s.source().proxies[0],at=Date.now();
  s.health.record(node.id,proxy,{status:'normal',at:at-1000,latency:1250});assert.equal(s.health.nodes()[0].latencyMetric,'http-total-v1');
  s.health.record(node.id,proxy,{status:'normal',at,latency:80,setupMs:980,totalMs:1200,metric:'http-response-v2',target:'gstatic-204'});
  const result=s.health.nodes()[0];assert.equal(result.latency,80);assert.equal(result.setupMs,980);assert.equal(result.totalMs,1200);assert.equal(result.latencyMetric,'http-response-v2');assert.equal(result.target,'gstatic-204');
  assert.equal(result.history[0].latency,1250);assert.equal(result.history[0].latencyMetric,'http-total-v1');assert.equal(result.history[1].latencyMetric,'http-response-v2');
  assert.throws(()=>s.health.record(node.id,proxy,{status:'normal',at:at+1,latency:100,setupMs:1000,totalMs:500,metric:'http-response-v2',target:'gstatic-204'}));
 }finally{s.close();await rm(dir,{recursive:true,force:true});}
});
