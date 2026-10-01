export const DEFAULT_SETTINGS=Object.freeze({siteName:'Kenxu',adminTitle:'Kenxu Control',subscriptionMinutes:720,uiRefreshSeconds:60,defaultDisplayGB:100,minPasswordLength:12,sessionHours:8,monitorUrl:'',monitorRefreshSeconds:60});
export function invalid(message){const e=Error(message);e.statusCode=400;return e;}
export function validateSettings(patch,current=DEFAULT_SETTINGS){
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!Object.hasOwn(DEFAULT_SETTINGS,k)))throw invalid('系统设置字段无效');
 const value={...current,...patch};
 for(const k of ['siteName','adminTitle'])if(typeof value[k]!=='string'||!value[k].trim()||value[k].length>40||/[\x00-\x1f]/.test(value[k]))throw invalid('站点标题需为 1–40 个字符');
 const ranges={subscriptionMinutes:[60,10080],uiRefreshSeconds:[30,3600],minPasswordLength:[12,64],sessionHours:[1,72],monitorRefreshSeconds:[30,600]};
 for(const [k,[min,max]]of Object.entries(ranges))if(!Number.isInteger(value[k])||value[k]<min||value[k]>max)throw invalid('设置数值超出允许范围：'+k);
 if(value.subscriptionMinutes%60!==0)throw invalid('订阅更新周期必须为整小时');
 if(typeof value.defaultDisplayGB!=='number'||!Number.isFinite(value.defaultDisplayGB)||value.defaultDisplayGB<0.1||value.defaultDisplayGB>10000)throw invalid('展示额度需为 0.1–10000 GB');
 if(typeof value.monitorUrl!=='string'||value.monitorUrl.length>200)throw invalid('监测站网址无效');
 if(value.monitorUrl){let u;try{u=new URL(value.monitorUrl);}catch{throw invalid('监测站需填写 HTTPS 根网址');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname)||u.port)throw invalid('监测站需填写 HTTPS 根网址');value.monitorUrl=u.origin;}
 return value;
}
