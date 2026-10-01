import {spawn} from 'node:child_process';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
export function probeConfiguration(proxy,port){
 if(proxy.type!=='vless'||!['tcp',undefined].includes(proxy.network)||!proxy['reality-opts']||typeof proxy.uuid!=='string')throw Error('Unsupported probe transport');
 return {log:{loglevel:'none'},inbounds:[{listen:'127.0.0.1',port,protocol:'socks',settings:{udp:false}}],outbounds:[{protocol:'vless',settings:{vnext:[{address:proxy.server,port:proxy.port,users:[{id:proxy.uuid,encryption:'none',flow:proxy.flow||''}]}]},streamSettings:{network:'tcp',security:'reality',realitySettings:{serverName:proxy.servername,fingerprint:proxy['client-fingerprint']||'chrome',publicKey:proxy['reality-opts']['public-key'],shortId:String(proxy['reality-opts']['short-id']??'')}}}]};
}
export function probeEnvironment(environment=process.env){return Object.fromEntries(Object.entries(environment).filter(([name])=>!/^(https?|all|no)_proxy$/i.test(name)));}
const run=(binary,args,timeout)=>new Promise(resolve=>{const child=spawn(binary,args,{env:probeEnvironment(),stdio:['ignore','pipe','ignore'],windowsHide:true});let output='',settled=false;const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);child.on('error',()=>finish(-1));child.stdout.on('data',chunk=>{if(output.length<1000)output+=chunk;});child.on('exit',code=>finish(code));function finish(code){if(settled)return;settled=true;clearTimeout(timer);resolve({code,output});}});
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
export async function probeNode(proxy,{directory,binary='/usr/local/bin/xray'}={}){
 const at=Date.now();let dir,core;
 try{
  const port=await freePort();let config;try{config=probeConfiguration(proxy,port);}catch{return {at,status:'unsupported',latency:null};}
  dir=await mkdtemp(path.join(directory,'probe-'));const file=path.join(dir,'client.json');await writeFile(file,JSON.stringify(config),{mode:0o600});
  if((await run(binary,['run','-test','-config',file],10000)).code!==0)return {at,status:'failed',latency:null};
  core=spawn(binary,['run','-config',file],{env:probeEnvironment(),stdio:'ignore'});let coreError=false;core.on('error',()=>{coreError=true;});await new Promise(r=>setTimeout(r,500));
  if(coreError||core.exitCode!==null)return {at,status:'failed',latency:null};
  // Small authenticated requests, never a throughput test. No UUID/token/log
  // leaves the private staging directory; legacy personal clients are unmetered.
  for(const target of ['https://www.cloudflare.com/cdn-cgi/trace','https://www.gstatic.com/generate_204']){
   const started=Date.now(),result=await run('curl',['--disable','--silent','--max-time','10','--socks5-hostname','127.0.0.1:'+port,'--output','/dev/null','--write-out','%{http_code}',target],12000);
   if(result.code===0&&/^2\d\d$/.test(result.output.trim()))return {at:Date.now(),status:'normal',latency:Date.now()-started};
  }
  return {at:Date.now(),status:'failed',latency:null};
 }catch{return {at:Date.now(),status:'failed',latency:null};}
 finally{if(core?.pid&&core.exitCode===null&&core.signalCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{core.kill('SIGKILL');finish();},2000);function finish(){clearTimeout(timer);core.off('exit',finish);resolve();}core.once('exit',finish);core.kill('SIGTERM');});if(dir)await rm(dir,{recursive:true,force:true});}
}
