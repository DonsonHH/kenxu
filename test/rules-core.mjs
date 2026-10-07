// Optional real-core check. Uses only fictional proxies and never connects.
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import {parseSource,generateConfig,inventory} from '../src/config.mjs';
const core=process.argv[2]||process.env.MIHOMO_BIN;if(!core)throw Error('Provide a Mihomo executable path or MIHOMO_BIN');
const directory=await mkdtemp(path.join(tmpdir(),'kenxu-rule-core-'));
try{
 const source=parseSource(YAML.stringify({proxies:[{name:'Fixture',type:'socks5',server:'127.0.0.1',port:1080}],rules:[String.raw`PROCESS-PATH-WILDCARD,C:\Program Files (x86)\Example\*,DIRECT`,'PROCESS-NAME-WILDCARD,app?.exe,DIRECT','MATCH,DIRECT']}));
 const file=path.join(directory,'config.yaml');await writeFile(file,generateConfig(source,inventory(source).map(n=>n.id)));
 const result=spawnSync(core,['-t','-d',directory,'-f',file],{encoding:'utf8',timeout:15000,windowsHide:true});
 assert.equal(result.status,0,'Process wildcard compatibility must pass the real core parser');
 console.log('PASS: generated process-path/name rules pass the real core parser; fictional configuration only');
}finally{await rm(directory,{recursive:true,force:true});}
