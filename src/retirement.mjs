import YAML from 'yaml';
import {parseSource,inventory} from './config.mjs';
import {ruleParts} from './rules.mjs';
import {invalid} from './settings.mjs';

// Preserve source comments and policy names; refuse to guess a replacement
// when removing a node would change an explicit routing dependency.
export function retireSourceNode(text,name){
 const source=parseSource(text),node=inventory(source).find(n=>n.name===name);
 if(!node)throw invalid('节点不存在或已经移除');
 if(source.proxies.length===1)throw invalid('不能移除最后一个节点，请先添加替代线路');
 if(source.proxies.some(p=>p.name!==name&&p['dialer-proxy']===name))throw invalid('其他节点依赖此节点，请先更改前置线路');
 if((source.rules||[]).some(rule=>ruleParts(rule).target===name))throw invalid('全局规则直接引用此节点，请先选择替代策略');
 for(const group of source['proxy-groups']||[])if(group.proxies.includes(name)&&group.proxies.every(ref=>ref===name))throw invalid('移除后策略组将为空，请先选择替代成员');
 const document=YAML.parseDocument(text,{uniqueKeys:true}),proxies=document.get('proxies');
 proxies.items=proxies.items.filter(item=>item.get('name')!==name);
 for(const group of document.get('proxy-groups')?.items||[]){const members=group.get('proxies');members.items=members.items.filter(item=>item.value!==name);}
 const next=document.toString({lineWidth:0});parseSource(next);
 return {text:next,id:node.id,remainingNodes:source.proxies.length-1};
}
