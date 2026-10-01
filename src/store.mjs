import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHash,createHmac,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {parseSource,inventory,generateConfig} from './config.mjs';
import {createMeter} from './meter.mjs';
const scrypt=promisify(rawScrypt);
const hash=value=>createHash('sha256').update(value).digest('hex');
const safeEqual=(a,b)=>Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function passwordHash(password){
 if(typeof password!=='string'||password.length<12||password.length>128)throw Error('密码需为 12–128 个字符');
 const salt=randomBytes(16).toString('hex');
 const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864});
 return `${salt}:${key.toString('hex')}`;
}
export async function passwordMatches(password,stored){
 if(typeof password!=='string'||password.length>128)return false;
 const [salt,key]=stored.split(':');
 const candidate=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864});
 return safeEqual(candidate.toString('hex'),key);
}
export function openStore(directory){
 mkdirSync(directory,{recursive:true,mode:0o700});
 const keyPath=path.join(directory,'subscription.key');
 let key;try{key=readFileSync(keyPath);}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32);writeFileSync(keyPath,key,{flag:'wx',mode:0o600});}
 if(key.length!==32)throw Error('Invalid subscription key');
 const dbPath=path.join(directory,'portal.sqlite');
 const db=new DatabaseSync(dbPath);chmodSync(dbPath,0o600);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 1, grants TEXT NOT NULL, version TEXT NOT NULL, created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL);
 `);
 const getUser=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const audit=(actor,action,target)=>{db.prepare('INSERT INTO audit(at,actor,action,target) VALUES(?,?,?,?)').run(Date.now(),actor,action,target);db.prepare('DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 500)').run();};
 const rotate=id=>db.prepare('UPDATE users SET version=? WHERE id=?').run(randomBytes(16).toString('hex'),id);
 let cachedText,cachedSource;
 const source=()=>{const text=db.prepare('SELECT value FROM settings WHERE key=?').get('source')?.value;if(text!==cachedText){cachedSource=text?parseSource(text):null;cachedText=text;}return cachedSource?structuredClone(cachedSource):null;};
 const subscription=u=>`${u.id}.${createHmac('sha256',key).update(u.id+':'+u.version).digest('base64url')}`;
 const store={
  db,close:()=>db.close(),getUser,source,audit,
  inventory:()=>{const s=source();return s?inventory(s):[];},
  listUsers:()=>db.prepare('SELECT id,username,role,enabled,must_change,grants,created FROM users ORDER BY created').all().map(u=>({...u,grants:JSON.parse(u.grants)})),
  async createUser(username,password,grants=[],role='user'){
   if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,39}$/.test(username))throw Error('账号需为 3–40 位字母、数字、点、横线或下划线');
   const hashed=await passwordHash(password),id=randomUUID();
   db.prepare('INSERT INTO users(id,username,password,role,must_change,grants,version,created) VALUES(?,?,?,?,?,?,?,?)').run(id,username,hashed,role,role==='admin'?0:1,JSON.stringify(grants),randomBytes(16).toString('hex'),Date.now());
   if(role==='user')for(const n of store.meter.nodes())if(n.enabled&&grants.includes(n.proxy_id))store.meter.allowUser(n.id,id);
   return id;
  },
  findUser:username=>db.prepare('SELECT * FROM users WHERE username=?').get(username),
  async setPassword(id,password){const value=await passwordHash(password);db.prepare('UPDATE users SET password=?,must_change=0 WHERE id=?').run(value,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);rotate(id);},
  requirePasswordChange:id=>db.prepare('UPDATE users SET must_change=1 WHERE id=?').run(id),
  setAccess(id,enabled,grants){db.prepare('UPDATE users SET enabled=?,grants=? WHERE id=?').run(enabled?1:0,JSON.stringify(grants),id);for(const n of store.meter.nodes())if(n.enabled&&grants.includes(n.proxy_id))store.meter.allowUser(n.id,id);if(!enabled){db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);rotate(id);}},
  importSource(text){parseSource(text);db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('source',text);},
  session(id){db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),id,csrf,Date.now()+8*3600000);return {token,csrf};},
  authenticate(token){if(typeof token!=='string'||token.length>128)return null;return db.prepare('SELECT users.*,sessions.csrf FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>? AND enabled=1').get(hash(token),Date.now())||null;},
  logout:token=>{if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));},
  subscription,rotate,
  subscriptionUser(token){if(typeof token!=='string'||token.length>128)return null;const id=token.split('.')[0],u=getUser(id);return u&&u.enabled&&!u.must_change&&safeEqual(token,subscription(u))?u:null;},
  config(u){const s=source();if(!s)throw Error('管理员尚未导入配置');return generateConfig(store.meter.overrideSource(s,u),JSON.parse(u.grants));},
 };
 store.meter=createMeter(store);
 return store;
}
