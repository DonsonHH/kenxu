import express from 'express';
import {fileURLToPath} from 'node:url';
import {passwordMatches,passwordHash} from './store.mjs';
import {createMonitorReader} from './monitor.mjs';
const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const badPassword=await passwordHash('dummy-password-not-an-account');
export function createApp({store,origin,subscriptionOrigin=origin,admin=false,monitorReader}){
 const app=express();app.disable('x-powered-by');
 const readMonitor=monitorReader||createMonitorReader(store);
 for(const value of [origin,subscriptionOrigin]){const parsed=new URL(value);if(parsed.origin!==value||(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))))throw Error('Use an exact HTTPS origin or loopback HTTP origin');}
 const parsedOrigin=new URL(origin);
 const secure=parsedOrigin.protocol==='https:',cookieName=secure?'__Host-donson-access':admin?'donson_admin':'donson_local';
 const cookie=(token,maxAge=28800)=>`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;
 let runningPasswords=0;const attempts=new Map();
 function limited(key,limit=8){const now=Date.now();for(const [k,v]of attempts)if(now-v.at>900000)attempts.delete(k);if(attempts.size>=4096&&!attempts.has(key))return true;const value=attempts.get(key)||{at:now,count:0};value.count++;attempts.set(key,value);return value.count>limit;}
 const tokens=req=>{const parts=(req.headers.cookie||'').split(';').map(s=>s.trim());return parts.find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';};
 app.use((req,res,next)=>{
  res.set({'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Cross-Origin-Resource-Policy':'same-origin'});
  if(secure)res.set('Strict-Transport-Security','max-age=31536000');
  if(!['GET','HEAD','POST','PUT'].includes(req.method))return res.sendStatus(405);
  const machineReport=req.method==='POST'&&req.path==='/api/meter/report';
  if(!machineReport&&!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin)return res.status(403).json({error:'请求来源不匹配，请从本站页面操作'});
  next();
 });
 app.use(express.json({limit:'600kb',strict:true}));
 app.get('/healthz',(_req,res)=>res.json({ok:true,interface:admin?'admin':'user'}));
 app.get('/api/interface',(_req,res)=>res.json({adminInterface:admin,title:admin?store.getSettings().adminTitle:store.getSettings().siteName,policy:store.publicPolicy()}));
 const sendConfig=(res,user)=>{
  const configuration=store.config(user),month=store.meter.totals(user.id).month;
  res.set({'Content-Type':'text/yaml; charset=utf-8','Content-Disposition':'attachment; filename="Kenxu.yaml"',
   'profile-update-interval':String(store.getSettings().subscriptionMinutes/60),'profile-web-page-url':subscriptionOrigin,
   'subscription-userinfo':`upload=${month.up}; download=${month.down}; total=${store.displayBytes(user)}${user.expires_at?'; expire='+Math.floor(user.expires_at/1000):''}`}).send(configuration);
 };
 app.post('/api/login',async(req,res)=>{
  const {username,password}=req.body||{};
  if(typeof username!=='string'||typeof password!=='string'||username.length>40||password.length>128)return res.status(400).json({error:'账号或密码格式无效'});
  if(limited('login:'+username.toLowerCase())||limited('*global*',120)||runningPasswords>=4)return res.status(429).json({error:'登录尝试过多，请稍后再试'});
  runningPasswords++;
  try{
   const u=store.findUser(username);const valid=await passwordMatches(password,u?.password||badPassword);
   if(!valid||!store.isActive(u)||(admin?u.role!=='admin':u.role==='admin'))return res.status(401).json({error:'账号或密码不正确，或账号不可用'});
   attempts.delete('login:'+username.toLowerCase());
   const s=store.session(u.id);res.set('Set-Cookie',cookie(s.token,store.getSettings().sessionHours*3600));store.audit(u.username,'login',u.id);res.json({ok:true});
  }finally{runningPasswords--;}
 });
 app.use('/api/meter',(req,res,next)=>{const auth=req.headers.authorization;const n=store.meter.authenticate(typeof auth==='string'&&auth.startsWith('Bearer ')?auth.slice(7):'');if(!n)return res.status(401).json({error:'采集身份无效'});req.meterNode=n;next();});
 app.get('/api/meter/desired',(req,res)=>res.json(store.meter.desired(req.meterNode)));
 app.post('/api/meter/report',(req,res)=>{try{res.json(store.meter.report(req.meterNode,req.body));}catch{res.status(409).json({error:'计量报告无效或顺序冲突'});}});
 app.use('/api/meter',(_req,res)=>res.status(404).json({error:'接口不存在'}));
 // Bearer subscription links are intentionally usable by clients without cookies.
 app.get('/s/:token', (req,res)=>{
  const u=store.subscriptionUser(req.params.token.replace(/\.yaml$/,''));
  if(!u||u.role==='admin')return res.status(404).send('订阅不可用');
  try{sendConfig(res,u);}
  catch{return res.status(403).send('暂未分配可用配置');}
 });
 app.use('/api',(req,res,next)=>{
  const u=store.authenticate(tokens(req));
  if(!u||(admin?u.role!=='admin':u.role==='admin'))return res.status(401).json({error:'请重新登录'});
  req.user=u;
  if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==u.csrf)return res.status(403).json({error:'操作验证失败，请刷新后重试'});
  if(u.must_change&&!['/me','/password','/logout'].includes(req.path))return res.status(403).json({error:'请先修改初始密码'});
  next();
 });
 app.get('/api/me',(req,res)=>{
  const u=req.user,allowed=new Set(JSON.parse(u.grants));
  const meters=store.meter.nodes();
  const enrollments=new Set(store.db.prepare('SELECT node_id FROM meter_allowlist WHERE user_id=?').all(u.id).map(n=>n.node_id));
  res.json({username:u.username,displayName:u.display_name||u.username,planName:u.plan_name||'好友共享',role:u.role,mustChange:!!u.must_change,csrf:u.csrf,nodes:store.inventory().filter(n=>{const m=meters.find(m=>m.proxy_id===n.id);return allowed.has(n.id)&&(!m||m.enabled&&(m.kind!=='relay'||enrollments.has(m.id)));}).map(n=>({...n,metered:meters.some(m=>m.enabled&&m.proxy_id===n.id),kind:meters.find(m=>m.proxy_id===n.id)?.kind||'unmanaged'})),subscriptionUrl:!u.must_change&&u.role==='user'?`${subscriptionOrigin}/s/${store.subscription(u)}.yaml`:null,adminInterface:admin});
 });
 app.get('/api/usage',(req,res)=>res.json(store.meter.usage(req.user.id)));
 app.get('/api/nodes/status',(req,res)=>res.json({nodes:store.health.nodes(JSON.parse(req.user.grants)),checkIntervalMinutes:store.getSettings().healthCheckMinutes}));
 app.post('/api/logout',(req,res)=>{store.logout(tokens(req));res.set('Set-Cookie',cookie('',0));res.json({ok:true});});
 app.post('/api/password',async(req,res)=>{
  if(runningPasswords>=4||limited(`password:${req.user.id}`))return res.status(429).json({error:'请稍后重试'});
  runningPasswords++;
  try{if(!await passwordMatches(req.body?.currentPassword,req.user.password))return res.status(400).json({error:'当前密码不正确'});await store.setPassword(req.user.id,req.body?.password);store.audit(req.user.username,'password-change',req.user.id);res.set('Set-Cookie',cookie('',0));res.json({ok:true});}finally{runningPasswords--;}
 });
 app.post('/api/subscription/rotate',(req,res)=>{store.rotate(req.user.id);store.audit(req.user.username,'subscription-rotate',req.user.id);res.json({ok:true});});
 app.get('/api/config',(req,res)=>{try{sendConfig(res,req.user);}catch{res.status(403).json({error:'管理员尚未分配可用配置'});}});
 app.use('/api/admin',(req,res,next)=>{if(!admin||req.user.role!=='admin')return res.status(403).json({error:'此操作仅限私有管理入口'});next();});
 const checkGrants=grants=>Array.isArray(grants)&&grants.length<=200&&grants.every(id=>typeof id==='string'&&store.inventory().some(n=>n.id===id));
 app.get('/api/admin/settings',(_req,res)=>res.json(store.getSettings()));
 app.get('/api/admin/monitor',async(_req,res)=>res.json(await readMonitor()));
 app.put('/api/admin/settings',(req,res)=>{const settings=store.setSettings(req.body);store.audit(req.user.username,'settings-update','system',{fields:Object.keys(req.body)});res.json(settings);});
 app.get('/api/admin/state',(_req,res)=>res.json({users:store.listUsers().map(u=>({...u,meterNodes:store.db.prepare('SELECT node_id FROM meter_allowlist WHERE user_id=?').all(u.id).map(n=>n.node_id)})),nodes:store.inventory(),meterNodes:store.meter.nodes()}));
 app.get('/api/admin/audit',(req,res)=>res.json(store.auditPage(req.query.cursor)));
 app.get('/api/admin/usage',(_req,res)=>res.json({users:store.meter.users(),nodes:store.meter.nodes()}));
 app.get('/api/admin/nodes/status',(_req,res)=>res.json({nodes:store.health.nodes(),checkIntervalMinutes:store.getSettings().healthCheckMinutes}));
 app.get('/api/admin/usage/users/:id',(req,res)=>{const u=store.getUser(req.params.id);if(!u||u.role!=='user')return res.sendStatus(404);res.json({id:u.id,username:u.username,displayName:u.display_name,...store.meter.usage(u.id)});});
 app.get('/api/admin/usage/nodes/:id',(req,res)=>{const data=store.meter.nodeUsage(req.params.id);if(!data)return res.sendStatus(404);res.json(data);});
 app.post('/api/admin/meter/users/:id/enroll',(req,res)=>{try{store.meter.allowUser(req.body?.nodeId,req.params.id);store.audit(req.user.username,'meter-enroll',req.params.id);res.json({ok:true});}catch{res.status(400).json({error:'用户或节点授权无效'});}});
 app.post('/api/admin/users',async(req,res)=>{
  if(!checkGrants(req.body?.grants))return res.status(400).json({error:'节点权限无效'});
  if(typeof req.body?.username!=='string')return res.status(400).json({error:'账号格式无效'});
  if(store.findUser(req.body.username))return res.status(409).json({error:'账号已存在'});
  const id=await store.createUser(req.body?.username,req.body?.password,req.body.grants,'user',req.body);
  store.audit(req.user.username,'user-create',id);res.status(201).json({id});
 });
 app.put('/api/admin/users/:id',(req,res)=>{
  const u=store.getUser(req.params.id);if(!u||u.role==='admin')return res.status(400).json({error:'只能修改普通用户'});
  if(typeof req.body?.enabled!=='boolean'||!checkGrants(req.body.grants))return res.status(400).json({error:'权限数据无效'});
  store.updateUser(u.id,req.body);store.audit(req.user.username,'user-access',u.id,{fields:Object.keys(req.body).filter(k=>k!=='password')});res.json({ok:true});
 });
 app.post('/api/admin/users/:id/password',async(req,res)=>{
  const u=store.getUser(req.params.id);if(!u||u.role==='admin')return res.status(400).json({error:'只能重置普通用户'});
  await store.setPassword(u.id,req.body?.password);store.requirePasswordChange(u.id);store.audit(req.user.username,'password-reset',u.id);res.json({ok:true});
 });
 app.put('/api/admin/source',(req,res)=>{
  try{store.importSource(req.body?.yaml);}catch{return res.status(400).json({error:'配置无效：请检查节点、策略组和文件大小，未保存任何更改'});}
  store.audit(req.user.username,'source-import','configuration');res.json({ok:true,nodes:store.inventory()});
 });
 app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在'}));
 // Only this directory is public; DB, source YAML and code are never served.
 app.use(express.static(publicDir,{index:'index.html',dotfiles:'deny',cacheControl:false}));
 app.use((_req,res)=>res.status(404).send('页面不存在'));
 app.use((err,_req,res,_next)=>{if(res.headersSent)return res.end();const known=err.statusCode===400||/密码需为|账号需为/.test(err.message);res.status(known?400:err.type==='entity.too.large'?413:err.type==='entity.parse.failed'?400:500).json({error:known?err.message:'请求未完成，请检查输入或联系管理员'});});
 return app;
}
