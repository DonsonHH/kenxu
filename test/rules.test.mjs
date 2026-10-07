import {test} from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import {parseSource,inventory,generateConfig} from '../src/config.mjs';

const sourceFixture=()=>parseSource(YAML.stringify({proxies:[{name:'Node A',type:'socks5',server:'127.0.0.1',port:1080},{name:'Node B',type:'socks5',server:'127.0.0.1',port:1081}],'proxy-groups':[{name:'Main',type:'select',proxies:['Node A','Node B']},{name:'Only B',type:'select',proxies:['Node B']}],rules:[String.raw`PROCESS-PATH-WILDCARD,C:\Program Files (x86)\LeiGod_Acc\*,DIRECT`,'PROCESS-NAME-WILDCARD,app?.exe,Main','DOMAIN-SUFFIX,example.com,Main','MATCH,Main']}));

test('generated subscription replaces unsupported process wildcards without deleting rules or widening path matches',()=>{
 const source=sourceFixture(),before=JSON.stringify(source),output=YAML.parse(generateConfig(source,inventory(source).map(n=>n.id)));
 assert.equal(output.rules.length,source.rules.length);
 assert.ok(output.rules[0].startsWith('PROCESS-PATH-REGEX,'));
 assert.ok(output.rules[1].startsWith('PROCESS-NAME-REGEX,'));
 const pattern=output.rules[0].split(',')[1],regexp=new RegExp(pattern,'i');
 assert.equal(regexp.test(String.raw`C:\Program Files (x86)\LeiGod_Acc\engine.exe`),true);
 assert.equal(regexp.test(String.raw`c:\program files (x86)\leigod_acc\nested\engine.exe`),true);
 assert.equal(regexp.test(String.raw`C:\Program Files (x86)\Other\engine.exe`),false);
 assert.equal(regexp.test(String.raw`D:\Program Files (x86)\LeiGod_Acc\engine.exe`),false);
 const name=new RegExp(output.rules[1].split(',')[1],'i');assert.equal(name.test('APP1.EXE'),true);assert.equal(name.test('app12.exe'),false);
 assert.deepEqual(output.rules.slice(2),source.rules.slice(2));assert.equal(JSON.stringify(source),before);
});

test('private source import rejects malformed routing rules before replacing the configuration',()=>{
 const source=sourceFixture();
 for(const rules of [['PROCESS-UNKNOWN,app.exe,DIRECT'],['RULE-SET,missing,DIRECT'],['DOMAIN-REGEX,[,DIRECT'],['MATCH,Missing Target'],['MATCH,DIRECT','DOMAIN,late.example,DIRECT']])assert.throws(()=>parseSource(YAML.stringify({...source,rules})),/规则/);
});
