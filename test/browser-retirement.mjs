import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {openStore} from '../src/store.mjs';
import {createApp} from '../src/app.mjs';
const directory=await mkdtemp(path.join(tmpdir(),'kenxu-retirement-ui-')),store=openStore(directory);let server,browser;
try{
 store.importSource('proxies: [{name: Direct, type: vless, server: direct.example, port: 443}, {name: Expired, type: vless, server: expired.example, port: 443}, {name: Backup, type: vless, server: backup.example, port: 443}]\nproxy-groups: [{name: Main, type: select, proxies: [Direct, Expired, Backup]}]\nrules: ["MATCH,Main"]');
 const [direct,expired,backup]=store.inventory(),directRegistration=store.meter.register(direct.id,'Direct'),anchor=store.meter.register(expired.id,'Expired');store.meter.register(backup.id,'Backup',{agentId:anchor.id});
 await store.createUser('owner','owner-retirement-fixture',[],'admin');const id=await store.createUser('friend','friend-retirement-fixture',store.inventory().map(n=>n.id));await store.setPassword(id,'friend-retirement-fixture');
 for(const registration of [directRegistration,anchor]){const meter=store.meter.authenticate(registration.token),desired=store.meter.desired(meter);store.meter.report(meter,{epoch:'fixture-ui-retirement',seq:1,at:Date.now(),revision:desired.revision,counters:desired.clients.map(c=>({email:c.email,up:100,down:1000}))});}
 const historicalTotal=store.meter.usage(id).total;store.retireNode('Expired');
 let app;server=http.createServer((req,res)=>app(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;app=createApp({store,origin,admin:true});
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});const page=await browser.newPage();page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);
 await page.locator('#login-form [name=username]').fill('owner');await page.locator('#login-form [name=password]').fill('owner-retirement-fixture');await page.locator('#login-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#page-sync').textContent.startsWith('更新于'));
 assert.equal(await page.locator('#fresh-routes').innerText(),'2 / 2','A retired route must not look like an offline active route');assert.equal(await page.locator('#collectors-stat').innerText(),'2 个采集器','A surviving shared route must still count its original physical collector');
 store.retireNode('Backup');await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 assert.equal(await page.locator('#fresh-routes').innerText(),'1 / 1');assert.equal(await page.locator('#collectors-stat').innerText(),'1 个采集器','A fully retired collector must not remain in the active collector count');
 assert.deepEqual(store.meter.usage(id).total,historicalTotal,'Active availability must not remove historical traffic');assert.deepEqual(errors,[]);
 console.log('PASS: active route/collector counts exclude retirement, preserve shared anchors and retain historical usage');
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}store.close();await rm(directory,{recursive:true,force:true});}
