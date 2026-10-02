import {chromium} from 'playwright';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {openStore} from '../src/store.mjs';import {createApp} from '../src/app.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'kenxu-perf-')),s=openStore(dir);let server,browser;
try{
 s.importSource('proxies: [{name: Fixture, type: vless, server: fixture.example, port: 443}]');const proxy=s.inventory()[0];s.meter.register(proxy.id,'Fixture');const id=await s.createUser('perf_user','fixture-performance-password',[proxy.id]);await s.setPassword(id,'fixture-performance-password');
 server=createApp({store:s,origin:'http://127.0.0.1:4450'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://127.0.0.1:4450','Content-Type':'application/json'},body:JSON.stringify({username:'perf_user',password:'fixture-performance-password'})});assert.equal(login.status,200);const value=login.headers.get('set-cookie').split(';')[0].split('=')[1];
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});const context=await browser.newContext();await context.addCookies([{name:'donson_local',value,url:base}]);const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>document.querySelector('#page-sync').textContent.startsWith('更新于'));
 const result=await page.evaluate(async()=>{
  let removed=0;const observer=new MutationObserver(records=>{for(const r of records)removed+=r.removedNodes.length;});for(const id of ['node-list','daily-list'])observer.observe(document.getElementById(id),{childList:true});
  const durations=[];for(let i=0;i<4;i++){const start=performance.now();document.querySelector('#refresh').click();await new Promise(resolve=>{const poll=()=>document.querySelector('#refresh').disabled?setTimeout(poll,10):resolve();setTimeout(poll,10);});durations.push(performance.now()-start);}observer.disconnect();
  const data=await fetch('/api/usage').then(r=>r.json()),status=await fetch('/api/nodes/status').then(r=>r.json());const begin=performance.now();for(let i=0;i<30;i++){data.daily.at(-1).down=i+1;window.portalCharts.update(data,status,'user');}const chartUpdateMs=(performance.now()-begin)/30;
  return {unchangedRefreshRemovedNodes:removed,averageRefreshMs:durations.reduce((a,b)=>a+b)/durations.length,changedChartUpdateMs:chartUpdateMs};
 });await mkdir('test-output',{recursive:true});const label=process.argv.includes('--baseline')?'baseline':'optimized';await writeFile('test-output/refresh-'+label+'.json',JSON.stringify(result));console.log(JSON.stringify({label,...result}));if(label==='optimized')assert.equal(result.unchangedRefreshRemovedNodes,0);
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}s.close();await rm(dir,{recursive:true,force:true});}
