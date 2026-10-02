export const CLIENTS={
 'clash-verge':{name:'Clash Verge',platform:'desktop',kind:'Clash YAML'},
 'clash-meta':{name:'Clash Meta for Android',platform:'android',kind:'Clash YAML'},
 shadowrocket:{name:'Shadowrocket',platform:'ios',kind:'节点订阅'},
 stash:{name:'Stash',platform:'ios',kind:'iOS YAML'}
};
export function detectPlatform(navigator){if(/Android/i.test(navigator.userAgent))return 'android';if(/iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)return 'ios';return 'desktop';}
export function clientImport(subscription,client,minutes=720){
 if(!Object.hasOwn(CLIENTS,client))throw Error('Unsupported client');const url=new URL(subscription);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid subscription origin');
 if(client==='shadowrocket'||client==='stash')url.searchParams.set('format',client);const remote=url.href,encoded=encodeURIComponent(remote);
 const scheme=client==='shadowrocket'?'shadowrocket://add/'+encoded:client==='stash'?'stash://install-config?url='+encoded:client==='clash-meta'?'clashmeta://install-config?url='+encoded+'&name=Kenxu&update-interval='+minutes:'clash://install-config?url='+encoded+'&name=Kenxu';
 return {remote,scheme,...CLIENTS[client]};
}
