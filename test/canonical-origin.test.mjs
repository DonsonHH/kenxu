import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import http from 'node:http';
import {openStore} from '../src/store.mjs';
import {createApp} from '../src/app.mjs';

test('Cloudflare HTTP entry redirects before displaying a form; unsafe HTTP requests are never replayed',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'kenxu-canonical-')),store=openStore(directory);
 let server;
 try{
  const app=createApp({store,origin:'https://portal.example',trustCloudflare:true});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const edge={Host:'portal.example','CF-Visitor':'{"scheme":"http"}'};
  const page=await fetch(base+'/?from=bookmark',{headers:edge,redirect:'manual'});
  console.log(JSON.stringify({httpEntryStatus:page.status,location:page.headers.get('location')}));
  assert.equal(page.status,308,'An HTTP visitor must not receive the login page');
  assert.equal(page.headers.get('location'),'https://portal.example/?from=bookmark');
  assert.match(page.headers.get('cache-control'),/no-store/);
  const forwarded=await fetch(base+'/',{headers:{Host:'foreign.example','X-Forwarded-Proto':'http'},redirect:'manual'});
  assert.equal(forwarded.status,308);assert.equal(forwarded.headers.get('location'),'https://portal.example/','Redirect target is the configured origin, not Host');
  const head=await fetch(base+'/',{method:'HEAD',headers:edge,redirect:'manual'});assert.equal(head.status,308);
  const post=await fetch(base+'/api/login',{method:'POST',headers:{...edge,Origin:'http://portal.example','Content-Type':'application/json'},body:JSON.stringify({username:'fixture',password:'not-a-real-password'}),redirect:'manual'});
  assert.equal(post.status,403);assert.equal(post.headers.get('location'),null);
  assert.match((await post.json()).error,/HTTPS/);
  assert.equal(store.db.prepare('SELECT count(*) n FROM auth_limits').get().n,0,'Reject before processing any password or spending login attempts');
  for(const route of ['/s/fixture-token.yaml','/S/fixture-token.yaml','/api/config','/API/config/']){
   const download=await fetch(base+route,{headers:edge,redirect:'manual'});
   assert.equal(download.status,403);assert.equal(download.headers.get('location'),null);
   assert.equal(download.headers.get('referrer-policy'),'no-referrer');
  }
  const bearer=await fetch(base+'/api/meter/desired',{headers:{...edge,Authorization:'Bearer fixture'},redirect:'manual'});assert.equal(bearer.status,403);assert.equal(bearer.headers.get('location'),null);
  const secure=await fetch(base+'/',{headers:{...edge,'CF-Visitor':'{"scheme":"https"}'},redirect:'manual'});
  assert.equal(secure.status,200);
  assert.equal(secure.headers.get('referrer-policy'),'same-origin');
  const internal=await fetch(base+'/healthz',{redirect:'manual'});assert.equal(internal.status,200,'Direct internal probes are not browser HTTP ingress');
  const externalPath=await fetch(base+'//foreign.example/path?x=1',{headers:edge,redirect:'manual'});
  assert.equal(externalPath.headers.get('location'),'https://portal.example//foreign.example/path?x=1','Never turn a request path into an open redirect');
  const absolute=await new Promise((resolve,reject)=>{
   const request=http.request(base,{path:'http://foreign.example/path',headers:edge},response=>{response.resume();resolve(response);});
   request.on('error',reject);request.end();
  });
  assert.equal(absolute.headers.location,'https://portal.example/','Absolute request targets must not influence the redirect host');
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}store.close();await rm(directory,{recursive:true,force:true});}
});

test('forwarded scheme is ignored outside the explicitly trusted public Tunnel listener',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'kenxu-untrusted-')),store=openStore(directory),servers=[];
 try{
  for(const options of [{origin:'https://portal.example'},{origin:'http://127.0.0.1:4451',admin:true,trustCloudflare:true}]){
   const server=createApp({store,...options}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));servers.push(server);
   const response=await fetch(`http://127.0.0.1:${server.address().port}/healthz`,{headers:{'CF-Visitor':'{"scheme":"http"}','X-Forwarded-Proto':'http'},redirect:'manual'});
   assert.equal(response.status,200);
  }
  const trusted=createApp({store,origin:'https://portal.example',trustCloudflare:true});
  const external=http.createServer((req,res)=>{Object.defineProperty(req.socket,'remoteAddress',{value:'198.51.100.7',configurable:true});trusted(req,res);});
  await new Promise(resolve=>external.listen(0,'127.0.0.1',resolve));servers.push(external);
  assert.equal((await fetch(`http://127.0.0.1:${external.address().port}/healthz`,{headers:{'CF-Visitor':'{"scheme":"http"}','X-Forwarded-Proto':'http'},redirect:'manual'})).status,200,'A non-loopback peer cannot supply trusted protocol metadata');
 }finally{for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}store.close();await rm(directory,{recursive:true,force:true});}
});
