import {chromium,firefox,webkit} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {openStore} from '../src/store.mjs';
import {createApp} from '../src/app.mjs';

const directory=await mkdtemp(path.join(tmpdir(),'kenxu-origin-'));
const store=openStore(directory),servers=[],requests=[];
let browser;
try{
 await store.createUser('friend','friend-initial-fixture',[],'user');
 await store.createUser('owner','owner-initial-fixture',[],'admin');
 const realms=[];
 for(const admin of [false,true]){
  let app;
  const server=http.createServer((req,res)=>{
   if(req.url==='/api/login')requests.push({admin,origin:req.headers.origin??null,referer:req.headers.referer??null});
   app(req,res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
  const origin=`http://127.0.0.1:${server.address().port}`;
  app=createApp({store,origin,admin});realms.push({admin,origin});
 }
 const engine=process.env.PLAYWRIGHT_BROWSER||'chromium';
 const browserType={chromium,firefox,webkit}[engine];
 assert.ok(browserType,'Unknown PLAYWRIGHT_BROWSER');
 browser=await browserType.launch({headless:true,...(engine==='chromium'&&process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 for(const mode of ['cors','same-origin'])for(const {admin,origin}of realms){
  const context=await browser.newContext();
  try{
   // Exercise the real login UI with both fetch modes. Some clients use a
   // non-CORS same-origin transport; the document's policy must support it.
   await context.addInitScript(mode=>{
    const original=window.fetch;
    window.fetch=(input,init={})=>original(input,{...init,mode});
   },mode);
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const documentResponse=await page.goto(origin);
   assert.equal(documentResponse.headers()['referrer-policy'],'same-origin');
   await page.locator('#login-form [name=username]').fill(admin?'owner':'friend');
   await page.locator('#login-form [name=password]').fill(admin?'owner-initial-fixture':'friend-initial-fixture');
   const [response]=await Promise.all([
    page.waitForResponse(response=>new URL(response.url()).pathname==='/api/login'),
    page.locator('#login-form [type=submit]').click(),
   ]);
   const result=await response.json(),observed=requests.at(-1);
   console.log(JSON.stringify({engine,admin,mode,status:response.status(),origin:observed.origin,documentPolicy:documentResponse.headers()['referrer-policy'],error:result.error}));
   assert.equal(response.status(),200,`Login failed: ${JSON.stringify({mode,admin,...observed,error:result.error})}`);
   assert.equal(observed.origin,origin);
   if(admin)await page.locator('#admin-view').waitFor();
   else{
    await page.getByRole('heading',{name:'首次登录，请修改初始密码',exact:true}).waitFor();
    assert.equal(await page.locator('#user-view').isVisible(),false);
   }
   const me=await (await context.request.get(origin+'/api/me')).json();
   assert.ok(me.csrf);
   for(const route of ['/s/fixture-token.yaml','/api/config'])assert.equal((await context.request.get(origin+route)).headers()['referrer-policy'],'no-referrer');
   for(const rejectedOrigin of [undefined,'null','https://foreign.example']){
    const rejected=await context.request.post(origin+'/api/login',{headers:rejectedOrigin?{Origin:rejectedOrigin}:{},data:{username:'friend',password:'friend-initial-fixture'}});
    assert.equal(rejected.status(),403);
    assert.match((await rejected.json()).error,/请求来源不匹配/);
   }
   const badToken=await context.request.post(origin+'/api/logout',{headers:{Origin:origin,'X-CSRF-Token':'wrong-token'}});
   assert.equal(badToken.status(),403);assert.match((await badToken.json()).error,/操作验证失败/);
   assert.equal((await context.request.get(origin+'/api/me')).status(),200,'Rejected request must not destroy the valid session');
   await page.getByRole('button',{name:'退出',exact:true}).click();await page.locator('#login-view').waitFor();
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 console.log('PASS: real login UI supports browser origin modes in both realms; foreign/null/missing origins and invalid CSRF remain rejected');
}finally{
 await browser?.close();
 for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 store.close();await rm(directory,{recursive:true,force:true});
}
