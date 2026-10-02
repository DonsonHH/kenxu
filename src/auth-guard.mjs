import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
const pools=new WeakMap(),WINDOW=15*60000,MAX_KEYS=4096;
export function clientAddress(req,trustCloudflare=false){
 const peer=req.socket.remoteAddress||'unknown',header=req.headers['cf-connecting-ip'];
 return trustCloudflare&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)&&typeof header==='string'&&isIP(header)?header:peer;
}
export function createAuthGuard(store,realm){
 const db=store.db;db.exec('CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS auth_limits_expiry ON auth_limits(expires);');
 if(!pools.has(store))pools.set(store,{user:0,admin:0});const pool=pools.get(store);
 const key=(scope,value)=>createHash('sha256').update(realm+':'+scope+':'+value).digest('hex');
 function consume(action,account,address){
  const now=Date.now(),items=[['source',address,30],['global','all',120],['account',account.toLowerCase(),8]].map(([scope,value,limit])=>({key:key(action+':'+scope,value),limit}));
  db.exec('BEGIN IMMEDIATE');try{
   db.prepare('DELETE FROM auth_limits WHERE expires<=?').run(now);
   const records=items.map(item=>({...item,row:db.prepare('SELECT count,expires FROM auth_limits WHERE key=?').get(item.key)}));
   const blocked=records.filter(r=>r.row?.count>=r.limit);
   if(blocked.length){db.exec('COMMIT');return {allowed:false,retryAfter:Math.max(1,...blocked.map(r=>Math.ceil((r.row.expires-now)/1000)))};}
   if(db.prepare('SELECT count(*) n FROM auth_limits').get().n+records.filter(r=>!r.row).length>MAX_KEYS){db.exec('COMMIT');return {allowed:false,retryAfter:60};}
   for(const item of records)db.prepare('INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(item.key,now+WINDOW);
   db.exec('COMMIT');return {allowed:true,attempt:records.at(-1).row?.count+1||1};
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 return {consume,clearAccount:(action,account)=>db.prepare('DELETE FROM auth_limits WHERE key=?').run(key(action+':account',account.toLowerCase())),acquire:()=>{if(pool[realm]>=2||pool.user+pool.admin>=3)return false;pool[realm]++;return true;},release:()=>{pool[realm]=Math.max(0,pool[realm]-1);}};
}
