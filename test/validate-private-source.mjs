// Reads private source without copying it into this repo or logging credentials.
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import {parseSource,inventory,generateConfig} from '../src/config.mjs';
const [sourceFile,mihomo]=process.argv.slice(2);if(!sourceFile||!mihomo)throw Error('Provide source YAML and Mihomo executable paths');
const source=parseSource(await readFile(sourceFile,'utf8')),nodes=inventory(source);
if(nodes.length>12)throw Error('Exhaustive subset test capped at 12 nodes');
for(let mask=1;mask<(1<<nodes.length);mask++){
 const ids=nodes.filter((_,i)=>mask&(1<<i)).map(n=>n.id);const config=YAML.parse(generateConfig(source,ids));
 assert.equal(config.proxies.length,ids.length);assert.ok(config.proxies.every(p=>ids.includes(nodes.find(n=>n.name===p.name).id)));
 const names=new Set(['DIRECT','REJECT','REJECT-DROP','PASS','COMPATIBLE',...config.proxies.map(p=>p.name),...config['proxy-groups'].map(g=>g.name)]);
 for(const g of config['proxy-groups'])assert.ok(g.proxies.length>0&&g.proxies.every(p=>names.has(p)));
}
const dir=await mkdtemp(path.join(tmpdir(),'donson-yaml-validation-'));
try{
 for(let i=0;i<nodes.length;i++){
  const file=path.join(dir,`user-${i}.yaml`);await writeFile(file,generateConfig(source,[nodes[i].id]),{mode:0o600});
  const check=spawnSync(mihomo,['-t','-d',dir,'-f',file],{encoding:'utf8',timeout:20000,windowsHide:true});
  // Do not emit validator stdout/stderr: implementations may print private fields.
  if(check.status!==0)throw Error(`Mihomo configuration check failed for subset ${i+1}; raw output intentionally not printed`);
 }
 console.log(`PASS: ${nodes.length} nodes; ${(1<<nodes.length)-1} permission subsets; ${nodes.length} single-node Mihomo checks; source unchanged`);
}finally{await rm(dir,{recursive:true,force:true});}
