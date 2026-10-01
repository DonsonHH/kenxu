export function normalizeMonitor(payload){
 if(!payload||!Array.isArray(payload.clients)||payload.clients.length>200||!payload.live||typeof payload.live!=='object')throw Error('Invalid monitor response');
 const numeric=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<1e15?n:null;
 const text=(s,max=80)=>typeof s==='string'?s.slice(0,max):'';
 const online=new Set(Array.isArray(payload.live.online)?payload.live.online:[]),data=payload.live.data||{};
 return {servers:payload.clients.map(c=>{const row=data[c.uuid]||payload.live.clients?.find(r=>r.uuid===c.uuid)||{},last=numeric(row.lastReportTime??row.timestamp);return {id:text(c.uuid,120),name:text(c.name)||'Unnamed server',region:text(c.region,40),online:online.has(c.uuid),lastSeen:last&&last<1e12?last*1000:last,cpu:numeric(row.cpu),ram:numeric(row.ram),ramTotal:numeric(row.ram_total),disk:numeric(row.disk),diskTotal:numeric(row.disk_total),netIn:numeric(row.net_in),netOut:numeric(row.net_out),periodUp:numeric(row.net_total_up),periodDown:numeric(row.net_total_down),uptime:numeric(row.uptime)};})};
}
export function createMonitorReader(store,{allowedOrigins=process.env.MONITOR_ALLOWED_ORIGINS||'',fetcher=fetch}={}){
 const allowed=new Set(allowedOrigins.split(',').map(s=>s.trim()).filter(Boolean));let cached=null,pending=null;
 return async()=>{
  const settings=store.getSettings(),source=settings.monitorUrl;
  if(!source)return {configured:false,servers:[]};
  if(!allowed.has(source))return {configured:true,available:false,error:'该监测域名尚未在服务器允许列表中配置',servers:[]};
  if(cached?.source===source&&Date.now()-cached.at<settings.monitorRefreshSeconds*1000)return {...cached.value,cached:true};
  if(pending?.source===source)return pending.promise;
  const task={source};task.promise=(async()=>{try{
   const response=await fetcher(source+'/api/public/bootstrap',{headers:{Accept:'application/json','User-Agent':'Kenxu-Control-Monitor/1'},redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!response.ok||Number(response.headers.get('content-length')||0)>1048576)throw Error('Monitor unavailable');
   const reader=response.body.getReader(),chunks=[];let bytes=0;while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1048576){await reader.cancel();throw Error('Oversized monitor response');}chunks.push(Buffer.from(value));}
   const normalized=normalizeMonitor(JSON.parse(Buffer.concat(chunks).toString('utf8'))),value={configured:true,available:true,fetchedAt:Date.now(),sourceUrl:source,...normalized};cached={source,at:Date.now(),value};return value;
  }catch{const previous=cached?.source===source?cached.value:null;return {...(previous||{configured:true,servers:[]}),available:false,stale:!!previous,error:'暂时无法读取监测数据，保留上次记录'};}finally{if(pending===task)pending=null;}})();pending=task;return task.promise;
 };
}
