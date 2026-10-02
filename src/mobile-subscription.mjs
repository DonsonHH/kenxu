import YAML from 'yaml';
export function stashConfiguration(configuration){
 const input=YAML.parse(configuration),result={proxies:input.proxies,'proxy-groups':input['proxy-groups'],rules:input.rules?.filter(rule=>!rule.startsWith('PROCESS-'))};
 if(!Array.isArray(result.proxies)||!result.proxies.length)throw Error('No authorized proxies');
 if(input['rule-providers'])result['rule-providers']=input['rule-providers'];
 for(const group of result['proxy-groups']||[])if(group.type==='load-balance'&&group.strategy==='sticky-sessions')group.strategy='consistent-hashing';
 // iOS cannot use desktop process routing. Stash supplies its own DNS settings.
 return '# Kenxu iOS — 授权节点、策略组与域名规则；使用 Stash DNS 设置。\n'+YAML.stringify(result);
}
// Export only the already-authorized, gateway-rewritten configuration.
// Never serialize the private source directly or use a remote converter.
export function shadowrocketSubscription(configuration){
 const proxies=YAML.parse(configuration)?.proxies;
 if(!Array.isArray(proxies)||!proxies.length)throw Error('No authorized proxies');
 const lines=proxies.map(p=>{
  if(p.type!=='vless'||!['tcp','ws',undefined].includes(p.network)||typeof p.uuid!=='string'||p['dialer-proxy'])throw Error('Unsupported mobile transport');
  if(typeof p.server!=='string'||!p.server||/[\s/?#@]/.test(p.server)||!Number.isInteger(p.port)||p.port<1||p.port>65535)throw Error('Invalid mobile endpoint');
  const address=p.server.includes(':')&&!p.server.startsWith('[')?'['+p.server+']':p.server;
  const url=new URL('vless://'+encodeURIComponent(p.uuid)+'@'+address+':'+p.port);
  const params=url.searchParams;params.set('encryption','none');params.set('type',p.network||'tcp');
  const reality=p['reality-opts'];params.set('security',reality?'reality':p.tls?'tls':'none');
  if(p.servername)params.set('sni',p.servername);
  if(p['client-fingerprint'])params.set('fp',p['client-fingerprint']);
  if(p.flow)params.set('flow',p.flow);
  if(reality){if(typeof reality['public-key']!=='string'||!reality['public-key'])throw Error('Missing Reality key');params.set('pbk',reality['public-key']);params.set('sid',String(reality['short-id']??''));}
  if(p.alpn?.length)params.set('alpn',p.alpn.join(','));
  if(p['skip-cert-verify'])params.set('allowInsecure','1');
  if(p.network==='ws'){
   const ws=p['ws-opts']||{};if(ws['max-early-data']||ws['early-data-header-name'])throw Error('Unsupported websocket early data');
   const headers=ws.headers||{};if(Object.keys(headers).some(k=>k.toLowerCase()!=='host'))throw Error('Unsupported websocket header');
   params.set('path',ws.path||'/');const host=headers.Host||headers.host;if(host)params.set('host',host);
  }
  url.hash=encodeURIComponent(p.name);return url.href;
 });
 return Buffer.from(lines.join('\n')+'\n','utf8').toString('base64');
}
