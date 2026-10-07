import {test} from 'node:test';import assert from 'node:assert/strict';
import {measureHttp} from '../src/http-probe.mjs';
test('response measurement excludes setup and process wall time while preserving the full HTTPS timing',async()=>{
 let time=10000;const commands=[];
 const result=await measureHttp(18700,{now:()=>time,execute:async(binary,args)=>{
  commands.push({binary,args});time+=1250;
  return {code:0,output:args.includes('%{http_code}')?'204':'204 0.980000 1.060000 1.200000'};
 }});
 assert.equal(result.status,'normal');assert.equal(result.latency,80,'HTTP response must not include 980ms connection setup or child-process overhead');assert.equal(result.setupMs,980);assert.equal(result.totalMs,1200);
 assert.equal(result.metric,'http-response-v2');assert.equal(result.target,'gstatic-204');assert.equal(commands.length,1);assert.equal(commands[0].args.at(-1),'https://www.gstatic.com/generate_204');
});

test('fallback identifies its real target; failed or malformed requests never manufacture response timings',async()=>{
 let calls=0;const result=await measureHttp(18700,{execute:async()=>++calls===1?{code:28,output:''}:{code:0,output:'200 0.300000 0.440000 0.441000'}});
 assert.equal(result.target,'cloudflare-trace');assert.equal(result.latency,140);assert.equal(calls,2);
 for(const output of ['200','204 NaN 1.0 1.1','204 0.9 0.8 1.0','204 0.9 1.0 0.8','302 0.1 0.2 0.3']){
  const invalid=await measureHttp(18700,{execute:async()=>({code:0,output})});assert.equal(invalid.status,'failed');assert.equal(invalid.latency,null);
 }
});
