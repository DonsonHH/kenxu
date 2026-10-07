import {isIP} from 'node:net';
import {invalid} from './settings.mjs';
export const BUILTIN_TARGETS=['DIRECT','REJECT','REJECT-DROP','PASS','COMPATIBLE'];
const types=new Set(['DOMAIN','DOMAIN-SUFFIX','DOMAIN-KEYWORD','DOMAIN-REGEX','GEOSITE','GEOIP','SRC-GEOIP','IP-ASN','SRC-IP-ASN','IP-CIDR','IP-CIDR6','SRC-IP-CIDR','IP-SUFFIX','SRC-IP-SUFFIX','SRC-PORT','DST-PORT','IN-PORT','DSCP','PROCESS-NAME','PROCESS-PATH','PROCESS-NAME-REGEX','PROCESS-PATH-REGEX','PROCESS-NAME-WILDCARD','PROCESS-PATH-WILDCARD','NETWORK','UID','IN-TYPE','IN-USER','IN-NAME','RULE-SET','MATCH']);
const parameterized=new Set(['IP-CIDR','IP-CIDR6','SRC-IP-CIDR','GEOIP','SRC-GEOIP','IP-ASN','SRC-IP-ASN','RULE-SET']);
export function ruleParts(rule){
 const parts=rule.split(',').map(part=>part.trim());let targetIndex=parts.length-1;
 while(targetIndex>1&&['no-resolve','src'].includes(parts[targetIndex]))targetIndex--;
 return {parts,type:parts[0],payload:parts[1],target:parts[targetIndex],targetIndex,flags:parts.slice(targetIndex+1)};
}
export function validateRules(input,source,{targets,prepend=false}={}){
 if(!Array.isArray(input)||input.length>2000||Buffer.byteLength(JSON.stringify(input))>262144)throw invalid('规则最多 2000 条，总内容不超过 256 KiB');
 const available=new Set(targets||[...BUILTIN_TARGETS,...source.proxies.map(p=>p.name),...(source['proxy-groups']||[]).map(g=>g.name)]);
 return input.map((line,index)=>{
  const bad=message=>{throw invalid(`第 ${index+1} 条规则：${message}`);};
  if(typeof line!=='string'||!line.trim()||line.length>2048||/[\x00-\x1f]/.test(line))bad('需为单行文本，最多 2048 个字符');
  const {parts,type,payload,target,targetIndex,flags}=ruleParts(line);
  if(!types.has(type))bad('暂不支持该规则类型；请使用域名、网段、进程、RULE-SET 或 MATCH 等常用规则');
  if(type==='MATCH'){
   if(parts.length!==2||index!==input.length-1||prepend)bad(prepend?'补充模式不能包含 MATCH，请在独立模式设置兜底规则':'MATCH 必须是唯一的最后一条规则');
  }else if(targetIndex!==2||!payload)bad('格式应为 类型,匹配内容,策略，逗号不能出现在匹配内容中');
  if(!available.has(target))bad('策略目标不存在或未授权，请从可用策略中选择');
  if(flags.length&&(!parameterized.has(type)||new Set(flags).size!==flags.length))bad('规则参数无效');
  if(['PROCESS-NAME-WILDCARD','PROCESS-PATH-WILDCARD'].includes(type)&&!payload)bad('通配符不能为空');
  if(type.endsWith('-REGEX')){try{new RegExp(payload.replace(/^\(\?[ims]+\)/,''));}catch{bad('正则表达式无效，仅支持标准正则和开头的 (?i) 等标记');}}
  if(['IP-CIDR','IP-CIDR6','SRC-IP-CIDR','IP-SUFFIX','SRC-IP-SUFFIX'].includes(type)){
   const [address,mask,...extra]=payload.split('/'),version=isIP(address);
   if(!version||extra.length||!/^\d{1,3}$/.test(mask||'')||Number(mask)>(version===4?32:128))bad('IP 网段或掩码无效');
  }
  if(['IP-ASN','SRC-IP-ASN','UID','DSCP'].includes(type)&&(!/^\d+$/.test(payload)||!Number.isSafeInteger(Number(payload))||Number(payload)>(type==='DSCP'?63:4294967295)))bad('数字参数无效或超出范围');
  if(['SRC-PORT','DST-PORT','IN-PORT'].includes(type)&&!payload.split('/').every(range=>{const p=range.split('-').map(Number);return p.length<=2&&p.every(n=>Number.isInteger(n)&&n>=1&&n<=65535)&&(p.length===1||p[0]<=p[1]);}))bad('端口需为 1–65535，可用范围或 / 分隔');
  if(['DOMAIN','DOMAIN-SUFFIX'].includes(type)&&(/[\s/\\:?#]/.test(payload)||payload.startsWith('.')))bad('只填写域名，不带协议、路径或开头的点');
  if(type==='RULE-SET'&&!Object.hasOwn(source['rule-providers']||{},payload))bad('规则集不存在，请先通过私有配置源配置规则提供器');
  if(type==='NETWORK'&&!['tcp','udp'].includes(payload.toLowerCase()))bad('网络类型需为 tcp 或 udp');
  return parts.join(',');
 });
}

// Process wildcard rules are newer than the regex equivalents. Generate the
// older form without changing the rule order, target or wildcard semantics.
export function compatibleRule(rule){
 const parts=rule.split(','),kind=parts[0].trim();
 if(!['PROCESS-PATH-WILDCARD','PROCESS-NAME-WILDCARD'].includes(kind))return rule;
 parts[0]=kind.replace('-WILDCARD','-REGEX');
 parts[1]='^'+Array.from(parts[1].replace(/\*+/g,'*')).map(character=>character==='*'?'.*':character==='?'?'.':/[\\^$.*+?()[\]{}|]/.test(character)?'\\'+character:character).join('')+'$';
 return parts.join(',');
}
export function effectiveRules(global,profile){
 if(profile.mode==='inherit')return [...global];
 return profile.mode==='prepend'?[...profile.rules,...global]:[...profile.rules];
}
