import {createHash} from 'node:crypto';
import {inventory} from './config.mjs';
const signature=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function createHealth(store){
 const db=store.db;
 db.exec(`CREATE TABLE IF NOT EXISTS node_checks(proxy_id TEXT NOT NULL,at INTEGER NOT NULL,signature TEXT NOT NULL,status TEXT NOT NULL,latency INTEGER,PRIMARY KEY(proxy_id,at));CREATE INDEX IF NOT EXISTS node_checks_time ON node_checks(at);`);
 function record(id,proxy,result){
  if(!['normal','failed','unsupported'].includes(result.status)||!Number.isSafeInteger(result.at)||result.at>Date.now()+300000||result.latency!==null&&(!Number.isSafeInteger(result.latency)||result.latency<0||result.latency>180000))throw Error('Invalid node health sample');
  db.prepare('INSERT OR REPLACE INTO node_checks VALUES(?,?,?,?,?)').run(id,result.at,signature(proxy),result.status,result.latency);
  db.prepare('DELETE FROM node_checks WHERE at<?').run(Date.now()-7*86400000);
 }
 function nodes(ids){
  const source=store.source(),interval=store.getSettings().healthCheckMinutes*60000;
  return (source?inventory(source):[]).filter(n=>!ids||ids.includes(n.id)).map(n=>{
   const proxy=source.proxies.find(p=>p.name===n.name),sig=signature(proxy),rows=db.prepare('SELECT at,status,latency FROM node_checks WHERE proxy_id=? AND signature=? ORDER BY at DESC LIMIT 96').all(n.id,sig),last=rows[0];
   const stale=!!last&&Date.now()-last.at>interval*2+120000,status=!last?'pending':stale?'stale':last.status;
   return {id:n.id,name:n.name,status,checkedAt:last?.at||null,latency:last?.latency??null,nextCheckAt:last?last.at+interval:null,history:rows.reverse(),observer:'Jetson',checkIntervalMinutes:interval/60000};
  });
 }
 return {record,nodes,signature};
}
