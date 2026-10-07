import {createHash} from 'node:crypto';
import {inventory} from './config.mjs';
const signature=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function createHealth(store){
 const db=store.db;
 db.exec(`CREATE TABLE IF NOT EXISTS node_checks(proxy_id TEXT NOT NULL,at INTEGER NOT NULL,signature TEXT NOT NULL,status TEXT NOT NULL,latency INTEGER,PRIMARY KEY(proxy_id,at));CREATE INDEX IF NOT EXISTS node_checks_time ON node_checks(at);`);
 db.exec(`CREATE TABLE IF NOT EXISTS node_check_details(proxy_id TEXT NOT NULL,at INTEGER NOT NULL,setup_ms INTEGER NOT NULL,total_ms INTEGER NOT NULL,target TEXT NOT NULL,PRIMARY KEY(proxy_id,at),FOREIGN KEY(proxy_id,at) REFERENCES node_checks(proxy_id,at) ON DELETE CASCADE);`);
 function record(id,proxy,result){
  if(!['normal','failed','unsupported'].includes(result.status)||!Number.isSafeInteger(result.at)||result.at>Date.now()+300000||result.latency!==null&&(!Number.isSafeInteger(result.latency)||result.latency<0||result.latency>180000))throw Error('Invalid node health sample');
  const split=result.metric==='http-response-v2';
  if(result.metric&& !split||split&&(result.status!=='normal'||result.latency===null||![result.setupMs,result.totalMs].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=180000)||result.totalMs<result.setupMs+result.latency-1||!['gstatic-204','cloudflare-trace'].includes(result.target)))throw Error('Invalid split HTTP timing');
  db.exec('BEGIN IMMEDIATE');try{
   db.prepare('INSERT OR REPLACE INTO node_checks VALUES(?,?,?,?,?)').run(id,result.at,signature(proxy),result.status,result.latency);
   if(split)db.prepare('INSERT INTO node_check_details VALUES(?,?,?,?,?)').run(id,result.at,result.setupMs,result.totalMs,result.target);
   db.prepare('DELETE FROM node_checks WHERE at<?').run(Date.now()-7*86400000);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 function nodes(ids){
  const source=store.source(),interval=store.getSettings().healthCheckMinutes*60000;
  return (source?inventory(source):[]).filter(n=>!ids||ids.includes(n.id)).map(n=>{
   const proxy=source.proxies.find(p=>p.name===n.name),sig=signature(proxy),rows=db.prepare('SELECT c.at,c.status,c.latency,d.setup_ms,d.total_ms,d.target FROM node_checks c LEFT JOIN node_check_details d ON d.proxy_id=c.proxy_id AND d.at=c.at WHERE c.proxy_id=? AND c.signature=? ORDER BY c.at DESC LIMIT 96').all(n.id,sig).map(row=>({at:row.at,status:row.status,latency:row.latency,latencyMetric:row.total_ms===null?'http-total-v1':'http-response-v2',setupMs:row.setup_ms,totalMs:row.total_ms??row.latency,target:row.target})),last=rows[0];
   const stale=!!last&&Date.now()-last.at>interval*2+120000,status=!last?'pending':stale?'stale':last.status;
   return {id:n.id,name:n.name,status,checkedAt:last?.at||null,latency:last?.latency??null,latencyMetric:last?.latencyMetric||null,setupMs:last?.setupMs??null,totalMs:last?.totalMs??null,target:last?.target||null,nextCheckAt:last?last.at+interval:null,history:rows.reverse(),observer:'Jetson',checkIntervalMinutes:interval/60000};
  });
 }
 return {record,nodes,signature};
}
