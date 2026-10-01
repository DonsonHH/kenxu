import {openStore} from '../src/store.mjs';
import {probeNode} from '../src/probe.mjs';
import {mkdir,open,readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
if(!process.env.DATA_DIR)throw Error('Explicit private DATA_DIR is required');
const dir=path.join(path.resolve(process.env.DATA_DIR),'node-checks');await mkdir(dir,{recursive:true,mode:0o700});const lock=path.join(dir,'process.lock');let handle;
try{handle=await open(lock,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(await readFile(lock,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch{}if(alive)throw Error('Node checker already running');await unlink(lock);handle=await open(lock,'wx',0o600);}
await handle.writeFile(String(process.pid));const store=openStore(process.env.DATA_DIR);let stopping=false,currentCycle;
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;});
try{
 do{
  const source=store.source(),ids=store.inventory(),started=Date.now();let normal=0;
  for(const proxy of source?.proxies||[]){if(stopping)break;const id=ids.find(n=>n.name===proxy.name).id;const result=await probeNode(proxy,{directory:dir});store.health.record(id,proxy,result);if(result.status==='normal')normal++;}
  console.log(JSON.stringify({checked:ids.length,normal,cycleMs:Date.now()-started}));
  if(process.argv.includes('--once'))break;
  const next=Date.now()+store.getSettings().healthCheckMinutes*60000;while(!stopping&&Date.now()<next)await new Promise(r=>setTimeout(r,1000));
 }while(!stopping);
}finally{store.close();await handle.close();await unlink(lock);}
